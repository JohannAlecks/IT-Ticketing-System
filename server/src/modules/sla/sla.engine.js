const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING'];
const TERMINAL_STATUSES = ['RESOLVED', 'CLOSED'];
const TIME_MODEL = '24/7 elapsed time';
const SLA_STATES = ['NOT_APPLICABLE', 'ON_TRACK', 'DUE_SOON', 'BREACHED', 'PAUSED', 'MET', 'COMPLETED_BREACHED'];
const SLA_HISTORY_DESCRIPTIONS = [
  'SLA first response completed', 'SLA first response breached',
  'SLA resolution completed', 'SLA resolution breached', 'SLA resolution reopened',
  'SLA resolution paused', 'SLA resolution resumed', 'SLA deadlines recalculated',
];
const snapshotSelect = Object.fromEntries([
  'slaPolicyId', 'slaPolicyName', 'slaDueSoonMinutes', 'firstResponseDueAt',
  'firstRespondedAt', 'firstResponseBreachedAt', 'resolutionDueAt',
  'resolutionCompletedAt', 'resolutionBreachedAt', 'resolutionPausedAt', 'pendingReason',
].map((field) => [field, true]));

function addMinutes(origin, minutes) {
  return new Date(new Date(origin).getTime() + minutes * 60_000);
}

function addMilliseconds(origin, milliseconds) {
  return new Date(new Date(origin).getTime() + milliseconds);
}

function secondsBetween(later, earlier) {
  return Math.floor((new Date(later).getTime() - new Date(earlier).getTime()) / 1000);
}

function incompleteState({ dueAt, completedAt, breachedAt, pausedAt, dueSoonMinutes, now }) {
  if (completedAt) return breachedAt || new Date(completedAt).getTime() > new Date(dueAt).getTime() ? 'COMPLETED_BREACHED' : 'MET';
  // A breach is a recorded outcome.  Extending a deadline later must never
  // make an already-breached milestone look healthy again.
  if (breachedAt || new Date(pausedAt || now).getTime() > new Date(dueAt).getTime()) return 'BREACHED';
  if (pausedAt) return 'PAUSED';
  const remainingSeconds = secondsBetween(dueAt, now);
  return remainingSeconds <= dueSoonMinutes * 60 ? 'DUE_SOON' : 'ON_TRACK';
}

function milestone(ticket, kind, now = new Date()) {
  if (!ticket?.slaPolicyId) return null;
  const isResponse = kind === 'firstResponse';
  const dueAt = isResponse ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  const completedAt = isResponse ? ticket.firstRespondedAt : ticket.resolutionCompletedAt;
  const breachedAt = isResponse ? ticket.firstResponseBreachedAt : ticket.resolutionBreachedAt;
  if (!dueAt) return null;
  const pausedAt = isResponse ? null : ticket.resolutionPausedAt;
  if ((ticket.archivedAt || TERMINAL_STATUSES.includes(ticket.status)) && !completedAt) {
    return { state: 'NOT_APPLICABLE', dueAt: new Date(dueAt), remainingSeconds: 0, completedAt: null, paused: false };
  }
  const state = incompleteState({ dueAt, completedAt, breachedAt, pausedAt, dueSoonMinutes: ticket.slaDueSoonMinutes, now });
  // Resolution time freezes at the pause instant.  The due date is extended
  // when resumed, but showing the frozen value also makes a persisted pause
  // correct before that transition is written.
  const clock = pausedAt && !completedAt ? pausedAt : now;
  return {
    state,
    dueAt: new Date(dueAt),
    remainingSeconds: completedAt ? 0 : secondsBetween(dueAt, clock),
    completedAt: completedAt ? new Date(completedAt) : null,
    paused: Boolean(pausedAt),
  };
}

function aggregateState(ticket, now = new Date()) {
  if (!ticket?.slaPolicyId || ticket.archivedAt || TERMINAL_STATUSES.includes(ticket.status)) return 'NOT_APPLICABLE';
  const states = [milestone(ticket, 'firstResponse', now), milestone(ticket, 'resolution', now)]
    .filter((item) => item && !['MET', 'COMPLETED_BREACHED'].includes(item.state))
    .map((item) => item.state);
  if (!states.length) return 'NOT_APPLICABLE';
  for (const state of ['BREACHED', 'DUE_SOON', 'PAUSED', 'ON_TRACK']) if (states.includes(state)) return state;
  return 'NOT_APPLICABLE';
}

