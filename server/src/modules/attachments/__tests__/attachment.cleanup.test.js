const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const path = require('path');
const { fixtureStore } = require('../../../../testUtils/attachmentStorage');
const { createStore, identifier } = require('../attachment.storage');
const { scanOrphans, cleanupFiles } = require('../attachment.cleanup');
const { parseOptions } = require('../../../../scripts/attachment-cleanup');

let fixture, store, prisma;
const future = () => new Date(Date.now() + 48 * 3600000);
const name = () => `${randomUUID()}.txt`;
async function file(n = name()) { await fs.writeFile(store.resolve(n), 'isolated synthetic content'); return n; }
beforeEach(() => {
  fixture = fixtureStore(); store = fixture.store;
  prisma = { ticketAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn(), auditEvent: { create: jest.fn().mockResolvedValue({}) } };
  prisma.$transaction = jest.fn((callback) => callback(prisma));
});
afterEach(() => { jest.restoreAllMocks(); fixture.dispose(); });

test('dry-run detects old orphans deterministically without reading content or writing anything', async () => {
  const a = await file(); const b = await file();
  const read = jest.spyOn(fs, 'readFile'); const rename = jest.spyOn(fs, 'rename'); const write = jest.spyOn(fs, 'writeFile');
  const result = await scanOrphans({ prisma, store, now: future() });
  expect(result).toMatchObject({ mode: 'dry-run', eligible: 2, quarantined: 0, exitCode: 0 });
  expect(result.selected).toEqual([a, b].sort().map(identifier));
  expect(read).not.toHaveBeenCalled(); expect(rename).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  expect((await fs.readdir(store.root)).sort()).toEqual([a, b].sort());
});
test('references, duplicate/case aliases and archived references are preserved without an archive filter', async () => {
  const n = await file(); prisma.ticketAttachment.findMany.mockResolvedValue([{ storagePath: n }, { storagePath: n.toUpperCase() }]);
  expect(await scanOrphans({ prisma, store, now: future(), execute: true, writersStopped: true })).toMatchObject({ referenced: 1, eligible: 0 });
  expect(prisma.ticketAttachment.findMany.mock.calls[0][0]).not.toHaveProperty('where');
  expect(await store.inspect(n)).not.toBeNull();
});
test('recent files are protected by grace period', async () => {
  await file();
  expect(await scanOrphans({ prisma, store })).toMatchObject({ recent: 1, eligible: 0 });
});
test('execute requires explicit stopped-writer acknowledgement and validates bounded options', async () => {
  for (const options of [{ execute: true }, { batch: 0 }, { batch: 501 }, { graceHours: 0 }, { graceHours: Infinity }]) {
    await expect(scanOrphans({ prisma, store, ...options })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(() => parseOptions(['--root=C:\\uploads'])).toThrow();
  expect(() => parseOptions(['--execute', '--execute'])).toThrow();
  expect(parseOptions(['--grace-hours=48', '--batch=2'])).toEqual({ graceHours: 48, batch: 2 });
});
test('quarantine is collision-free, batch-bounded, content-free and repeated execution is idempotent', async () => {
  const names = [await file(), await file(), await file()].sort();
  const opts = { prisma, store, now: future(), execute: true, writersStopped: true, batch: 2 };
  expect(await scanOrphans(opts)).toMatchObject({ eligible: 3, quarantined: 2, selected: names.slice(0, 2).map(identifier) });
  const quarantine = path.join(store.root, '.quarantine');
  const entries = await fs.readdir(quarantine); expect(entries).toHaveLength(2);
  for (const entry of entries) {
    const manifest = JSON.parse(await fs.readFile(path.join(quarantine, entry, 'intent.json'), 'utf8'));
    expect(manifest).toMatchObject({ version: 1, operation: 'quarantine', size: 26 });
    expect(JSON.stringify(manifest)).not.toContain('isolated synthetic content');
    expect(JSON.stringify(manifest)).not.toContain(store.root);
    expect(await fs.stat(path.join(quarantine, entry, manifest.file))).toBeDefined();
  }
  expect(await scanOrphans(opts)).toMatchObject({ quarantined: 1 });
  expect(await scanOrphans(opts)).toMatchObject({ quarantined: 0, eligible: 0, exitCode: 0 });
  expect(await fs.readdir(quarantine)).toHaveLength(3);
});
test('directories and unmanaged/internal names are ignored', async () => {
  await fs.mkdir(store.resolve(name())); await fs.mkdir(path.join(store.root, '.quarantine'));
  await fs.writeFile(path.join(store.root, 'operator-notes.txt'), 'synthetic');
  expect(await scanOrphans({ prisma, store, now: future() })).toMatchObject({ ignored: 3, eligible: 0 });
});
test.each(['../outside.txt', '..\\outside.txt', '/tmp/file.txt', 'C:\\outside.txt', 'a\0.txt', 'not-a-generated-name.txt', '00000000-0000-4000-8000-000000000001.txt\n', '', null])('rejects malformed path %p', async (n) => {
  expect(() => store.resolve(n)).toThrow();
});
test('exclusive upload creation preserves existing filenames and counts bytes', async () => {
  const { Readable } = require('stream'); const n = name();
  expect(await store.saveStream(n, Readable.from(['synthetic']))).toBe(9);
  await expect(store.saveStream(n, Readable.from(['replacement']))).rejects.toMatchObject({ statusCode: 503 });
  expect(await fs.readFile(store.resolve(n), 'utf8')).toBe('synthetic');
});
test('root configuration and junction/symlink ancestors are refused', async () => {
  expect(() => createStore(path.parse(store.root).root)).toThrow(); expect(() => createStore('relative')).toThrow();
  const target = path.join(store.root, 'target'); const link = path.join(store.root, 'link');
  await fs.mkdir(target); await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(createStore(link).validateRoot()).rejects.toMatchObject({ statusCode: 503 });
  await fs.mkdir(path.join(target, 'nested'));
  await expect(createStore(path.join(link, 'nested')).validateRoot()).rejects.toMatchObject({ statusCode: 503 });
});
test('hard links are refused rather than quarantined or removed', async () => {
  const a = await file(); const b = name(); await fs.link(store.resolve(a), store.resolve(b));
  await expect(store.remove(a)).rejects.toMatchObject({ statusCode: 503 });
  expect(await scanOrphans({ prisma, store, now: future(), execute: true, writersStopped: true })).toMatchObject({ failed: 2, quarantined: 0, exitCode: 1 });
});
test('missing files are idempotent and changed identities are refused', async () => {
  expect(await store.remove(name())).toBe('missing');
  const n = await file(); const identity = await store.inspect(n); await fs.appendFile(store.resolve(n), ' changed');
  await expect(store.remove(n, identity)).rejects.toMatchObject({ statusCode: 503 });
  await expect(store.remove(n, null)).rejects.toMatchObject({ statusCode: 503 });
});
test('malformed or oversized reference inventory fails closed before mutation', async () => {
  const n = await file(); prisma.ticketAttachment.findMany.mockResolvedValue([{ storagePath: `sub/../${n}` }]);
  await expect(scanOrphans({ prisma, store, execute: true, writersStopped: true })).rejects.toThrow();
  prisma.ticketAttachment.findMany.mockResolvedValue(Array.from({ length: 10001 }, () => ({ storagePath: n })));
  await expect(scanOrphans({ prisma, store })).rejects.toMatchObject({ statusCode: 503 });
  expect(await store.inspect(n)).not.toBeNull();
});
test('publication between inventory and mutation is rechecked under the database lock', async () => {
  const n = await file(); prisma.ticketAttachment.findMany.mockResolvedValueOnce([]).mockResolvedValue([{ storagePath: n }]);
  expect(await scanOrphans({ prisma, store, now: future(), execute: true, writersStopped: true })).toMatchObject({ quarantined: 0, referenced: 1 });
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  expect(await store.inspect(n)).not.toBeNull();
});
test('partial failure is nonzero, safe, recoverable and retry quarantines only the orphan', async () => {
  const n = await file();
  jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('secret physical path'));
  const options = { prisma, store, now: future(), execute: true, writersStopped: true };
  const result = await scanOrphans(options); expect(result).toMatchObject({ failed: 1, exitCode: 1, quarantined: 0 });
  expect(await store.inspect(n)).not.toBeNull();
  expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toMatch(/physical|storagePath|secret/);
  expect(await scanOrphans(options)).toMatchObject({ exitCode: 0, quarantined: 1 });
});
test('post-commit unlink failure remains available for scanner recovery', async () => {
  const n = await file(); jest.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('private storage details'));
  await expect(cleanupFiles(prisma, [{ storagePath: n }], { operation: 'attachment.delete' }, store)).rejects.toMatchObject({ statusCode: 503 });
  expect(await store.inspect(n)).not.toBeNull();
  expect(await scanOrphans({ prisma, store, now: future(), execute: true, writersStopped: true })).toMatchObject({ quarantined: 1 });
});
test('quarantine junction cannot redirect a move outside the managed root', async () => {
  const other = fixtureStore();
  try {
    const n = await file(); await fs.symlink(other.store.root, path.join(store.root, '.quarantine'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await scanOrphans({ prisma, store, now: future(), execute: true, writersStopped: true })).toMatchObject({ failed: 1, quarantined: 0, exitCode: 1 });
    expect(await store.inspect(n)).not.toBeNull(); expect(await fs.readdir(other.store.root)).toEqual([]);
  } finally { other.dispose(); }
});
