const AppError = require('../../utils/AppError');
const { store: defaultStore, MANAGED_NAME, identifier } = require('./attachment.storage');

const INVENTORY_LIMIT = 10000;
// All attachment publication and cleanup uses this transaction-scoped lock.
async function lockStorage(tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(73521, 3)::text`;
}
async function references(tx, store) {
  const rows = await tx.ticketAttachment.findMany({ select: { storagePath: true }, take: INVENTORY_LIMIT + 1 });
  if (rows.length > INVENTORY_LIMIT) throw new AppError('Attachment inventory exceeds the safe operation limit', 503);
  const names = new Set();
  for (const row of rows) {
    // Fail closed for legacy/malformed aliases instead of risking a live file.
    store.resolve(row.storagePath);
    names.add(row.storagePath.toLowerCase());
  }
  return names;
}
async function safeFailureAudit(prisma, context, name) {
  try {
    await prisma.auditEvent.create({ data: {
      eventType: 'attachment.cleanup_failed', entityType: 'attachment',
      entityId: context.attachmentId, actorUserId: context.actorUserId,
      requestId: context.requestId,
      metadata: { operation: context.operation, ticketId: context.ticketId,
        identifier: identifier(name), category: 'STORAGE_CLEANUP_INCOMPLETE', recovery: 'ORPHAN_SCAN' },
    } });
  } catch {
    // No raw driver errors, physical paths, or user filenames in fallback logs.
    console.warn('Attachment cleanup incomplete; recovery audit unavailable');
  }
}
async function cleanupFiles(prisma, items, context, store = defaultStore) {
  let failures = 0;
  for (const item of items) {
    try {
      await prisma.$transaction(async (tx) => {
        await lockStorage(tx);
        const refs = await references(tx, store);
        store.resolve(item.storagePath);
        if (refs.has(item.storagePath.toLowerCase())) return;
        await store.remove(item.storagePath, item.identity);
      });
    } catch {
      failures += 1;
      await safeFailureAudit(prisma, { ...context, attachmentId: item.id }, item.storagePath);
    }
  }
  if (failures) throw new AppError(context.operation === 'upload.rejected'
    ? 'Upload was rejected, but storage cleanup is incomplete. Operator recovery is required.'
    : 'Metadata changes completed, but attachment storage cleanup is incomplete. Operator recovery is required.', 503);
}

async function scanOrphans({ prisma, store = defaultStore, execute = false, writersStopped = false,
  graceHours = 24, batch = 100, now = new Date() }) {
  if (!Number.isInteger(graceHours) || graceHours < 1 || graceHours > 8760 ||
      !Number.isInteger(batch) || batch < 1 || batch > 500 || (execute && !writersStopped)) {
    throw new AppError('Invalid cleanup options; execute requires stopped writers', 400);
  }
  const summary = { mode: execute ? 'execute' : 'dry-run', scanned: 0, referenced: 0, recent: 0,
    ignored: 0, eligible: 0, selected: [], quarantined: 0, missing: 0, failed: 0, exitCode: 0 };
  // Inventory is bounded and complete before any mutation. No archive filter.
  const refs = await references(prisma, store);
  const names = await store.entries(INVENTORY_LIMIT);
  const candidates = [];
  for (const { name, directory } of names) {
    summary.scanned += 1;
    if (directory || !MANAGED_NAME.test(name)) { summary.ignored += 1; continue; }
    if (refs.has(name.toLowerCase())) { summary.referenced += 1; continue; }
    let stat;
    try { stat = await store.inspect(name); } catch { summary.failed += 1; continue; }
    if (!stat) { summary.missing += 1; continue; }
    // Both timestamps protect recent publication/copy; never read file contents.
    if (Math.max(stat.mtimeMs, stat.ctimeMs) > now.getTime() - graceHours * 3600000) {
      summary.recent += 1; continue;
    }
    summary.eligible += 1;
    if (candidates.length < batch) candidates.push({ name, stat });
  }
  summary.selected = candidates.map(({ name }) => identifier(name));
  if (execute) {
    for (const { name, stat } of candidates) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          await lockStorage(tx);
          const currentRefs = await references(tx, store);
          if (currentRefs.has(name.toLowerCase())) return 'referenced';
          return store.quarantine(name, stat, now);
        });
        summary[result] += 1;
      } catch {
        summary.failed += 1;
        await safeFailureAudit(prisma, { operation: 'orphan.quarantine' }, name);
      }
    }
  }
  summary.exitCode = summary.failed ? 1 : 0;
  return summary;
}
module.exports = { lockStorage, references, cleanupFiles, scanOrphans };