function createSnapshot(policy, createdAt = new Date()) {
  if (!policy || !policy.isActive) return null;
  return {
    slaPolicyId: policy.id,
    slaPolicyName: policy.name,
    slaFirstResponseMinutes: policy.firstResponseMinutes,
    slaResolutionMinutes: policy.resolutionMinutes,
    slaDueSoonMinutes: policy.dueSoonMinutes,
    firstResponseDueAt: addMinutes(createdAt, policy.firstResponseMinutes),
    firstResponseDueSoonAt: addMinutes(createdAt, policy.firstResponseMinutes - policy.dueSoonMinutes),
    resolutionCycleStartedAt: new Date(createdAt),
    resolutionDueAt: addMinutes(createdAt, policy.resolutionMinutes),
    resolutionDueSoonAt: addMinutes(createdAt, policy.resolutionMinutes - policy.dueSoonMinutes),
    resolutionPausedSeconds: 0,
    resolutionPausedMilliseconds: 0,
  };
}

function resolutionDueForPolicy(ticket, policy) {
  const origin = ticket.resolutionCycleStartedAt || ticket.createdAt;
  const accumulated = ticket.resolutionPausedMilliseconds ?? (ticket.resolutionPausedSeconds || 0) * 1000;
  // Persisted deadlines include completed pauses only. An open pause freezes
  // the evaluation clock and is added exactly once when resumed.
  return addMilliseconds(addMinutes(origin, policy.resolutionMinutes), accumulated);
}

function staffPayload(ticket, now = new Date()) {
  if (!ticket?.slaPolicyId) return null;
  return {
    serverNow: new Date(now).toISOString(), timeModel: TIME_MODEL, policyName: ticket.slaPolicyName,
    firstResponse: milestone(ticket, 'firstResponse', now),
    resolution: milestone(ticket, 'resolution', now),
    pendingReason: ticket.pendingReason || null,
  };
}

function requesterPayload(ticket, now = new Date()) {
  if (!ticket?.slaPolicyId || ticket.archivedAt || !ACTIVE_STATUSES.includes(ticket.status)) return null;
  return {
    serverNow: new Date(now).toISOString(), timeModel: TIME_MODEL,
    firstResponse: { dueAt: ticket.firstResponseDueAt ? new Date(ticket.firstResponseDueAt) : null, completedAt: ticket.firstRespondedAt ? new Date(ticket.firstRespondedAt) : null },
    requesterMessage: ticket.firstRespondedAt ? 'Support is currently reviewing this request.' : 'Expected first response by the shown time.',
  };
}

function slaFilterWhere(state, now = new Date()) {
  const active = { archivedAt: null, status: { in: ACTIVE_STATUSES }, slaPolicyId: { not: null } };
  const firstIncomplete = { firstRespondedAt: null };
  const resolutionIncomplete = { resolutionCompletedAt: null };
  const breached = { OR: [
    { AND: [firstIncomplete, { OR: [{ firstResponseBreachedAt: { not: null } }, { firstResponseDueAt: { lt: now } }] }] },
    { AND: [resolutionIncomplete, { OR: [{ resolutionBreachedAt: { not: null } }, { AND: [{ resolutionPausedAt: null }, { resolutionDueAt: { lt: now } }] }] }] },
  ] };
  const dueSoon = { OR: [
    { AND: [firstIncomplete, { firstResponseDueSoonAt: { lte: now } }] },
    { AND: [resolutionIncomplete, { resolutionPausedAt: null }, { resolutionDueSoonAt: { lte: now } }] },
  ] };
  if (state === 'BREACHED') return { AND: [active, breached] };
  if (state === 'DUE_SOON') return { AND: [active, { NOT: breached }, dueSoon] };
  const paused = { AND: [resolutionIncomplete, { resolutionPausedAt: { not: null } }] };
  if (state === 'PAUSED') return { AND: [active, { NOT: breached }, { NOT: dueSoon }, paused] };
  return { AND: [active, { NOT: breached }, { NOT: dueSoon }, { NOT: paused }, { OR: [firstIncomplete, resolutionIncomplete] }] };
}

module.exports = {
  ACTIVE_STATUSES, TERMINAL_STATUSES, TIME_MODEL, SLA_STATES, SLA_HISTORY_DESCRIPTIONS, snapshotSelect, addMinutes, addMilliseconds,
  secondsBetween, milestone, aggregateState, createSnapshot, resolutionDueForPolicy,
  staffPayload, requesterPayload, slaFilterWhere,
};
