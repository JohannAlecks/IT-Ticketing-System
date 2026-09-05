const fs = require('fs');
const path = require('path');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { resolveUploadPath } = require('../../middleware/upload');
const { recordAudit } = require('../audit/audit.service');
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

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    // Clean up the already-written temp file since we're rejecting the request
    fs.unlink(file.path, () => {});
    throw new AppError('Ticket not found', 404);
  }
  try {
    assertTicketVisible(ticket, user);
    assertTicketIsActive(ticket);
  } catch (err) {
    fs.unlink(file.path, () => {});
    throw err;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!currentTicket) throw new AppError('Ticket not found', 404);
      assertTicketVisible(currentTicket, user);
      await lockActiveTicketForMutation(tx, currentTicket);
      const attachment = await tx.ticketAttachment.create({
        data: {
          ticketId,
          uploadedById: user.id,
          originalFileName: file.originalname,
          storagePath: path.basename(file.path), // store only the generated filename, not an absolute path
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
    // This is only the newly uploaded file; existing attachment data/files
    // are never touched when an archived-state or authorization guard rejects.
    fs.unlink(file.path, () => {});
    throw error;
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

  const absolutePath = resolveUploadPath(attachment.storagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError('The file for this attachment is missing from storage', 404);
  }

  return { attachment, absolutePath };
}

async function deleteAttachment(ticketId, attachmentId, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError('Ticket not found', 404);
  assertTicketVisible(ticket, user);

  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.ticketId !== ticketId) {
    throw new AppError('Attachment not found', 404);
  }

  // Deletion permissions, per the existing RBAC pattern:
  // - ADMIN: can delete any attachment on any ticket they can access (all tickets)
  // - AGENT: can delete attachments on tickets visible to them (checked above),
  //          but only ones they uploaded themselves, or if they're the assigned agent
  // - USER: can only delete their own uploads, on their own ticket
  const isOwnUpload = attachment.uploadedById === user.id;
  const isAssignedAgent = user.role === 'AGENT' && ticket.assignedToId === user.id;
  const canDelete = user.role === 'ADMIN' || isOwnUpload || isAssignedAgent;

  if (!canDelete) {
    throw new AppError('You do not have permission to delete this attachment', 403);
  }

  const absolutePath = resolveUploadPath(attachment.storagePath);

  await prisma.$transaction(async (tx) => {
    const currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!currentTicket) throw new AppError('Ticket not found', 404);
    assertTicketVisible(currentTicket, user);
    await lockActiveTicketForMutation(tx, currentTicket);
    await tx.ticketAttachment.delete({ where: { id: attachmentId } });
    await tx.ticketHistory.create({
      data: {
        ticketId,
        userId: user.id,
        action: 'ATTACHMENT_DELETED',
        description: `${user.name} removed attachment ${attachment.originalFileName}`,
      },
    });
  });

  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    // Missing storage is safe. Other errors leave an orphan after metadata
    // deletion, so make the partial result explicit and audit it.
    if (error.code === 'ENOENT') return;
    await recordAudit({
      eventType: 'attachment.cleanup_failed',
      entityType: 'attachment',
      entityId: attachmentId,
      actorUserId: user.id,
      metadata: { ticketId, operation: 'attachment.delete', storagePath: attachment.storagePath, error: error.message },
    });
    throw new AppError('Attachment metadata was deleted, but file cleanup failed.', 500);
  }
}

module.exports = { listAttachments, uploadAttachment, getAttachmentForDownload, deleteAttachment };
