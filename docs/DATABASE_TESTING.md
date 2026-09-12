# Dedicated database test verification — completed

## Preflight state and boundary (2026-09-13)

The three completed product phases are committed as `271f637` on `main`, tracking
`origin/main`. The workspace was clean before this task; `tatus` is unchanged.
No applicable AGENTS.md was found in the repository or ancestor directories.
No product source, Prisma schema, or applied migration is changed by this task.

Read-only preflight confirmed PostgreSQL at localhost:5432, current development
database `ticketing_db`, schema `public`, connected role `postgres`. All 18 local
migrations are applied and their checksums match. The dedicated `ticketing_test`
database was absent at preflight. The user subsequently explicitly approved
creating/marking it, deploying the existing 18 migrations and executing synthetic
fixtures exclusively there. Those approved operations are now complete.

The development database has changed legitimately since the old three-phase
report; its old row counts are not treated as the current baseline. A fresh
read-only fingerprint of all 20 application tables was captured for comparison
during final preparation and subsequent approved verification. No row values or
connection credentials are included in this document.

## Inventory and risk assessment

There were 46 existing backend suites: 11 database suites and 35 non-database
suites (unit, mocked service/route, and synthetic filesystem/HTTP). A new guard
suite brings the total to 47. Current database cases prepared for execution:

| Suite alias | Cases | Principal coverage |
| --- | ---: | --- |
| lifecycle | 19 | Admin authorization, self-protection, deactivation/reactivation, demotion, assignment races, JWT/account checks, rollback |
| notifications | 3 | Ownership, optional versus mandatory preferences, deduplication, concurrent writes, inactive recipients, read/unread |
| knowledge | 5 | Author/visibility, workflow transitions, optimistic concurrency, feedback uniqueness, audit rollback |
| sla | 7 | Milestones, pause/resume, reopening, due-soon/breach concurrency and deduplication, archive exclusion |
| csat | 7 | Ownership, edit window/versioning, concurrent submissions, reopening, attribution, archive eligibility, reports |
| personal | 8 | Views/shortcuts ownership, limits, normalization, versions, reorder, deferred constraints, rollback/cascades |
| watchers | 8 | Watch/unwatch ordering, ownership/assignment, archive, preferences, inactive users, join-only cascades |
| departments | 8 | Normalization, legacy preservation, active selection, merge/rollback, versions, named constraints, historical snapshots |
| emailLogs | 6 | Idempotency, honest states, masking, constraints, safe errors, Admin-only API, disabled/mock provider |
| attachments | 8 | Real metadata transactions with isolated synthetic files, authorization/archive, duplicate references, rollback and recovery |
| tickets | 7 | Claims, stale updates, assignment races, closed policy, archive and Admin restoration |

All **86 database cases executed and passed**, independently and in both combined
runs. Existing non-DB
coverage supplies additional policy/role/search/validation cases. In particular,
SLA policy administration and some authorization branches retain mocked coverage;
those mocked checks are not claimed as separate physical-DB proof. The
Department migration's historical backfill was previously verified at deployment;
a fresh empty test DB cannot independently prove that historical backfill. Its
new fixture test explicitly verifies legacy preservation/assignment and does not
claim that an empty-table query proves a backfill.

Highest risks found and addressed:

- Multiple suites loaded real `.env`, hardcoded `ticketing_db`, or allowed a
  non-test-database bypass. Those paths were removed.
- Core ticket tests silently returned when unavailable and could appear green
  without running. They now use explicit suite gating and fail-closed setup.
- Core race synchronization previously released requests before database reads;
  barriers now hold completed reads before writes, with a bounded deadline.
- Some direct constraint assertions accepted any error. Department and shortcut
  tests now require the intended named CHECK/recognized PostgreSQL wrapper and
  verify stored state after rejection. Service tests keep domain-error assertions.
- Missing cleanup assertions were added for notifications, knowledge and tickets.
  Cleanup remains scoped to each suite's generated IDs, not roles/dates/statuses.
