jest.mock('../../../config/prisma', () => ({
  $queryRaw: jest.fn(),
  ticket: { findUnique: jest.fn(), updateMany: jest.fn() },
  ticketAttachment: { findUnique: jest.fn(), delete: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  ticketHistory: { create: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(async (callback) => callback(mockPrisma)),
}));
jest.mock('../attachment.storage', () => {
  const actual = jest.requireActual('../attachment.storage');
  const fs = require('fs'); const path = require('path'); const os = require('os');
  return { ...actual, store: actual.createStore(path.join(fs.realpathSync(os.tmpdir()), `ticketing-attachment-test-${require('crypto').randomUUID()}`)) };
});

const fs = require('fs');
const mockPrisma = require('../../../config/prisma');
const attachmentService = require('../attachment.service');
const { store } = require('../attachment.storage');
let fixtureCreated = false;
beforeAll(() => { fs.mkdirSync(store.root); fixtureCreated = true; });

const USER = { id: 'user-1', name: 'Uma User', role: 'USER' };
const TICKET = { id: 'ticket-1', createdById: USER.id, assignedToId: null };
const ATTACHMENT = {
  id: 'attachment-1',
  ticketId: TICKET.id,
  uploadedById: USER.id,
  originalFileName: 'report.txt',
  storagePath: '00000000-0000-4000-8000-000000000001.txt',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.ticket.findUnique.mockResolvedValue(TICKET);
  mockPrisma.ticketAttachment.findUnique.mockResolvedValue(ATTACHMENT);
  mockPrisma.ticketAttachment.delete.mockResolvedValue(ATTACHMENT);
  mockPrisma.ticketAttachment.findMany.mockResolvedValue([]);
  mockPrisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });
  mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
  fs.writeFileSync(store.resolve(ATTACHMENT.storagePath), 'synthetic attachment');
  jest.spyOn(fs.promises, 'unlink');
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (!fixtureCreated) return;
  const path = require('path');
  if (path.dirname(store.root) !== fs.realpathSync(require('os').tmpdir()) || !path.basename(store.root).startsWith('ticketing-attachment-test-') || fs.lstatSync(store.root).isSymbolicLink()) throw new Error('Unsafe fixture root');
  fs.rmSync(store.root, { recursive: true, force: true });
  expect(fs.existsSync(store.root)).toBe(false);
});

describe('deleteAttachment storage cleanup', () => {
  test('upload preauthorization rejects inaccessible and archived tickets without writes', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...TICKET, createdById: 'another-user' });
    await expect(attachmentService.authorizeUpload(TICKET.id, USER)).rejects.toMatchObject({ statusCode: 403 });
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...TICKET, archivedAt: new Date() });
    await expect(attachmentService.authorizeUpload(TICKET.id, USER)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.ticketAttachment.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
  });
  test('archived tickets still allow authorized attachment downloads', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...TICKET, archivedAt: new Date() });
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    await expect(attachmentService.getAttachmentForDownload(TICKET.id, ATTACHMENT.id, USER)).resolves.toEqual(expect.objectContaining({ attachment: ATTACHMENT }));
  });

  test('archived tickets reject attachment deletion before metadata/history changes', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...TICKET, archivedAt: new Date() });
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.ticketAttachment.delete).not.toHaveBeenCalled();
    expect(mockPrisma.ticketHistory.create).not.toHaveBeenCalled();
  });

  test('deletes metadata, history, and its validated storage file', async () => {
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).resolves.toBeUndefined();
    expect(mockPrisma.ticketAttachment.delete).toHaveBeenCalledWith({ where: { id: ATTACHMENT.id } });
    expect(mockPrisma.ticketHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'ATTACHMENT_DELETED' }) }));
    expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
  });

  test('treats an already-missing file as successful cleanup', async () => {
    fs.promises.unlink.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).resolves.toBeUndefined();
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  test('reports and audits a filesystem cleanup failure after metadata deletion', async () => {
    fs.promises.unlink.mockRejectedValue(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPrisma.ticketAttachment.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'attachment.cleanup_failed', entityId: ATTACHMENT.id }),
    }));
  });

  test('rejects unsafe metadata paths before deleting metadata', async () => {
    mockPrisma.ticketAttachment.findUnique.mockResolvedValue({ ...ATTACHMENT, storagePath: '..\\outside.txt' });
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticketAttachment.delete).not.toHaveBeenCalled();
    expect(fs.promises.unlink).not.toHaveBeenCalled();
  });

  test('rejects non-owner and unassigned Agent deletion without removing the file', async () => {
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, { id: 'other-agent', role: 'AGENT' })).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.delete).not.toHaveBeenCalled();
    expect(fs.existsSync(store.resolve(ATTACHMENT.storagePath))).toBe(true);
  });

  test('database failure leaves the file intact and returns a sanitized error', async () => {
    mockPrisma.ticketAttachment.delete.mockRejectedValueOnce(new Error('private database details'));
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).rejects.toMatchObject({ statusCode: 503, message: 'Attachment could not be deleted' });
    expect(fs.promises.unlink).not.toHaveBeenCalled();
    expect(fs.existsSync(store.resolve(ATTACHMENT.storagePath))).toBe(true);
  });

  test('preserves duplicate references including archived attachment rows', async () => {
    mockPrisma.ticketAttachment.findMany.mockResolvedValue([{ storagePath: ATTACHMENT.storagePath }]);
    await attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER);
    expect(fs.promises.unlink).not.toHaveBeenCalled();
    expect(mockPrisma.ticketAttachment.findMany.mock.calls[0][0]).not.toHaveProperty('where');
  });

  test('failed rejected-upload cleanup is surfaced without a raw path or error', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null);
    fs.promises.unlink.mockRejectedValueOnce(new Error('private physical path'));
    const error = await attachmentService.uploadAttachment(TICKET.id, { path: store.resolve(ATTACHMENT.storagePath) }, USER).catch((e) => e);
    expect(error.statusCode).toBe(503);
    expect(error.message).not.toMatch(/private|uploads|[A-Z]:/);
    expect(fs.existsSync(store.resolve(ATTACHMENT.storagePath))).toBe(true);
    expect(JSON.stringify(mockPrisma.auditEvent.create.mock.calls)).not.toMatch(/storagePath|physical path/);
  });

  test('an external upload path cannot trigger cleanup', async () => {
    await expect(attachmentService.uploadAttachment(TICKET.id, { path: require('path').join(require('os').tmpdir(), ATTACHMENT.storagePath) }, USER)).rejects.toMatchObject({ statusCode: 400 });
    expect(fs.promises.unlink).not.toHaveBeenCalled();
  });
});
