# Department Administration — Phase A

## Current checkpoint: Phase A ship (2026-09-12)

The Department migration was explicitly approved and applied once to
`ticketing_db` at `localhost:5432`, schema `public`. One successful ledger row,
one applied step; all 17 migrations current and all SQL checksums match.
The approved SQL checksum below is unchanged. Physical columns, normalization
function, four checks, unique/list/membership indexes and DELETE RESTRICT FK
were inspected in PostgreSQL. Mapping: 11 users, nine empty/unassigned, two
valid users linked to two departments; no invalid links or duplicate keys.

Redacted whole-row fingerprints across all 18 pre-existing tables matched before
and after migration and after test cleanup (excluding only the newly added
User.departmentId). Legacy strings, existing users/tickets, audit, SLA, CSAT,
notifications and other historical data are unchanged. No existing data deleted.

The only post-migration repair was a direct database test assertion: PostgreSQL
23001 RESTRICT arrived as PrismaClientUnknownRequestError, not P2003. The test
now requires this exact named FK and recognized wrapper, rejects unrelated
errors, and checks both complete rows, unchanged membership and audit count.
No service, API, FK or applied migration was changed for this repair.

Final checks:
- Complete Department DB suite: 8/8 passed, including row survival, merge,
  rollback, normalization, membership and concurrency; fixture cleanup passed.
- Full backend: 457 passed, 20 skipped, 37 passing suites. Department, lifecycle,
  watcher, ticket integrity, notification and knowledge database suites enabled;
  20 separate SLA/CSAT/personal opt-in DB tests were not enabled for this phase.
- Frontend unchanged by the repair: focused 26/26 in six files from the prior
  migration run; full 249/249 in 54 files and production build passed before
  migration. These results remain valid; no unnecessary client rerun.
- Prisma validation passed; migration status current; diff check passed.
- Refreshed changed-text scan: 41 files, three recognized fixture matches,
  zero likely real credentials. No secret values printed.
- Primary-session self-review: authorization, safe projections, version/lock
  order, rollback, immutable historical data and protected caches inspected;
  no remaining verified blocking defect. No separate reviewer/agent used.

Limitations: real-browser visual/mobile/keyboard smoke testing has not been
performed; native dialogs and existing theme behavior are covered by code and
component checks. Existing name-based historical report/saved-view filters keep
their compatibility contract. No production rollout or performance claim.
Phase B may proceed independently; its migration requires separate approval.
All work remains unstaged; tatus and real environment files remain unchanged.

## Pre-approval checkpoint (historical evidence)

Baseline: clean `main`, Settings and Users committed as `66ccd06`, matching the
recorded remote-tracking branch. Phase B (Email Logs) and Phase C (Attachment
Cleanup) have not started. Do not run this changed backend against the old schema
or treat this checkpoint as a deployment. No migration has been applied.

Pending migration: `20260912010000_add_department_administration`.
Verified local target: `ticketing_db`, `localhost:5432`, schema `public`.
Read-only inspection found 16 applied migrations, 17 local migration folders,
and only the Department migration pending. All applied SQL checksums match.

## Data and compatibility contract

- `Department`: UUID-shaped text ID, name (2–100 characters), normalized unique
  name, optional description (maximum 500), active flag, version, timestamps.
- `User.departmentId`: nullable FK with DELETE RESTRICT / UPDATE CASCADE.
- `User.department` remains in place. The migration, rename and merge never
  rewrite it. Linked users read the current relation name; unlinked users get a
  trimmed legacy fallback. Blank fallback strings display as no department.
- Explicit selection writes the ID only. Explicit “Not specified” clears both
  the ID and legacy fallback. Name-only saves preserve existing membership.
- Future CSAT resolution snapshots capture the canonical current department.
  Existing resolution-cycle department strings are never modified. Existing
  historical report/saved-view name filters keep their compatibility contract;
  the Admin Users directory uses department IDs for filtering.
- “Without department” in Users means no directory association. Any invalid
  legacy value remains readable rather than silently being removed.

## Migration operations and backfill

See the migration SQL for the exact statements. It runs in one transaction:

1. Create immutable SQL function `public.department_normalize(text)` using
   PostgreSQL whitespace trimming and case-folding. Future writes call the same
   function, avoiding JavaScript/database normalization disagreements.
