# SLA timers and escalation v1

SLA targets use **24/7 elapsed time**, including weekends and holidays. Stored
timestamps and calculations use server UTC; the interface displays dates in the
browser's locale/timezone. Business calendars, holidays, team queues, email/SMS,
external paging, and automatic scheduling are outside v1.

## Lifecycle

- New tickets snapshot the active policy for their server-selected technical
  priority. Requesters cannot submit SLA policy IDs, deadlines, or outcomes.
- Existing tickets are not backfilled. A ticket without a snapshot has no SLA and
  must not enter compliance denominators. A disabled policy leaves new tickets at
  that priority without SLA; editing policies does not rewrite existing snapshots.
- First response starts at creation and completes only on the first authorized
  public Agent/Admin reply. Internal notes, requester comments, assignments, and
  automated events do not count. Its timestamp is stable and its timer never pauses.
- Resolution completes at `RESOLVED`; subsequent `CLOSED` preserves completion.
  Reopening starts a new resolution cycle from the reopen time and retains prior
  outcomes in history. It does not reset first-response history.
- Only `PENDING` with `WAITING_FOR_REQUESTER` pauses resolution. Generic pending
  work continues timing. Returning to active work resumes timing with the exact
  recorded pause duration accounted for.
- Priority changes recalculate unfinished milestones using the new active policy,
  from creation for response and the current cycle origin for resolution, including
  recorded pauses. Completed milestones and recorded breaches are not erased. If
  the new policy is disabled, existing targets are retained.
- Archived work remains read-only and does not receive active escalations.
  Restoring a completed ticket does not restart its SLA. Terminal tickets without
  a public response are not fabricated as compliant responses; incomplete
  milestones are excluded from compliance denominators.

## Policies and permissions

| Priority | First response | Resolution | Due-soon threshold |
|---|---|---|---|
| LOW | 8 hours | 72 hours | 120 minutes |
| MEDIUM | 4 hours | 48 hours | 60 minutes |
| HIGH | 1 hour | 16 hours | 15 minutes |
| URGENT | 15 minutes | 4 hours | 3 minutes |

The additive migration inserts these defaults once; application startup does not
overwrite policies. Admins manage policy durations and enablement in Settings.
Policy edits require the current version; stale edits fail with HTTP 409 and
must be reloaded. Resolution must be at least the first-response target, and the
positive due-soon threshold must be smaller than both targets.

Requesters see only a simple response expectation for their own active tickets.
Agents see internal SLA information for their assigned tickets only. Admins see
service-wide authorized work. Internal SLA history and raw snapshot fields are
not a requester API surface. Protected caches stay account- and role-scoped;
SLA data is not stored in localStorage.

## Evaluation and notifications

After the migration is explicitly approved and applied, an operator can invoke:

```powershell
cd server
npm run sla:sweep
```

This command **writes breach milestones, audit/history records, and in-app
notifications**. It is not a read-only diagnostic. Do not use it against a
database that has not been authorized. It must exit nonzero on genuine failure
and log only operational counts/status, without ticket content or credentials.

The evaluator uses ID-keyset batches (default 100 tickets × 10 batches; maximum
100 × 20). Optional flags are `--batch-size=N`, `--max-batches=N`, and
`--after-id=CURSOR`. If `bounded` is true, continue with the returned `nextCursor`
until it is null, then start the next scheduled pass without a cursor. A full
last batch may require one empty continuation. This avoids starving later IDs;
new IDs behind the current cursor are picked up on the next full pass.
Do not discard a non-null cursor and continually restart at the beginning.

Each evaluated ticket is row-locked and re-read in a short transaction. Healthy
tickets receive no writes; breach bookkeeping preserves their activity timestamp.
Conditional writes additionally protect once-only milestones. Pauses are stored
at millisecond precision using a double-precision numeric counter (avoiding the
24.8-day overflow of a 32-bit millisecond integer). Open pauses are added to the
stored deadline exactly once, on resume.
Stable notification keys prevent repeated or concurrent runs from duplicating
alerts. First-response and resolution alerts are separate milestones.

Assigned active support staff receive applicable alerts. Active Admins additionally
receive breached urgent or work-blocking alerts, not ordinary due-soon broadcasts.
Requesters and inactive users are excluded. Due-soon alerts respect the optional
`slaDueSoon` preference; support-staff breach alerts are mandatory. Delivery is
in-app only and reuses the existing notification writer.

No permanent application interval or scheduler is installed. Once production
deployment is separately approved, an operator may use an external scheduler to
run this one-shot command approximately once per minute, with the server directory
as its working directory and credentials supplied through the deployment's secret
management. Capture exit status, alert on failures, and avoid overlapping jobs for
efficiency even though correctness must not depend on single-process execution.

## Reporting and manual acceptance

Summary shows due-soon/breached assigned workload for Agents and service-wide
counts for Admins; requesters do not get an internal SLA dashboard. Reports use
the existing secure filters and exclude inapplicable/incomplete milestones from
compliance denominators. The date filter applies to milestone completion time,
not ticket creation time. Resolution compliance counts immutable completion
events for every cycle, so reopening cannot erase an earlier result. Other
filters and Agent ownership use the current ticket dimensions/assignment.
Completed archived milestones may contribute to
historical compliance, but not active workload. A zero denominator is not 100%
compliance. Existing CSV formula-injection protection remains in place.

Before enabling scheduled evaluation, smoke-test with disposable authorized
fixtures: create each priority; post requester/internal/public staff replies;
pause/resume; resolve/close/reopen; change priority; archive/restore; run a sweep
twice; verify recipient preferences and isolation; switch accounts; inspect
light/dark styles and keyboard focus. Unit tests use fake time; database tests
must opt in explicitly and clean only their own uniquely identified fixtures.
