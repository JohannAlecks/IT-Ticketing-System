const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { store } = require('./attachment.storage');
const { lockStorage, cleanupFiles } = require('./attachment.cleanup');
const { assertTicketVisible, assertTicketIsActive, lockActiveTicketForMutation } = require('../tickets/ticket.access');

async function listAttachments(ticketId, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);
  assertTicketVisible(ticket, user);

  return prisma.ticketAttachment.findMany({
    where: { ticketId },
    include: { uploadedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function uploadAttachment(ticketId, file, user) {
  if (!file) throw new AppError('No file was uploaded', 400);

  const storagePath = store.uploadedName(file.path);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockStorage(tx);
      const currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!currentTicket) throw new AppError('Ticket not found', 404);
      assertTicketVisible(currentTicket, user);
      await lockActiveTicketForMutation(tx, currentTicket);
      if (!await store.inspect(storagePath)) throw new AppError('Uploaded file is no longer available; please upload again', 409);
      const attachment = await tx.ticketAttachment.create({
        data: {
          ticketId,
          uploadedById: user.id,
          originalFileName: file.originalname,
          storagePath,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
        include: { uploadedBy: { select: { id: true, name: true, role: true } } },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId,
          userId: user.id,
          action: 'ATTACHMENT_ADDED',
          description: `${user.name} attached ${file.originalname}`,
        },
      });

      return attachment;
    });
  } catch (error) {
    await cleanupFiles(prisma, [{ storagePath }], { ticketId, actorUserId: user.id, operation: 'upload.rejected' });
    throw error instanceof AppError ? error : new AppError('Attachment could not be saved', 503);
  }
}

async function getAttachmentForDownload(ticketId, attachmentId, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);
  assertTicketVisible(ticket, user);

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.ticketId !== ticketId) {
    throw new AppError('Attachment not found', 404);
  }

  const absolutePath = store.resolve(attachment.storagePath);
  if (!await store.inspect(attachment.storagePath)) {
    throw new AppError('The file for this attachment is missing from storage', 404);
  }

  return { attachment, absolutePath };
}

async function deleteAttachment(ticketId, attachmentId, user) {
  let attachment;
  try { attachment = await prisma.$transaction(async (tx) => {
    await lockStorage(tx);
    const currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!currentTicket) throw new AppError('Ticket not found', 404);
    assertTicketVisible(currentTicket, user);
    assertTicketIsActive(currentTicket);
    await lockActiveTicketForMutation(tx, currentTicket);
    const current = await tx.ticketAttachment.findUnique({ where: { id: attachmentId } });
    if (!current || current.ticketId !== ticketId) throw new AppError('Attachment not found', 404);
    if (user.role !== 'ADMIN' && current.uploadedById !== user.id &&
        !(user.role === 'AGENT' && currentTicket.assignedToId === user.id)) {
      throw new AppError('You do not have permission to delete this attachment', 403);
    }
    const identity = await store.inspect(current.storagePath);
    await tx.ticketAttachment.delete({ where: { id: attachmentId } });
    await tx.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: 'ATTACHMENT_DELETED',
        description: `${user.name} removed attachment ${current.originalFileName}`,
      },
    });
    return { ...current, identity };
  }); } catch (error) {
    throw error instanceof AppError ? error : new AppError('Attachment could not be deleted', 503);
  }
  await cleanupFiles(prisma, [attachment], { ticketId, actorUserId: user.id, operation: 'attachment.delete' });
}

module.exports = { listAttachments, uploadAttachment, getAttachmentForDownload, deleteAttachment };