2. Create `departments` with its primary key and four checks: trimmed/control-free
   name length, normalized-name consistency, description length, positive version.
3. Create unique `departments_normalizedName_key` and list index
   `departments_isActive_name_id_idx`.
4. Add nullable `users.departmentId`, the composite membership/count index
   `users_departmentId_isActive_role_idx`, and `users_departmentId_fkey`.
5. Group valid trimmed legacy values by their lower-case key. Choose the minimum
   C-collation spelling deterministically and derive deterministic UUID-shaped IDs
   from MD5 of a namespaced normalized key. Insert one row per valid group.
6. Populate only the new user association. Blank and invalid legacy values remain
   untouched and unlinked; no historical tables or snapshots are updated.

No DROP, DELETE, reset, destructive cascade, historical backfill, or extension
installation. Department/user-association backfill is intentional and bounded by
existing users. The data-insertion part tolerates existing normalized keys; Prisma
applies the DDL once via its migration ledger. Do not manually replay the SQL.

The pre-approval inspection found **11 users: 9 empty, 2 valid, 0 invalid**, mapping
to **2 departments**; no case-variant groups. There were **0 existing resolution
cycles** (snapshot baseline checksum `d41d8cd98f00b204e9800998ecf8427e`).

`ALTER TABLE` holds an ACCESS EXCLUSIVE lock on users until commit. The backfill
scans users and builds indexes, so duration scales with population. Pause account
writes and coordinate the application/schema cutover; this small local database
is not evidence for production timing. No production deployment is authorized.

## APIs and security

All endpoints authenticate and return private/no-store data. `/api/departments/options`
is the only non-Admin directory endpoint: active ID/name pairs only, with bounded
search and pagination. Management routes reject USER and AGENT with 403.

| Method and path (under `/api`) | Contract |
| --- | --- |
| GET `/departments` | Admin paged search/status, member count, active Agent count |
| GET `/departments/:id/members` | Admin paged safe member preview, department version |
| POST `/departments` | Admin name/description create |
| PATCH `/departments/:id/update` | Name/description plus reviewed version |
| PATCH `/departments/:id/status` | Active flag plus reviewed version |
| PATCH `/departments/:id/merge` | Source version, distinct active target ID/version |
| PATCH `/departments/users/:id` | New and previous department IDs; nullable |
| PATCH `/settings/me` | Name; optional new/previous department IDs; no free text |

Unknown fields and invalid IDs, versions, enums, names and page limits are rejected.
Management writes revalidate the acting account inside the transaction. They share
the account-lifecycle advisory lock followed by a Department lock, preserving one
lock order across profile assignment, merge, and account revocation. These are
short, serialized administrative writes, not an unbounded background worker.

Membership changes increment affected Department versions. Merge checks both
reviewed versions, moves current user IDs, deactivates the source, and writes a
safe count/ID audit in the same transaction. Audit failures roll everything back.
No permanent deletion endpoint exists. In-use deactivation keeps current members;
they may retain the inactive link on a name-only save or choose an active alternative.

## Frontend and caches

Admin-only Department navigation/page reuses existing cards, controls, native
dialogs and theme. Member previews precede edit/lifecycle/merge confirmation.
Paged department search avoids unrestricted directory downloads. Settings removes
free-text Other, preserves an existing inactive selection, and permits explicit
legacy clearing. Users filters and account reassignment use IDs.

Query keys contain account, role, kind, ID, filters and pagination. Requests consume
AbortSignal; role/error states hide data. Mutations refresh the acting account and
invalidate its protected queries. Late responses cannot update a switched account.
Other signed-in users receive canonical changes through existing focus/60-second
Auth refresh. No cross-user browser-cache invalidation or instantaneous push is claimed.

## Verification and resumption

Pre-approval checks include Prisma format/validate/generate, Department unit tests,
all non-database backend suites, focused and full frontend tests, build, diff and
redacted secret checks. Database suites are deliberately excluded before approval,
including existing suites that would otherwise auto-connect to the local database.

After explicit authorization:

1. Run `node scripts/inspect-department-migration.js` from server and recheck target,
   only-pending migration and unchanged applied checksums. Do not edit applied SQL.
