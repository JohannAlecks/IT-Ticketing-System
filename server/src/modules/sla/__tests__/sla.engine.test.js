const {
  milestone, aggregateState, createSnapshot, resolutionDueForPolicy, slaFilterWhere,
} = require('../sla.engine');

const origin = new Date('2026-09-08T00:00:00.000Z');
const policy = { id: 'policy', name: 'Medium', isActive: true, firstResponseMinutes: 60, resolutionMinutes: 120, dueSoonMinutes: 15 };

function ticket(overrides = {}) {
  return {
    id: 'ticket', status: 'IN_PROGRESS', archivedAt: null, createdAt: origin,
    ...createSnapshot(policy, origin),
    ...overrides,
  };
}

test('creates a snapshot from its explicit creation origin and keeps negative overdue time', () => {
  const snapshot = createSnapshot(policy, origin);
  expect(snapshot.firstResponseDueAt).toEqual(new Date('2026-09-08T01:00:00.000Z'));
  expect(milestone(ticket(), 'firstResponse', new Date('2026-09-08T01:00:05.000Z'))).toMatchObject({ state: 'BREACHED', remainingSeconds: -5 });
});

test('a paused resolution freezes its countdown but a recorded breach remains breached', () => {
  const pausedAt = new Date('2026-09-08T01:30:00.500Z');
  const paused = ticket({ resolutionPausedAt: pausedAt });
  expect(milestone(paused, 'resolution', new Date('2026-09-09T01:45:00.000Z'))).toMatchObject({ state: 'PAUSED', remainingSeconds: 1799 });
  expect(milestone({ ...paused, resolutionBreachedAt: new Date('2026-09-08T01:00:00.000Z') }, 'resolution', new Date('2026-09-08T01:45:00.000Z')).state).toBe('BREACHED');
});

test('aggregate priority is breached, due soon, paused, then on track', () => {
  const now = new Date('2026-09-08T00:50:00.000Z');
  expect(aggregateState(ticket({ resolutionPausedAt: now }), now)).toBe('DUE_SOON');
  expect(aggregateState(ticket({ firstRespondedAt: now, resolutionPausedAt: now }), now)).toBe('PAUSED');
  expect(aggregateState(ticket({ firstResponseBreachedAt: now, resolutionPausedAt: now }), now)).toBe('BREACHED');
});

test('persisted priority targets include completed pauses only at millisecond precision', () => {
  const due = resolutionDueForPolicy(ticket({ resolutionPausedAt: new Date('2026-09-08T00:10:00.250Z'), resolutionPausedMilliseconds: 1001 }), { ...policy, resolutionMinutes: 180 }, new Date('2026-09-08T00:11:00.750Z'));
  expect(due).toEqual(new Date('2026-09-08T03:00:01.001Z'));
});

test.each(['RESOLVED', 'CLOSED'])('terminal %s and archived tickets have no active incomplete SLA', (status) => {
  expect(aggregateState(ticket({ status }), new Date('2026-09-10'))).toBe('NOT_APPLICABLE');
  expect(aggregateState(ticket({ archivedAt: origin }), new Date('2026-09-10'))).toBe('NOT_APPLICABLE');
  expect(milestone(ticket({ status }), 'firstResponse').state).toBe('NOT_APPLICABLE');
});
test('exact deadline and due-soon boundary use server time', () => {
  expect(milestone(ticket(), 'firstResponse', new Date('2026-09-08T00:45:00Z')).state).toBe('DUE_SOON');
  expect(milestone(ticket(), 'firstResponse', new Date('2026-09-08T01:00:00Z')).state).toBe('DUE_SOON');
  expect(createSnapshot({ ...policy, isActive: false }, origin)).toBeNull();
  expect(milestone({}, 'firstResponse')).toBeNull();
});

test('database predicates keep recorded breaches in BREACHED and exclude them from DUE_SOON', () => {
  const now = new Date('2026-09-08T02:00:00.000Z');
  expect(slaFilterWhere('BREACHED', now)).toEqual(expect.objectContaining({ AND: expect.any(Array) }));
  expect(JSON.stringify(slaFilterWhere('BREACHED', now))).toContain('firstResponseBreachedAt');
  expect(JSON.stringify(slaFilterWhere('DUE_SOON', now))).toContain('NOT');
});
