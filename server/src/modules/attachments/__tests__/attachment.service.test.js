jest.mock('../../../config/prisma', () => ({
  ticket: { findUnique: jest.fn(), updateMany: jest.fn() },
  ticketAttachment: { findUnique: jest.fn(), delete: jest.fn() },
  ticketHistory: { create: jest.fn() },
  auditEvent: { create: jest.fn() },
  $transaction: jest.fn(async (callback) => callback(mockPrisma)),
}));

const fs = require('fs');
const mockPrisma = require('../../../config/prisma');
const attachmentService = require('../attachment.service');

const USER = { id: 'user-1', name: 'Uma User', role: 'USER' };
const TICKET = { id: 'ticket-1', createdById: USER.id, assignedToId: null };
const ATTACHMENT = {
  id: 'attachment-1',
  ticketId: TICKET.id,
  uploadedById: USER.id,
  originalFileName: 'report.txt',
  storagePath: 'safe-generated-file.txt',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.ticket.findUnique.mockResolvedValue(TICKET);
  mockPrisma.ticketAttachment.findUnique.mockResolvedValue(ATTACHMENT);
  mockPrisma.ticketAttachment.delete.mockResolvedValue(ATTACHMENT);
  mockPrisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });
  mockPrisma.ticket.updateMany.mockResolvedValue({ count: 1 });
  jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
});

afterEach(() => jest.restoreAllMocks());

describe('deleteAttachment storage cleanup', () => {
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
    await expect(attachmentService.deleteAttachment(TICKET.id, ATTACHMENT.id, USER)).rejects.toMatchObject({ statusCode: 500 });
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
});
