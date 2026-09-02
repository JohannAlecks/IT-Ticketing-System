const bcrypt = require('bcrypt');
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
  department: true,
  createdAt: true,
};

const ASSIGNMENT_CANDIDATE_SELECT = {
  id: true,
  name: true,
  role: true,
};

async function listUsers({ role, status = 'ACTIVE' } = {}) {
  const where = {
    ...(role ? { role } : {}),
    ...(status === 'ALL' ? {} : { isActive: status === 'ACTIVE' }),
  };
  return prisma.user.findMany({
    where,
    select: SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
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
  return user;
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
  return prisma.$transaction(async (tx) => {
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

    let unassignedTickets = 0;
    const losesAssignmentEligibility = (changingActiveState && !nextIsActive) ||
      (changingRole && target.role !== 'USER' && nextRole === 'USER');
    if (losesAssignmentEligibility) {
      const assigned = await tx.ticket.findMany({
        where: { assignedToId: id, status: { notIn: ['RESOLVED', 'CLOSED'] } },
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

    const user = await tx.user.update({
      where: { id },
      data: { ...(changingRole && { role: nextRole }), ...(changingActiveState && { isActive: nextIsActive }) },
      select: SAFE_SELECT,
    });

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

    return { user, unassignedTickets };
  }, { isolationLevel: 'Serializable' });
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
