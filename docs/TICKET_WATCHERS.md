# Ticket Watchers

## Policy and API

Watching is personal, self-service, and never grants access, assignment, edit
permission, workload, SLA ownership, or CSAT attribution. USER sees their own
tickets; AGENT sees their assigned or unassigned tickets; ADMIN uses existing
Admin access. Inactive/unverified accounts cannot change watching state.

Authenticated endpoints, with strict UUIDs, no query parameters and empty bodies:

- `GET /api/tickets/:id/watching`
- `POST /api/tickets/:id/watch`
- `DELETE /api/tickets/:id/watch`

All return the existing envelope with only `data.isWatching`. Missing and
inaccessible tickets return 404; invalid input returns 422. Active Watch and
authorized Unwatch are idempotent. Account and ticket row locks serialize
membership mutations against account changes and public ticket mutations.
Database failures are mapped to safe conflict/unavailable errors.

Archived tickets retain joins and allow authorized Unwatch, but reject Watch
with 409. Archive/restore does not notify watchers or change memberships.
Deactivation retains joins; reactivation still requires current role/access.
No watcher list, emails, count, public history, or per-watch audit noise is added.

## Filtering and client state

`watchedByMe=true` intersects ordinary authorization, active/archive scope,
other structured filters, transient search, pagination and stable sorting.
False/omitted means no watcher restriction. It never accepts a watcher ID.
Saved Views persist only Boolean `watchedByMe`; shortcuts can point to these
views. Existing views remain valid. Global Search behavior is unchanged.

Ticket detail has a keyboard-accessible Watch/Stop watching control, loading,
retry and generic failure messages. Archived non-watchers see an explanation.
The control uses pessimistic saves (no optimistic rollback). A synchronous guard
blocks duplicate clicks. Data is account/role/ticket scoped, polled every 30
seconds, refetched on focus and aborted/removed by existing protected-cache
logout handling. Late mutations cannot populate or invalidate another account.
Mutations refresh watching state, ticket detail, ticket lists, Saved Views and
notification queries. No watcher state is persisted in browser storage.

## Notifications

The existing transactional writer handles `TICKET_WATCHED_UPDATE`. Optional
`ticketWatchedUpdates` is enabled by default for all roles and uses the existing
Settings/API preference flow. Preferences affect future delivery only.

Events: public staff replies, public requester replies to staff watchers,
status/priority changes (including reopen/resolution), assignment/unassignment.
One status+priority mutation produces one generic watched update. Comment IDs
and persisted history IDs provide stable event-specific deduplication keys.

Excluded: actor, inactive/unverified accounts, inaccessible current roles,
opted-out watchers, and recipients whose equivalent domain alert survived its
preference checks. A domain opt-out can still allow a watched update when that
separate preference is enabled. Watchers load in keyset batches of 200; account,
preference and ticket access are batch checked again at the only writer.

Copy is generic, without descriptions, comment bodies, internal notes, CSAT,
emails or attachments. Internal notes, SLA internals, personal preference
changes, search, watcher membership and archive/restore do not fan out. No email,
push, SMS, scheduler or second notification system is introduced.

## Additive migration gate

`20260912000000_add_ticket_watchers` was explicitly authorized and applied once
on 2026-09-11 to `ticketing_db`, `localhost:5432`, schema `public`. All 16
migrations are current and their stored checksums match local SQL. PostgreSQL
catalog inspection verified the enum, enabled preference default, all four join
columns, primary key, unique pair, lookup index and both cascading foreign keys.

Operations:

