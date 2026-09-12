const bcrypt = require('bcrypt');
const { departmentSelect, exposeDepartment } = require('../departments/department.projection');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { writeNotifications, eventEntry } = require('../notifications/notification.service');

const SALT_ROUNDS = 12;

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  emailVerified: true,
  ...departmentSelect,
  createdAt: true,
};

const ASSIGNMENT_CANDIDATE_SELECT = {
  id: true,
  name: true,
  role: true,
};

const operational = { archivedAt: null, status: { notIn: ['RESOLVED', 'CLOSED'] } };
async function listUsers({ role, status = 'ACTIVE', search, departmentId, missingDepartment, verification, sort = 'newest', page = 1, limit = 20 } = {}) {
  const where = {
    ...(role ? { role } : {}),
    ...(status === 'ALL' ? {} : { isActive: status === 'ACTIVE' }),
    ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(missingDepartment === 'true' ? { AND: [{ departmentId: null }] } : {}),
    ...(verification ? { emailVerified: verification === 'VERIFIED' } : {}),
  };
  const order = { name: { name: 'asc' }, newest: { createdAt: 'desc' }, oldest: { createdAt: 'asc' }, role: { role: 'asc' }, department: { departmentRecord: { name: 'asc' } } }[sort];
  const [rows, total] = await Promise.all([prisma.user.findMany({
    where,
    select: { ...SAFE_SELECT, _count: { select: { ticketsAssigned: { where: operational } } } },
    orderBy: [order, { id: 'asc' }], skip: (page - 1) * limit, take: limit,
  }), prisma.user.count({ where })]);
  return { users: rows.map(({ _count, ...user }) => ({ ...exposeDepartment(user), activeWorkload: _count?.ticketsAssigned || 0 })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function userSummary() {
  const filters = { total: {}, active: { isActive: true }, inactive: { isActive: false }, admins: { role: 'ADMIN' }, agents: { role: 'AGENT' }, users: { role: 'USER' }, unverified: { emailVerified: false }, withoutDepartment: { departmentId: null } };
  return Object.fromEntries(await Promise.all(Object.entries(filters).map(async ([key, where]) => [key, await prisma.user.count({ where })])));
}

async function userDetails(id) {
  const user = await getUserById(id);
  const { slaFilterWhere } = require('../sla/sla.engine');
  const assigned = { assignedToId: id, ...operational };
  const [activeWorkload, recentTickets, lifecycle, dueSoon, breached, csat] = await Promise.all([
    prisma.ticket.count({ where: assigned }),
    prisma.ticket.findMany({ where: { OR: [{ createdById: id }, { assignedToId: id }] }, select: { id: true, title: true, status: true, updatedAt: true, archivedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 5 }),
    prisma.auditEvent.findMany({ where: { entityType: 'user', entityId: id, eventType: { in: ['user.created', 'user.role_changed', 'user.deactivated', 'USER_REACTIVATED'] } }, select: { id: true, eventType: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 5 }),
    user.role === 'AGENT' ? prisma.ticket.count({ where: { AND: [assigned, slaFilterWhere('DUE_SOON', new Date())] } }) : null,
    user.role === 'AGENT' ? prisma.ticket.count({ where: { AND: [assigned, slaFilterWhere('BREACHED', new Date())] } }) : null,
    user.role === 'AGENT' ? prisma.ticketSatisfaction.aggregate({ where: { cycle: { assignedAgentId: id } }, _count: { rating: true }, _avg: { rating: true } }) : null,
  ]);
  return { user, activeWorkload, recentTickets, lifecycle, sla: user.role === 'AGENT' ? { dueSoon, breached } : null, csat: csat ? { count: csat._count.rating, average: csat._avg.rating } : null };
}

// Convenience endpoint used by the "Assign to" dropdown on the frontend
async function listAgents() {
  return prisma.user.findMany({
    where: { role: { in: ['AGENT', 'ADMIN'] }, isActive: true },
    select: ASSIGNMENT_CANDIDATE_SELECT,
    orderBy: { name: 'asc' },
  });
}

async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
  if (!user) throw new AppError('User not found', 404);
  return exposeDepartment(user);
}

// Admin-only: create a user directly with a specific role (e.g. an Agent)
async function createUserWithRole({ name, email, password, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  return prisma.user.create({
    data: { name, email, password: hashedPassword, role },
    select: SAFE_SELECT,
  });
}

/*
 * The only mutation policy for admin account lifecycle operations. Keeping
 * role changes and active-state transitions in this transaction prevents a
 * generic status request from bypassing deactivation cleanup or the
 * last-active-admin invariant.
 */
async function changeUserLifecycle(id, change, actor, requestId) {
  if (!actor?.id || actor.role !== 'ADMIN') throw new AppError('Administrator access required', 403);
  const keys = Object.keys(change);
  if (keys.length !== 1 || !((keys[0] === 'role' && ['ADMIN', 'AGENT', 'USER'].includes(change.role)) || (keys[0] === 'isActive' && typeof change.isActive === 'boolean'))) throw new AppError('Invalid account change', 422);
  return prisma.$transaction(async (tx) => {
    // Serialize every role/status endpoint before counting administrators.
    // READ COMMITTED then sees assignments committed while the account lock
    // was being acquired; a fixed serializable snapshot would miss those rows.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73521, 1)::text`;
    const currentActor = await tx.user.findFirst({ where: { id: actor.id, role: 'ADMIN', isActive: true, emailVerified: true }, select: { id: true } });
    if (!currentActor) throw new AppError('Administrator access required', 403);
    const target = await tx.user.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!target) throw new AppError('User not found', 404);

    const changingRole = Object.prototype.hasOwnProperty.call(change, 'role');
    const changingActiveState = Object.prototype.hasOwnProperty.call(change, 'isActive');
    const nextRole = changingRole ? change.role : target.role;
    const nextIsActive = changingActiveState ? change.isActive : target.isActive;

    if (changingRole && target.role === 'ADMIN' && nextRole !== 'ADMIN' && id === actor.id) {
      throw new AppError('Administrators cannot demote their own account', 403);
    }
    if (changingActiveState && !nextIsActive && id === actor.id) {
      throw new AppError('Administrators cannot deactivate their own account', 403);
    }
    if (changingRole && nextRole === target.role) {
      throw new AppError('This account already has that role', 409);
    }
    if (changingActiveState && nextIsActive === target.isActive) {
      throw new AppError(`This account is already ${target.isActive ? 'active' : 'inactive'}`, 409);
    }

    // Recheck while inside the write transaction. A target stops counting as
    // an active admin when it is demoted or deactivated.
    const removesActiveAdmin = target.role === 'ADMIN' && target.isActive &&
      (nextRole !== 'ADMIN' || !nextIsActive);
    if (removesActiveAdmin) {
      const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins <= 1) {
        throw new AppError(
          changingActiveState && !nextIsActive
            ? 'The last active administrator cannot be deactivated'
            : 'The last active administrator cannot be demoted',
          409
        );
      }
    }

    // Lock/update the account before scanning its assignments. Assignment
    // creation takes a shared account lock before checking eligibility.
    const user = await tx.user.update({
      where: { id },
      data: { ...(changingRole && { role: nextRole }), ...(changingActiveState && { isActive: nextIsActive }) },
      select: SAFE_SELECT,
    });
    let unassignedTickets = 0;
    const losesAssignmentEligibility = (changingActiveState && !nextIsActive) ||
      (changingRole && target.role !== 'USER' && nextRole === 'USER');
    if (losesAssignmentEligibility) {
      // Freeze qualifying ticket rows before reconciliation, so a concurrent
      // reassignment or resolution cannot be overwritten or mis-audited.
      await tx.$queryRaw`SELECT "id" FROM "tickets"
        WHERE "assignedToId" = ${id} AND "archivedAt" IS NULL
          AND "status" NOT IN ('RESOLVED', 'CLOSED')
        ORDER BY "id" FOR UPDATE`;
      const assigned = await tx.ticket.findMany({
        where: { assignedToId: id, ...operational },
        select: { id: true },
      });
      unassignedTickets = assigned.length;
      if (assigned.length) {
        await tx.ticket.updateMany({
          where: { id: { in: assigned.map((ticket) => ticket.id) } },
          data: { assignedToId: null },
        });
        await tx.ticketHistory.createMany({
          data: assigned.map((ticket) => ({
            ticketId: ticket.id,
            userId: actor.id,
            action: 'UNASSIGNED',
            description: changingActiveState && !nextIsActive
              ? `${actor.name} unassigned this ticket because ${target.name}'s account was deactivated`
              : `${actor.name} unassigned this ticket because ${target.name} no longer has an assignment-capable role`,
            metadata: changingActiveState && !nextIsActive
              ? { deactivatedUserId: id }
              : { roleChangedUserId: id, previousRole: target.role, role: nextRole },
          })),
        });
      }
    }

    const eventType = changingRole
      ? 'user.role_changed'
      : nextIsActive
        ? 'USER_REACTIVATED'
        : 'user.deactivated';
    const auditEvent = await tx.auditEvent.create({
      data: {
        eventType,
        entityType: 'user',
        entityId: id,
        actorUserId: actor.id,
        requestId,
        metadata: {
          ...(changingRole && { previousRole: target.role, role: nextRole }),
          ...(changingActiveState && { previousIsActive: target.isActive, isActive: nextIsActive }),
          ...(losesAssignmentEligibility && { unassignedTickets }),
        },
      },
    });

    if (changingActiveState && nextIsActive && !target.isActive) {
      await writeNotifications(tx, {
        actorId: actor.id,
        entries: [eventEntry({
          recipientId: id,
          type: 'ACCOUNT_REACTIVATED',
          title: 'Account reactivated',
          message: 'Your HelpDesk account has been reactivated.',
          eventId: auditEvent.id,
        })],
      });
    }

    return { user: exposeDepartment(user), unassignedTickets };
  }, { isolationLevel: 'ReadCommitted' });
}

async function updateUserRole(id, role, actor, requestId) {
  return (await changeUserLifecycle(id, { role }, actor, requestId)).user;
}

async function setUserActive(id, isActive, actor, requestId) {
  return changeUserLifecycle(id, { isActive }, actor, requestId);
}

async function deactivateUser(id, actor, requestId) {
  return changeUserLifecycle(id, { isActive: false }, actor, requestId);
}

async function reactivateUser(id, actor, requestId) {
  return (await changeUserLifecycle(id, { isActive: true }, actor, requestId)).user;
}

module.exports = {
  userSummary,
  userDetails,
  listUsers,
  listAgents,
  getUserById,
  createUserWithRole,
  changeUserLifecycle,
  updateUserRole,
  setUserActive,
  deactivateUser,
  reactivateUser,
};