- Three empty synthetic directories were created merely by Jest collection.
  Fixture allocation now occurs in beforeAll, not module evaluation. The three
  positively identified empty directories (1rwkIb, OuoxgH, vvg27z suffixes) were
  removed non-recursively after checking their exact temporary parent and that
  they were empty and not reparse points. No other local files were deleted.

## Safety architecture

`server/testUtils/databaseGuard.js` requires all of:

1. NODE_ENV=test and explicit RUN_DB_TESTS=true.
2. TEST_DATABASE_URL supplied independently of development dotenv loading.
3. Exact database `ticketing_test`, hostname `localhost`, port 5432, schema public.
   A substring such as production_test is not accepted. Remote CI is deliberately
   unsupported rather than silently bypassing the local boundary.
4. No match to configured DEVELOPMENT_DATABASE_URL or PRODUCTION_DATABASE_URL.
5. PostgreSQL identity query confirms database/schema/loopback server/port and
   database comment `ticketing-system:disposable-integration-tests:v1`.
6. Exact complete migration ledger, successful steps/checksums, and matching
   repository SQL checksums.
7. Physical schema hash covering columns/defaults, constraints, indexes, enums,
   functions and triggers matches the checked-in test contract.

The physical contract was captured read-only from the current, checksum-verified
18-migration database. Guard unit tests verify mismatches fail closed. A future
schema change requires an explicitly reviewed contract update; never regenerate
the contract just to hide drift. Applying all 18 unchanged migrations to the new
empty test DB produced an exact physical-schema contract match.

Jest supplies dummy unit credentials, suppresses dotenv loading, disables email,
and rejects real Prisma operations until the relevant DB suite's root guard has
succeeded. The guard uses a separate read-only client. Cleanup is also blocked
if verification fails. Only manifest-listed DB suites may unlock Prisma.

The controlled runner is serial and holds a session advisory lock to exclude a
second controlled runner. After each stage it compares whole-database row
fingerprints to its initial test baseline and rechecks migrations/schema. Any
failure or residual data stops the sequence; it never performs emergency broad
deletion. Each child stage has a three-minute ceiling; Jest tests have bounded
timeouts. A killed test may leave fixtures: this is reported, not auto-purged.

Child output redacts database URLs and the configured test password. Provider
requests are blocked by the test fetch boundary; local synthetic HTTP remains
allowed. Filesystem tests use generated temporary directories, never uploads.

## Commands

From server, using privately supplied TEST_DATABASE_URL:

```powershell
npm test                    # safe non-database default
npm run test:unit           # same safe default
npm run test:db -- csat     # one named DB suite, after guard verification
npm run test:db             # all 11 DB suites
npm run test:all            # units plus DB suites
npm run test:ci             # each DB suite independently, combined twice, full
```

No test command creates, migrates, resets, truncates or seeds a database.
Legacy RUN_* flags and ALLOW_NON_TEST_DB_INTEGRATION do not grant DB access.
Do not use raw Jest or parallel ad-hoc runners for database verification.

## Approved provisioning — executed once

Approved database: `ticketing_test`, localhost:5432, public; distinct from
`ticketing_db`. Creation uses the existing local PostgreSQL administrator role
`postgres`; credentials are provided privately, never in command arguments/output.
Verified psql executable: `D:\postgresql\bin\psql.exe`.

Exact executed SQL, connected to the administrative `postgres` database:

```sql
CREATE DATABASE ticketing_test WITH TEMPLATE template0 ENCODING 'UTF8';
COMMENT ON DATABASE ticketing_test IS 'ticketing-system:disposable-integration-tests:v1';
```

After confirming the new server-side identity/comment, supply TEST_DATABASE_URL
privately with its database path set to `/ticketing_test?schema=public`, then run
from server (restore the previous process variable afterward; no .env edits):

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  npx prisma migrate deploy
  npx prisma migrate status
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

