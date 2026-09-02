/*
 * Integration coverage for the conditional ticket writes. These tests never
 * reset or migrate a database: every row is uniquely named and removed by ID.
 * They require an explicitly supplied DATABASE_URL so ordinary unit-test runs
 * cannot accidentally target a developer's local database.
 */
const DEFAULT_JEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
// jest.setup supplies a harmless fallback before modules load. Replace only
// that fallback with this server's normal local configuration; an explicitly
// supplied CI DATABASE_URL always wins.
if (process.env.DATABASE_URL === DEFAULT_JEST_DATABASE_URL) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
}
const hasExplicitDatabaseUrl = process.env.DATABASE_URL && process.env.DATABASE_URL !== DEFAULT_JEST_DATABASE_URL;

if (!hasExplicitDatabaseUrl) {
  // Jest cannot mark tests skipped after an async connection check. Keeping a
  // single explicit message makes the omission visible in local and CI logs.
  console.warn('[ticket-integrity-db] SKIPPED: set DATABASE_URL explicitly to run database-backed integrity tests.');
}

const prisma = require('../../../config/prisma');
const ticketService = require('../ticket.service');

const createdTicketIds = new Set();
const createdUserIds = new Set();
let databaseAvailable = hasExplicitDatabaseUrl;
let sequence = 0;
let ticketReadBarrier = null;

// Start both competing transactions from the same authoritative row. Without
// this barrier a fast local database may schedule the second request only
// after the first commit, which tests authorization rather than a stale write.
prisma.$use(async (params, next) => {
  if (ticketReadBarrier && params.model === 'Ticket' && params.action === 'findUnique') {
    ticketReadBarrier.reads += 1;
    if (ticketReadBarrier.reads === ticketReadBarrier.target) ticketReadBarrier.release();
    await ticketReadBarrier.ready;
  }
  return next(params);
});

function holdTicketReads(target) {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  ticketReadBarrier = { target, reads: 0, ready, release };
  return () => { ticketReadBarrier = null; };
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
  if (!databaseAvailable) return;
  return callback();
}

beforeAll(async () => {
  if (!databaseAvailable) return;
  try {
    await prisma.$queryRaw`SELECT 1`;
    const notificationTable = await prisma.$queryRaw`SELECT to_regclass('public.notifications')::text AS "table"`;
    if (!notificationTable[0]?.table) {
      databaseAvailable = false;
      console.warn('[ticket-integrity-db] SKIPPED: apply the notifications migration before running database-backed integrity tests.');
    }
  } catch (error) {
    databaseAvailable = false;
    console.warn(`[ticket-integrity-db] SKIPPED: database unavailable (${error.code || error.name}).`);
  }
});

afterEach(async () => {
  if (!databaseAvailable) return;
  const ticketIds = [...createdTicketIds];
  const userIds = [...createdUserIds];
  createdTicketIds.clear();
  createdUserIds.clear();
  if (userIds.length) {
    await prisma.notification.deleteMany({
      where: { OR: [{ recipientId: { in: userIds } }, { actorId: { in: userIds } }] },
    });
  }
  if (ticketIds.length) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

afterAll(async () => prisma.$disconnect());

describe('database-backed ticket integrity', () => {
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
    expect(await prisma.ticketHistory.count({ where: { ticketId: ticket.id, action: 'ASSIGNED' } })).toBe(1);
  }));

  test('a stale priority-vs-close operation is rejected', async () => runIfDatabaseAvailable(async () => {
    const admin = await createUser('ADMIN', 'admin');
    const ticket = await createTicket(admin, null, 'RESOLVED');
    const results = await Promise.allSettled([
      ticketService.updateTicket(ticket.id, { priority: 'HIGH' }, admin),
      ticketService.updateTicket(ticket.id, { status: 'CLOSED' }, admin),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason).toMatchObject({ statusCode: 409 });
  }));

  test('a stale unassignment-vs-reassignment operation is rejected', async () => runIfDatabaseAvailable(async () => {
    const requester = await createUser('USER', 'requester');
    const admin = await createUser('ADMIN', 'admin');
    const agentA = await createUser('AGENT', 'agent-a');
    const agentB = await createUser('AGENT', 'agent-b');
    const ticket = await createTicket(requester, agentA.id);
    const results = await Promise.allSettled([
      ticketService.assignTicket(ticket.id, null, admin),
      ticketService.assignTicket(ticket.id, agentB.id, admin),
    ]);
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
});