- Extend `NotificationType` with `TICKET_WATCHED_UPDATE`.
- Add `notification_preferences.ticketWatchedUpdates BOOLEAN NOT NULL DEFAULT true`.
- Create `ticket_watchers`: `id TEXT` (Prisma UUID), `ticketId TEXT`, `userId TEXT`,
  all non-null, and `createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- Primary key on `id`; unique index `(ticketId,userId)`; index `(userId,createdAt)`.
  The composite unique index already supports ticket-based lookups.
- Two foreign keys to `tickets.id` and `users.id`, with explicit delete/update
  cascades limited to these personal join rows.
- Prisma reverse relations only on Ticket/User; no columns on those tables.

No destructive SQL, existing-data deletion, fabricated watchers or backfill.
Existing tickets, users and notifications are untouched. Existing preference
rows acquire the new enabled default without changing their other preferences.

## Verification and approval workflow

Safe pre-migration checks: Prisma format/validate/generate, mocked backend suites,
frontend tests/build, whitespace and redacted changed-file secret checks.

Database integration suite is deliberately opt-in:
`server/src/modules/watchers/__tests__/watcher.integration.test.js`.
It requires the approved local target and exactly one completed watcher migration.
Only after explicit migration approval, run from `server`:

```powershell
$env:RUN_WATCHER_DB_TESTS = 'true'
npx jest src/modules/watchers/__tests__/watcher.integration.test.js --runInBand
Remove-Item Env:RUN_WATCHER_DB_TESTS
```

The suite verifies ownership/filtering, unique concurrent Watch, serialized
Watch/Unwatch, archive behavior, public/private notification contracts, stable
deduplication, preferences, current access after reactivation, indexes and
join-only cascades. UUID-prefixed fixtures are removed and zero remaining
users/tickets/watchers/notifications/views/shortcuts is asserted. It never runs
migrations or deletes pre-existing data.

After authorized deployment, confirm migration status/constraints, run the DB
suite and cleanup assertions, focused/full backend and frontend tests/build,
final safety checks, complete diff review and one primary-session self-review.
Do not claim ship until this database-dependent phase passes.

## Final verification evidence

- Migration deploy exited successfully; the watcher ledger has exactly one row
  and one successful application. No unrelated migration was applied.
- Prisma migration status: all 16 current. Validation passed. Format and client
  generation passed in the pre-migration phase; schema did not change afterward.
- Initial prepared watcher DB run: 7 passed. Review strengthened its race test
  to hold an actual service transaction open while the opposite service starts.
  Both orderings pass: Watch then Unwatch ends false; Unwatch then Watch ends
  true. Final DB coverage is 8 passing cases, including a concurrent double
  Watch that stores exactly one join.
- Final focused backend run: 167 passed in 7 suites, including all 8 DB cases.
- Complete backend run: 396 passed, 41 skipped, 31 passing suites and 6 skipped
  suites. This ran before the test-only strengthening above; affected suites
  were then rerun. No production backend repair was needed.
- The 41 skips are unrelated opt-in database tests for users, notifications,
  knowledge, personal preferences, satisfaction and SLA. Ticket-integrity DB
  tests and watcher DB tests did run. The deliberate duplicate-join rejection
  emits the expected redacted database-error signal, not a failed test.
- Prior frontend results remain applicable: focused 45 passed; full 216 passed;
  production build passed with the existing >500 kB bundle warning. No client
  files changed after migration, so these checks were not repeated. Existing
  React Router/helperText warnings are non-failing. Manual visual smoke testing
  remains outstanding; see the checklist below.
- Watcher fixture cleanup asserted zero users, tickets, watchers, notifications,
  Saved Views and shortcuts for generated fixture IDs. Independent checks show
  zero watcher-prefixed users/tickets and zero watcher joins. Database counts
  returned to the baseline: 11 users, 5 tickets, 1 notification. Four existing
  integrity-labelled users predate this migration (latest 2026-09-01) and were
  deliberately preserved, not treated as disposable fixtures.
- Cascades were tested using newly generated fixtures only: deleting the
  watching account removes its join while the ticket remains; deleting the
  fixture ticket removes its join. No historical Ticket/User relation changed.
- Full change-set inspection and one primary-session self-review: **ship**.
  No remaining implementation defect was identified. Only the DB regression
  test and this handoff documentation changed after migration approval.
- Final whitespace and redacted changed-file secret checks passed. No environment
  file changes, staged files, temporary orchestration artifacts, commits, pushes,
  application deployment or email. EMAIL_PROVIDER remains disabled.

### Complete final Git status

Branch `main`; HEAD remains `20e44af Add secure role-aware global search`.
22 modified tracked files and 12 new files; nothing staged. Tracked `tatus`
and unrelated files remain unchanged. Paths below are repository-relative.

```text
 M client/src/components/personal/savedFilters.js
 M client/src/components/tickets/TicketFilters.jsx
 M client/src/components/tickets/TicketFilters.test.jsx
 M client/src/hooks/useNotifications.js
 M client/src/pages/SettingsPage.jsx
 M client/src/pages/SettingsPage.test.jsx
 M client/src/pages/TicketDetailPage.jsx
 M client/src/pages/TicketDetailPage.test.jsx
 M client/src/query/protectedCache.js
 M server/prisma/schema.prisma
 M server/src/modules/comments/__tests__/comment.service.test.js
 M server/src/modules/comments/comment.service.js
 M server/src/modules/notifications/__tests__/notification.service.test.js
 M server/src/modules/notifications/notification.schema.js
 M server/src/modules/notifications/notification.service.js
 M server/src/modules/personal/personal.schema.js
 M server/src/modules/satisfaction/__tests__/satisfaction.routes.test.js
 M server/src/modules/sla/__tests__/sla.lifecycle.test.js
 M server/src/modules/tickets/__tests__/ticket.service.test.js
 M server/src/modules/tickets/ticket.routes.js
 M server/src/modules/tickets/ticket.schema.js
 M server/src/modules/tickets/ticket.service.js
?? client/src/api/watchers.api.js
?? client/src/components/tickets/TicketWatching.jsx
?? client/src/components/tickets/TicketWatching.test.jsx
?? client/src/hooks/useWatching.js
?? client/src/hooks/useWatching.test.jsx
?? docs/TICKET_WATCHERS.md
?? server/prisma/migrations/20260912000000_add_ticket_watchers/migration.sql
?? server/src/modules/watchers/__tests__/watcher.integration.test.js
?? server/src/modules/watchers/__tests__/watcher.routes.test.js
?? server/src/modules/watchers/__tests__/watcher.service.test.js
?? server/src/modules/watchers/watcher.routes.js
?? server/src/modules/watchers/watcher.service.js
```

## Manual smoke checklist after approval

- USER watches own active ticket; unrelated ticket is unavailable.
- AGENT watches unassigned ticket, then loses watched-list/direct access after
  another Agent receives assignment; ADMIN remains authorized.
- Watch/Unwatch using keyboard; check narrow mobile and dark-theme layout.
- Public reply creates one safe alert; internal note creates none.
- Disable watched updates in Settings; new events stop, old alerts remain.
- Combine watched filter and priority/search; save the view and add a shortcut.
- Archive retains state, disallows new watches, permits stopping; restore does
  not subscribe anyone.
- Switch account/role and retry a failed request; no prior watching state flashes.

Limitations: no list badge/count (optional), email delivery, watcher management
for other people, retention purge, or background fan-out queue. Very large
fan-outs remain bounded-query work inside the existing transaction; transaction
failure rolls back the public mutation rather than silently dropping alerts.
