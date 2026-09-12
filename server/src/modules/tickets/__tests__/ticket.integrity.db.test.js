/*
 * Integration coverage for the conditional ticket writes. These tests never
 * reset or migrate a database: every row is uniquely named and removed by ID.
 * They require an explicitly supplied DATABASE_URL so ordinary unit-test runs
 * cannot accidentally target a developer's local database.
 */
const { enabled, describeDb } = require('../../../../testUtils/databaseSuite');

const prisma = require('../../../config/prisma');
const ticketService = require('../ticket.service');

const createdTicketIds = new Set();
const createdUserIds = new Set();
let sequence = 0;
let ticketReadBarrier = null;

// Start both competing transactions from the same authoritative row. Without
// this barrier a fast local database may schedule the second request only
// after the first commit, which tests authorization rather than a stale write.
prisma.$use(async (params, next) => {
  if (ticketReadBarrier && params.model === 'Ticket' && ['findUnique', 'findFirst'].includes(params.action)) {
    const barrier = ticketReadBarrier;
    const row = await next(params);
    barrier.reads += 1;
    if (barrier.reads === barrier.target) barrier.release();
    await barrier.ready;
    return row;
  }
  return next(params);
});

function holdTicketReads(target) {
  let release, timer;
  const ready = new Promise((resolve, reject) => {
    release = () => { clearTimeout(timer); resolve(); };
    timer = setTimeout(() => reject(new Error('Synthetic ticket read barrier timed out')), 3000);
  });
  ticketReadBarrier = { target, reads: 0, ready, release };
  return () => { release(); ticketReadBarrier = null; };
}

function unique(label) {
  sequence += 1;
  return `integrity-${label}-${Date.now()}-${process.pid}-${sequence}`;
}

async function createUser(role, label) {
  const marker = unique(label);
  const user = await prisma.user.create({
    data: { name: marker, email: `${marker}@example.invalid`, password: 'not-used-by-this-test', role, isActive: true },
  });
  createdUserIds.add(user.id);
  return user;
}

async function createTicket(createdBy, assignedToId = null, status = 'OPEN') {
  const ticket = await prisma.ticket.create({
    data: {
      title: unique('ticket'),
      description: 'Database-backed optimistic concurrency test ticket.',
      createdById: createdBy.id,
      assignedToId,
      status,
    },
  });
  createdTicketIds.add(ticket.id);
  return ticket;
}

async function runIfDatabaseAvailable(callback) {
  return callback();
}

beforeAll(async () => {
  if (enabled) await prisma.$connect();
});

