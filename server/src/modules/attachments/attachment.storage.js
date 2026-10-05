const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const AppError = require('../../utils/AppError');

const UPLOAD_ROOT = process.env.ATTACHMENT_STORAGE_ROOT || path.resolve(__dirname, '../../../uploads');
const MANAGED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|pdf|docx?|xlsx?|txt|csv|zip)(?![\s\S])/i;
const identifier = (name) => crypto.createHash('sha256').update(name.toLowerCase()).digest('hex');
const unsafe = () => new AppError('Attachment storage is unsafe or unavailable', 503);
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

// No filesystem access on import. Tests inject newly created isolated roots.
function createStore(root) {
  const base = path.resolve(root);
  if (!path.isAbsolute(root) || base === path.parse(base).root) throw unsafe();
  function resolve(name) {
    if (typeof name !== 'string' || !MANAGED_NAME.test(name)) throw new AppError('Invalid attachment path', 400);
    return path.join(base, name);
  }
  async function directory(target) {
    // Check every ancestor: lstat detects Windows junctions as well as symlinks.
    let current = target;
    while (true) {
      const stat = await fs.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe();
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  async function validateRoot() {
    try { await directory(base); } catch { throw unsafe(); }
  }
  async function ensureRoot() {
    try {
      await directory(path.dirname(base));
      try { await fs.mkdir(base); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      await validateRoot();
    } catch { throw unsafe(); }
  }
  async function inspect(name) {
    const absolutePath = resolve(name);
    await validateRoot();
    try {
      const stat = await fs.lstat(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw unsafe();
      return stat;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw unsafe();
    }
  }
  async function remove(name, expected) {
    const stat = await inspect(name);
    if (!stat) return 'missing';
    if (expected === null || (expected && !sameFile(expected, stat))) throw unsafe();
    try { await fs.unlink(resolve(name)); } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw unsafe();
    }
    return 'removed';
  }
  function uploadedName(absolutePath) {
    if (typeof absolutePath !== 'string' || path.dirname(absolutePath) !== base) throw new AppError('Invalid attachment path', 400);
    const name = path.basename(absolutePath);
    resolve(name);
    return name;
  }
  async function saveStream(name, readable) {
    const absolutePath = resolve(name);
    await ensureRoot();
    let handle;
    try {
      // Exclusive creation refuses filename collisions and pre-existing links.
      handle = await fs.open(absolutePath, 'wx', 0o600);
      let size = 0;
      const counter = new Transform({ transform(chunk, encoding, callback) { size += chunk.length; callback(null, chunk); } });
      await pipeline(readable, counter, handle.createWriteStream());
      return size;
    } catch {
      if (handle) {
        await handle.close().catch(() => {});
        try { await remove(name); } catch { throw new AppError('Upload failed and storage cleanup is incomplete; operator recovery is required', 503); }
      }
      throw new AppError('Upload could not be completed', 503);
    }
  }
  async function entries(limit) {
    await validateRoot();
    const names = [];
    try {
      const dir = await fs.opendir(base);
      for await (const entry of dir) {
        names.push({ name: entry.name, directory: entry.isDirectory() });
        if (names.length > limit) throw unsafe();
      }
    } catch { throw unsafe(); }
    return names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  async function quarantine(name, expected, now) {
    if (!expected) return 'missing';
    const quarantineRoot = path.join(base, '.quarantine');
    await validateRoot();
    try {
      try { await fs.mkdir(quarantineRoot); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      await directory(quarantineRoot);
      // mkdir is exclusive; never overwrite another entry or an existing file.
      const entry = path.join(quarantineRoot, crypto.randomUUID());
      await fs.mkdir(entry);
      await directory(entry);
      await fs.writeFile(path.join(entry, 'intent.json'), JSON.stringify({
        version: 1, operation: 'quarantine', file: name, identifier: identifier(name),
        size: expected.size, modifiedAt: new Date(expected.mtimeMs).toISOString(),
        plannedAt: now.toISOString(),
      }), { flag: 'wx', mode: 0o600 });
      const current = await inspect(name);
      if (!current) return 'missing';
      if (!sameFile(current, expected)) throw unsafe();
      await directory(entry);
      await fs.rename(resolve(name), path.join(entry, name));
      return 'quarantined';
    } catch { throw unsafe(); }
  }
  return { root: base, resolve, validateRoot, ensureRoot, inspect, remove, uploadedName, saveStream, entries, quarantine };
}

module.exports = { createStore, store: createStore(UPLOAD_ROOT), UPLOAD_ROOT, MANAGED_NAME, identifier };