Only the existing 18 migrations ran against the new empty test database.
They include four initial SLA policy rows and the historical Department mapping
SQL (there are no existing users to map in the new DB). No separate application
seed command is proposed. Existing migrations replace a legacy enum and an FK
during normal schema evolution; no database drop/reset/truncate or deletion of
development records is proposed. No new product migration is needed.

Approval covered creation, the purpose comment, deployment of these existing
migrations, and synthetic test-fixture writes/cleanup exclusively in ticketing_test.
The verified target was passed through process-only environment variables; no
real environment file was edited. No database reset/drop/truncate or separate
seed command ran. Each migration has one successful ledger entry and one step.

## Final verification, repairs and limitations

- Safe pre-deployment `npm test`: **521 passed, 36 suites passed**. A subsequent
  wrapper-classification regression adds one non-DB case, verified in the full run.
- Independent DB suites: all 11 passed, with exact counts in the inventory table.
- Combined run 1: **86 passed, 11 suites passed**, 13.074 seconds.
- Combined run 2: **86 passed, 11 suites passed**, 13.382 seconds.
- Complete backend: **608 passed, 47 suites passed**, 16.956 seconds
  (522 non-DB + 86 DB). Zero skipped, pending or todo cases in these runs.
- `npm run test:ci` exited 0. After every independent suite, each combined run
  and the full run, the runner reported `fixtureBaselineRestored: true` and
  reverified the exact migration ledger and physical schema.
- Prisma validation and read-only applied-migration checksum checks passed.
- Final redacted scan: 29 changed text files, no likely real credentials; 15
  reviewed dummy/fixture matches excluded, including four Jest setup placeholders.
- Final `git diff --check` passed. Git has 17 modified and 12 untracked files,
  all unstaged, on `main` at `271f637`; no schema/migration or `tatus` diff.
- Development 20-table before/after fingerprint:
  `588532a7b6824f17fbafd3a814635a3adb1cdff5b7350c9bc4550eeb0c8bc90d`.
- Test 20-table post-migration/final fingerprint:
  `7bcc9790eaeba5c314d7891bf425ac88de3d5228248e53bfd6dbc0bed62836c7`.
  Only `sla_policies` is nonempty (the four migration-provided rows); all other
  application tables are empty. No synthetic fixtures remain.
- One guard compatibility repair uses `host(inet_server_addr())` instead of an
  inet-to-text cast, which returned `::1/128`; exact loopback checks remain.
- One test defect was observed: Prisma's P2010/23514 deferred-trigger wrapper
  omits the constraint name. A rollback-only diagnostic verified its exact fixed
  trigger message. The direct-constraint helper now recognizes only that specific
  combination (or an explicitly named check), with negative regression assertions.
  The focused shortcut rerun passed 8/8 before the complete successful CI rerun.
  Both the original failed run and diagnostic restored the full fixture baseline.
  Service/API failure remained a sanitized 409, and all mutated rows rolled back.
- No product defects have been demonstrated by this task; changes are test-only.
- Primary-session self-review: **ship** for the intended 86-case DB verification
  scope. Reviewed fail-closed setup, scoped cleanup, bounded race interleavings,
  explicit assertions (no database-unavailable early-success path), domain-error
  handling, deferred rollback, migration drift and synthetic filesystem isolation.
  No workers or delegated reviewer were used. Remote CI is deliberately unsupported;
  the suite requires the exact approved local target. Historical migration backfill
  is not replayed against real users, and mocked policy cases remain mocked.
- Applied migrations/schema, real environment files, tatus and uploads unchanged.
  No commit, push, staging, deployment, real email or Resend call occurred.

Changed groups: Jest setup/config, server package test commands, centralized
guard/catalog contract/fingerprint/runner utilities and guard tests, all 11 DB
suite gates plus targeted assertions, synthetic attachment fixture allocation,
and this operational document. No frontend or product implementation changes.