2. Apply only the approved migration once using `npx prisma migrate deploy`.
3. Verify ledger/checksum and actual PostgreSQL checks/index/FK behavior.
4. Run the prepared Department integration suite with
   `RUN_DEPARTMENT_DB_TESTS=true`, email disabled, and its exact-local-target gate.
5. Run full backend with the existing safe lifecycle/watcher DB flags; verify
   synthetic fixture cleanup. Update this checkpoint with actual results.
6. Rerun affected frontend checks only for genuine repairs, finish Phase A review,
   then start Phase B with an independent migration gate. Never bundle Phase B/C.

Prepared DB coverage includes normalized duplicates, checks/FK restriction, active
and inactive selection, membership counts, merge rollback, competing merge/update,
stale assignment, legacy/snapshot preservation and ID-scoped fixture cleanup.
Those tests have **not run before migration approval**. Real-browser visual and
end-to-end database-backed interaction checks remain for the post-approval phase.

## Verified pre-approval results

- Prisma format, validation and Client generation: passed.
- Focused Department + Users backend: 26 tests passed.
- Complete non-database backend: 411 tests passed in 31 suites.
- Focused Department/Settings/Users frontend: 24 passed; final legacy/cache
  regression rerun: 13 passed.
- Final full frontend: 249 tests passed in 54 files.
- Final production build: passed (existing >500 kB bundle warning remains).
- Redacted changed-file scan: no likely real credentials; diff check passed.
- Database integration/concurrency, physical constraints and fixture cleanup:
  deferred until approval. No Department DB fixtures were created.
- Focused primary-session review addressed blank legacy display, explicit legacy
  clearing, ID filter labeling, stale membership/version checks and late Auth
  refresh isolation. No ship verdict before database verification.

Pending SQL SHA-256:
`7107cf8fcfbd5d85493b0074ebd6ec3a3fe8e4156eafe301eef623bf6dee2f5b`.

## Phase A file manifest

All changes belong to Phase A; no Email Logs or Attachment Cleanup implementation
is included. Paths are relative to the repository root.

- `client/src/App.jsx`
- `client/src/api/departments.api.js`
- `client/src/components/layout/Sidebar.jsx`
- `client/src/components/settings/AccountPanels.jsx`
- `client/src/components/settings/DepartmentPicker.jsx`
- `client/src/components/settings/DepartmentPicker.test.jsx`
- `client/src/components/users/UserDetails.jsx`
- `client/src/components/users/UserDetails.test.jsx`
- `client/src/hooks/useDepartments.js`
- `client/src/hooks/useDepartments.test.jsx`
- `client/src/pages/DepartmentsPage.jsx`
- `client/src/pages/DepartmentsPage.test.jsx`
- `client/src/pages/SettingsNavigation.test.jsx`
- `client/src/pages/UsersPage.jsx`
- `client/src/pages/UsersPage.test.jsx`
- `docs/DEPARTMENT_ADMINISTRATION.md`
- `server/prisma/migrations/20260912010000_add_department_administration/migration.sql`
- `server/prisma/schema.prisma`
- `server/scripts/inspect-department-migration.js`
- `server/src/middleware/authenticate.js`
- `server/src/modules/auth/auth.service.js`
- `server/src/modules/dashboard/__tests__/dashboard.service.test.js`
- `server/src/modules/dashboard/dashboard.service.js`
- `server/src/modules/departments/__tests__/department.integration.test.js`
- `server/src/modules/departments/__tests__/department.test.js`
- `server/src/modules/departments/department.projection.js`
- `server/src/modules/departments/department.routes.js`
- `server/src/modules/departments/department.schema.js`
- `server/src/modules/departments/department.service.js`
- `server/src/modules/reports/__tests__/report.service.test.js`
- `server/src/modules/reports/report.service.js`
- `server/src/modules/satisfaction/satisfaction.service.js`
- `server/src/modules/search/search.service.js`
- `server/src/modules/settings/settings.controller.js`
- `server/src/modules/settings/settings.schema.js`
- `server/src/modules/settings/settings.service.js`
- `server/src/modules/tickets/ticket.service.js`
- `server/src/modules/users/__tests__/user.directory.test.js`
- `server/src/modules/users/__tests__/user.lifecycle.integration.test.js`
- `server/src/modules/users/user.schema.js`
- `server/src/modules/users/user.service.js`
- `server/src/routes/index.js`
