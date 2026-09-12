jest.mock('../attachment.service', () => ({ listAttachments: jest.fn(), uploadAttachment: jest.fn(), getAttachmentForDownload: jest.fn() }));
jest.mock('../../audit/audit.service', () => ({ recordAudit: jest.fn() }));
const service = require('../attachment.service'); const controller = require('../attachment.controller');
const row = { id: 'attachment', originalFileName: 'synthetic.txt', storagePath: 'private physical path', fileSize: 9, mimeType: 'text/plain' };
const req = { params: { ticketId: 'ticket', attachmentId: 'attachment' }, user: { id: 'user' } };
const flush = () => new Promise(setImmediate);
beforeEach(() => jest.resetAllMocks());
test.each(['listAttachments', 'uploadAttachment'])('%s response omits storage metadata', async (method) => {
  service[method].mockResolvedValue(method === 'listAttachments' ? [row] : row);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }; const next = jest.fn();
  controller[method](req, res, next); await flush();
  expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalled();
  expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/storagePath|physical path/);
});
test('download transport error does not reveal a physical path or raw filesystem details', async () => {
  service.getAttachmentForDownload.mockResolvedValue({ attachment: row, absolutePath: 'private physical path' });
  const res = { headersSent: false, download: jest.fn((p, n, cb) => cb(new Error('private filesystem details'))) }; const next = jest.fn();
  controller.downloadAttachment(req, res, next); await flush();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, message: 'Attachment download could not be completed' }));
});
test('interrupted download destroys an already-started response instead of emitting an error body', async () => {
  service.getAttachmentForDownload.mockResolvedValue({ attachment: row, absolutePath: 'private physical path' });
  const res = { headersSent: true, destroy: jest.fn(), download: jest.fn((p, n, cb) => cb(new Error('private details'))) }; const next = jest.fn();
  controller.downloadAttachment(req, res, next); await flush();
  expect(res.destroy).toHaveBeenCalledTimes(1); expect(next).not.toHaveBeenCalled();
});