afterEach(async () => {
  if (!enabled) return;
  ticketReadBarrier?.release(); ticketReadBarrier = null;
  const ticketIds = [...createdTicketIds];
  const userIds = [...createdUserIds];
  if (userIds.length) {
    await prisma.notification.deleteMany({
      where: { OR: [{ recipientId: { in: userIds } }, { actorId: { in: userIds } }] },
    });
  }
  if (ticketIds.length) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  if (ticketIds.length) await prisma.auditEvent.deleteMany({ where: { entityType: 'ticket', entityId: { in: ticketIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  expect(await prisma.ticket.count({ where: { id: { in: ticketIds } } })).toBe(0);
  expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(0);
  expect(await prisma.notification.count({ where: { recipientId: { in: userIds } } })).toBe(0);
  expect(await prisma.auditEvent.count({ where: { entityId: { in: ticketIds } } })).toBe(0);
  createdTicketIds.clear(); createdUserIds.clear();
});

afterAll(async () => prisma.$disconnect());

describeDb('database-backed ticket integrity', () => {
  test('two concurrent claims produce one success, one 409, and one assignment history row', async () => runIfDatabaseAvailable(async () => {
    const requester = await createUser('USER', 'requester');
    const agentA = await createUser('AGENT', 'agent-a');
    const agentB = await createUser('AGENT', 'agent-b');
    const ticket = await createTicket(requester);

    const releaseBarrier = holdTicketReads(2);
    const results = await Promise.allSettled([
      ticketService.assignTicket(ticket.id, agentA.id, agentA),
      ticketService.assignTicket(ticket.id, agentB.id, agentB),
    ]);
    releaseBarrier();
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected.reason).toMatchObject({ statusCode: 409 });
    const winner = results.find((result) => result.status === 'fulfilled').value;
    expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).assignedToId).toBe(winner.assignedToId);
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'ASSIGNED' } })).toBe(1);
  }));

  test('a stale priority-vs-close operation is rejected', async () => runIfDatabaseAvailable(async () => {
    const admin = await createUser('ADMIN', 'admin');
    const ticket = await createTicket(admin, null, 'RESOLVED');
    const releaseBarrier = holdTicketReads(2);
    const results = await Promise.allSettled([
      ticketService.updateTicket(ticket.id, { priority: 'HIGH' }, admin),
      ticketService.updateTicket(ticket.id, { status: 'CLOSED' }, admin),
    ]);
    releaseBarrier();
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({ statusCode: 409 });
  }));

  test('a stale unassignment-vs-reassignment operation is rejected', async () => runIfDatabaseAvailable(async () => {
    const requester = await createUser('USER', 'requester');
    const admin = await createUser('ADMIN', 'admin');
    const agentA = await createUser('AGENT', 'agent-a');
    const agentB = await createUser('AGENT', 'agent-b');
    const ticket = await createTicket(requester, agentA.id);
    const releaseBarrier = holdTicketReads(2);
    const results = await Promise.allSettled([
      ticketService.assignTicket(ticket.id, null, admin),
      ticketService.assignTicket(ticket.id, agentB.id, admin),
    ]);
    releaseBarrier();
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({ statusCode: 409 });
  }));

  test('combined closed payloads cannot bypass the separate reopen policy', async () => runIfDatabaseAvailable(async () => {
    const admin = await createUser('ADMIN', 'admin');
    const ticket = await createTicket(admin, null, 'CLOSED');
    await expect(ticketService.updateTicket(ticket.id, { status: 'OPEN', priority: 'HIGH' }, admin)).rejects.toMatchObject({ statusCode: 422 });
    expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).status).toBe('CLOSED');
  }));

  test('an uncontested claim still succeeds and records its history', async () => runIfDatabaseAvailable(async () => {
    const requester = await createUser('USER', 'requester');
    const agent = await createUser('AGENT', 'agent');
    const ticket = await createTicket(requester);
    const updated = await ticketService.assignTicket(ticket.id, agent.id, agent);
    expect(updated.assignedToId).toBe(agent.id);
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'ASSIGNED' } })).toBe(1);
  }));

  test('concurrent archive attempts yield one archive transition, one audit, and no notification', async () => runIfDatabaseAvailable(async () => {
    const requester = await createUser('USER', 'archive-requester');
    const agent = await createUser('AGENT', 'archive-agent');
    const ticket = await createTicket(requester, agent.id, 'RESOLVED');
    const releaseBarrier = holdTicketReads(2);
    const resultsPromise = Promise.allSettled([
      ticketService.archiveTicket(ticket.id, agent),
      ticketService.archiveTicket(ticket.id, agent),
    ]);
    // The barrier is released only after both archive transactions have read
    // the same scoped row, forcing the conditional archive write to arbitrate.
    await ticketReadBarrier.ready;
    releaseBarrier();
    const results = await resultsPromise;
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({ statusCode: 409 });
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'TICKET_ARCHIVED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityType: 'ticket', entityId: ticket.id, eventType: 'ticket.archived' } })).toBe(1);
    expect(await prisma.notification.count({ where: { ticketId: ticket.id } })).toBe(0);
    const archived = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(archived).toMatchObject({ status: 'RESOLVED', assignedToId: agent.id });
    expect(archived.archivedAt).toBeInstanceOf(Date);
  }));
  test('only Admin restores archived tickets and prior status/assignment are preserved', async () => runIfDatabaseAvailable(async () => {
    const requester = await createUser('USER', 'restore-requester'); const agent = await createUser('AGENT', 'restore-agent'); const admin = await createUser('ADMIN', 'restore-admin');
    const ticket = await createTicket(requester, agent.id, 'CLOSED');
    await ticketService.archiveTicket(ticket.id, agent);
    await expect(ticketService.restoreTicket(ticket.id, agent)).rejects.toMatchObject({ statusCode: 403 });
    expect((await prisma.ticket.findUnique({ where: { id: ticket.id } })).archivedAt).not.toBeNull();
    await ticketService.restoreTicket(ticket.id, admin);
    expect(await prisma.ticket.findUnique({ where: { id: ticket.id } })).toMatchObject({ archivedAt: null, status: 'CLOSED', assignedToId: agent.id });
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'TICKET_RESTORED' } })).toBe(1);
  }));
});
