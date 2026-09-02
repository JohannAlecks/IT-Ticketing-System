/*
 * Opt-in Postgres proof that domain writes and recipient-scoped inbox reads
 * share the same transaction. It never migrates/resets and removes only IDs
 * created by this suite.
 */
const { randomUUID } = require('crypto');

const DEFAULT_JEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
if (process.env.DATABASE_URL === DEFAULT_JEST_DATABASE_URL) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env'), override: true });
}

function localDatabaseIsSafe() {
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    return new Set(['localhost', '127.0.0.1', '::1']).has(url.hostname) &&
      (/test/i.test(url.pathname) || process.env.ALLOW_NON_TEST_DB_INTEGRATION === 'true');
  } catch {
    return false;
  }
}

const enabled = process.env.RUN_DATABASE_INTEGRATION === 'true' || process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const describeDb = enabled && localDatabaseIsSafe() ? describe : describe.skip;
const skipReason = 'requires RUN_DATABASE_INTEGRATION=true (or RUN_DB_INTEGRATION_TESTS=true) and a local PostgreSQL test database';

describeDb(`notification inbox integration (${skipReason})`, () => {
  const prisma = require('../../../config/prisma');
  const ticketService = require('../../tickets/ticket.service');
  const notificationService = require('../notification.service');
  const ids = { users: [], tickets: [] };
  const prefix = `notification-it-${randomUUID()}`;

  async function user(role, isActive = true) {
    const record = await prisma.user.create({ data: { name: `${prefix}-${role}-${ids.users.length}`, email: `${prefix}-${randomUUID()}@example.test`, password: 'not-used', role, isActive, emailVerified: true } });
    ids.users.push(record.id);
    return record;
  }

  beforeAll(async () => prisma.$connect());
  afterAll(async () => {
    if (ids.users.length) await prisma.notification.deleteMany({ where: { recipientId: { in: ids.users } } });
    if (ids.users.length) await prisma.auditEvent.deleteMany({ where: { entityType: 'notification_preferences', entityId: { in: ids.users } } });
    if (ids.tickets.length) await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: ids.tickets } } });
    if (ids.tickets.length) await prisma.ticket.deleteMany({ where: { id: { in: ids.tickets } } });
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.$disconnect();
  });

  test('assignment creates one inbox row transactionally and another user cannot read or mark it', async () => {
    const requester = await user('USER');
    const agent = await user('AGENT');
    const admin = await user('ADMIN');
    const outsider = await user('ADMIN');
    const ticket = await prisma.ticket.create({ data: { title: `${prefix}-ticket`, description: 'Notification integration fixture.', createdById: requester.id } });
    ids.tickets.push(ticket.id);

    await ticketService.assignTicket(ticket.id, agent.id, admin);
    const agentInbox = await notificationService.listNotifications(agent, { status: 'ALL', page: 1, limit: 20 });
    expect(agentInbox.notifications).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'TICKET_ASSIGNED', ticketId: ticket.id })]));
    expect((await notificationService.listNotifications(outsider, { status: 'ALL', page: 1, limit: 20 })).notifications).toHaveLength(0);
    await expect(notificationService.setReadState(outsider, agentInbox.notifications[0].id, true)).rejects.toMatchObject({ statusCode: 404 });

    // Same assignment is a service no-op, so it cannot create a second event.
    await ticketService.assignTicket(ticket.id, agent.id, admin);
    expect(await prisma.notification.count({ where: { recipientId: agent.id, ticketId: ticket.id, type: 'TICKET_ASSIGNED' } })).toBe(1);
  });

  test('preferences suppress only future optional events per recipient while mandatory and historical rows remain', async () => {
    const optedOutAgent = await user('AGENT');
    const enabledAgent = await user('AGENT');
    const historicalId = randomUUID();

    await prisma.notification.create({
      data: {
        recipientId: optedOutAgent.id,
        type: 'TICKET_ASSIGNED',
        title: 'Historical assignment',
        message: 'Created before the preference changed.',
        dedupeKey: `${prefix}:historical:${historicalId}`,
      },
    });
    await notificationService.updateNotificationPreferences(
      optedOutAgent,
      { ticketAssigned: false, ticketPublicReply: false },
      `${prefix}:preferences`,
    );

    const assignmentEventId = randomUUID();
    await notificationService.writeNotifications(prisma, {
      entries: [
        notificationService.eventEntry({ recipientId: optedOutAgent.id, type: 'TICKET_ASSIGNED', title: 'Assigned', message: 'Optional assignment.', eventId: assignmentEventId }),
        notificationService.eventEntry({ recipientId: enabledAgent.id, type: 'TICKET_ASSIGNED', title: 'Assigned', message: 'Optional assignment.', eventId: assignmentEventId }),
      ],
    });
    // Replaying the same server event proves the existing dedupe key remains effective.
    await notificationService.writeNotifications(prisma, {
      entries: [notificationService.eventEntry({ recipientId: enabledAgent.id, type: 'TICKET_ASSIGNED', title: 'Assigned', message: 'Optional assignment.', eventId: assignmentEventId })],
    });

    await notificationService.writeNotifications(prisma, {
      entries: [notificationService.eventEntry({ recipientId: optedOutAgent.id, type: 'TICKET_PUBLIC_REPLY', title: 'Reply', message: 'Optional reply.', eventId: randomUUID() })],
    });
    await notificationService.writeNotifications(prisma, {
      entries: [notificationService.eventEntry({ recipientId: optedOutAgent.id, type: 'ACCOUNT_REACTIVATED', title: 'Account reactivated', message: 'Mandatory account alert.', eventId: randomUUID() })],
    });

    expect(await prisma.notification.count({ where: { recipientId: optedOutAgent.id, type: 'TICKET_ASSIGNED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientId: optedOutAgent.id, type: 'TICKET_PUBLIC_REPLY' } })).toBe(0);
    expect(await prisma.notification.count({ where: { recipientId: optedOutAgent.id, type: 'ACCOUNT_REACTIVATED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientId: enabledAgent.id, type: 'TICKET_ASSIGNED' } })).toBe(1);
  });
});

if (!(enabled && localDatabaseIsSafe())) {
  test.skip(`notification database integration skipped: ${skipReason}`, () => {});
}
