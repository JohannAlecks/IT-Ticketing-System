jest.mock('../../../config/env', () => ({ ...jest.requireActual('../../../config/env'), MAX_ATTACHMENT_SIZE_MB: 20 / 1024 / 1024 }));
jest.mock('../attachment.storage', () => {
  const actual = jest.requireActual('../attachment.storage');
  const fs = require('fs'); const path = require('path'); const os = require('os');
  const store = actual.createStore(path.join(fs.realpathSync(os.tmpdir()), `ticketing-attachment-test-${require('crypto').randomUUID()}`));
  return { ...actual, store, UPLOAD_ROOT: store.root };
});
const fs = require('fs'); const path = require('path');
const { store } = require('../attachment.storage');
const { uploadSingleFile } = require('../../../middleware/upload');
let server;
let fixtureCreated = false;
beforeAll(async () => {
  fs.mkdirSync(store.root); fixtureCreated = true;
  const app = require('express')();
  app.post('/', uploadSingleFile('file'), (req, res) => res.json({ size: req.file.size, filename: req.file.filename }));
  app.use(require('../../../middleware/errorHandler'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
});
afterEach(async () => {
  jest.restoreAllMocks();
  for (const filename of await fs.promises.readdir(store.root)) await store.remove(filename);
});
afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (!fixtureCreated) return;
  if (path.dirname(store.root) !== fs.realpathSync(require('os').tmpdir()) || !path.basename(store.root).startsWith('ticketing-attachment-test-') || fs.lstatSync(store.root).isSymbolicLink()) throw new Error('Unsafe fixture root');
  fs.rmSync(store.root, { recursive: true, force: true });
  expect(fs.existsSync(store.root)).toBe(false);
});
async function send(content, filename = 'synthetic.txt', type = 'text/plain') {
  const form = new FormData(); form.append('file', new Blob([content], { type }), filename);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json() };
}
test('normal multipart upload uses validated generated storage and exact byte count', async () => {
  const result = await send('synthetic'); expect(result.status).toBe(200); expect(result.body.size).toBe(9);
  expect(await store.inspect(result.body.filename)).not.toBeNull();
  expect(JSON.stringify(result.body)).not.toContain(store.root);
});
test('unsupported types never create a file', async () => {
  expect((await send('synthetic', 'synthetic.exe', 'application/octet-stream')).status).toBe(422);
  expect(await fs.promises.readdir(store.root)).toEqual([]);
});
test.each(['.hidden.txt', 'malformed:name.txt', 'trailing.txt.', 'long'.repeat(51) + '.txt'])('unsafe original filename never creates storage', async (filename) => {
  expect((await send('synthetic', filename)).status).toBe(422);
  expect(await fs.promises.readdir(store.root)).toEqual([]);
});
test('size rejection removes only its unpublished synthetic file through validated cleanup', async () => {
  expect((await send('synthetic'.repeat(10))).status).toBe(413);
  expect(await fs.promises.readdir(store.root)).toEqual([]);
});
test('renamed executable content fails signature checks and leaves no file', async () => {
  const result = await send('MZ synthetic', 'pretend.pdf', 'application/pdf');
  expect(result.status).toBe(422);
  expect(await fs.promises.readdir(store.root)).toEqual([]);
});
test('Multer cleanup failure is reported safely and leaves the orphan available for recovery', async () => {
  jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(new Error('private server path'));
  const result = await send('synthetic'.repeat(10));
  expect(result.status).toBe(503); expect(result.body).not.toHaveProperty('stack');
  expect(JSON.stringify(result.body)).not.toMatch(/private|server path|[A-Z]:\\/);
  expect(await fs.promises.readdir(store.root)).toHaveLength(1);
});
