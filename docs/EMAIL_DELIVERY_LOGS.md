# Secure Email Delivery Logs — Phase B

## Current checkpoint: Phase B ship (2026-09-12)

Explicitly approved migration applied once: one successful ledger row, one
applied step, approved checksum unchanged; all 18 migrations current. Direct
PostgreSQL inspection confirmed four enums, all 13 columns/defaults/nullability,
three checks, primary/unique idempotency/listing indexes and no foreign keys.
The new table was empty; all 19 pre-existing tables' complete row and structural
fingerprints matched before/after migration and after verification/cleanup.

Post-approval evidence:
- All six prepared DB tests passed, then passed again in focused/full runs.
- Focused Email Logs/Auth backend: 84 passed across four suites (includes DB).
- Complete backend: 508 passed, 20 skipped; 39 passing suites, three unrelated
  SLA/CSAT/personal opt-in DB suites not enabled.
- Focused Email Logs/cache/registration frontend: 19 passed across four files.
- No frontend production change after the previous 263/263 full frontend and
  successful production build, so those results remain valid without reruns.
- Prisma validation and migration status passed; diff check passed; updated
  secret scan covered 59 changed text files, 18 recognized fixtures, zero likely
  real credentials. No values printed.
- Fixture cleanup: email_logs returned to zero and generated Email Log test
  users to zero. Existing data and schema fingerprints remain unchanged.
- Current-account authorization, 403s for Agent/User, safe response allowlists,
  UTC filters/page bounds, single reservation permit and terminal-state
  protection were exercised against PostgreSQL/HTTP. Mocked provider calls only.
- Real CHECK failure through the reservation service produced only the stable
  sanitized 503 domain error and no stored row. No raw driver details returned.

The only post-migration repair changed the unmasked synthetic fixture from an
overlength address to an address shorter than VARCHAR(20), so the intended mask
CHECK (not length rejection) is tested. Applied SQL and production code unchanged.
Primary-session self-review found no remaining verified blocking defect. No
actual Resend/network email, webhook, existing-data deletion, environment-file
change or application deployment occurred. Phase C may now proceed under the
user's explicit continuation, limited to synthetic-file verification.

## Pre-approval checkpoint (historical evidence)

Phase A Department Administration is ship; see DEPARTMENT_ADMINISTRATION.md for
its migration, bounded test repair, preservation fingerprints and exact results.
Phase C Attachment Cleanup has not started and is not authorized at this gate.

Phase B code, unit/component tests, full non-database backend, full frontend and
production build are complete. Its database tests have NOT run. Do not start the
changed backend before approving/applying the new migration: log reservation
fails closed when the table is unavailable; existing account creation is not
rolled back, but no provider request can proceed without a reserved log.

Only pending migration: `20260912020000_add_email_delivery_logs`.
Target: `ticketing_db`, `localhost:5432`, schema `public`.
17 migrations applied; 18 local; every applied SQL checksum matches, including
the unchanged Department migration. No prior migration is edited.

Pending SQL SHA-256:
`5b5b2714066a0a696b1d2cbe6aeae9ef2064814c3c80fda12a6216de4277d71e`.

Exact SQL: `server/prisma/migrations/20260912020000_add_email_delivery_logs/migration.sql`.

## Architecture and evidence model

Logging is integrated into the existing `sendMail` facade. The sole current
message type is EMAIL_VERIFICATION. Existing in-app preferences are unchanged;
verification is an account-security flow, not an optional ticket-alert email.
No ticket content or notification email is introduced.

| Stored status | Evidence | Attempt count |
| --- | --- | --- |
| DISABLED | Provider disabled; no provider request | 0 |
| UNKNOWN | Reserved submission, in progress, interrupted, timed out, transport failure, or unrecognized response | 1 reserved attempt |
| ACCEPTED | Successful SDK response containing a valid provider message UUID | 1 |
| FAILED | Explicit provider rejection (4xx except ambiguous 408/409) | 1 |

An attempt is reserved before network I/O; a crash can occur before the network
request starts. The count is NOT proof of network transmission. UNKNOWN may be
accepted later by the provider; it is never automatically retried or called
delivered. The registration response/UI explicitly supports `unknown` as well as
accepted/unavailable/failed, and tells users an email may still arrive. Existing
anti-enumeration resend wording and cooldown behavior are preserved.

Only a hash of `verify-email/<token-record UUID>` is stored for uniqueness. The
record UUID is not the verification token. The original stable key is passed to
the installed official Resend SDK. One successful insert grants one send permit;
duplicate callers return the existing safe status without sending again, even
if that status is UNKNOWN, FAILED or DISABLED. A user-requested new verification
flow creates a fresh token record/key through the existing protected flow.

The installed Resend 6.25 SDK's send/create/post/fetch implementation was inspected:
the existing pinned official API endpoint, AbortSignal, Idempotency-Key header
and suppression of the SDK diagnostic logger remain in place. All provider tests
use a mocked SDK; no real provider request was made.

## Privacy, failure policy and limitations

- Recipient masking retains at most one alphanumeric local-part character and
  one domain character: `p***@e***.***`. Invalid/multiple recipients are refused.
- No raw recipient, email body, subject, verification URL/token, password,
  credentials, headers, raw provider payload, arbitrary metadata or attachments.
- Provider IDs must be UUIDs; unexpected payload values produce UNKNOWN.
- Dedicated log writes use explicit field allowlists; completion schemas reject
  unknown fields. Queries use a safe projection excluding even idempotencyHash.
- Error categories are enums; fixed diagnostic warnings contain no raw errors.
- Reservation failure prevents sending; the already-created account/token stays
  intact. No transaction spans the business action, provider and log.
- Completion-persistence failure preserves UNKNOWN in PostgreSQL. A caller that
  actually observed provider acceptance still receives accepted, while the
  operational log conservatively remains unconfirmed. No retry is attempted.
- Conditional completion permits one state transition; later callbacks cannot
  downgrade terminal evidence. No general transactional outbox or worker exists.
- DELIVERED/BOUNCED/COMPLAINED, webhook signing/replay handling and delivery-event
  reconciliation are explicitly deferred. No webhook endpoint or secret added.
- No resend/retry, deletion, export or retention controls exist on the log API.
  Log entries cannot reconstruct messages. Retention needs a separate policy.
- Existing production environment validation still requires configured Resend;
  disabled local development remains supported. No environment settings changed.

## API and UI

Admin-only `GET /api/email-logs` and `GET /api/email-logs/:id`.
Authentication + role middleware and current-account revalidation protect reads;
Agents/Users get 403, invalid/expired authentication gets a sanitized 401, and
unexpected data-access errors get a safe 503. Successful reads are private/no-store.

List accepts strict status/type, inclusive UTC created-from/through dates,
exact internal UUID search, page 1–100000 and limit 1–50 (default 20). Stable
createdAt/id ordering, row totals and status counts share a RepeatableRead
snapshot. Counts ignore status but honor the other filters. No email or free-text
content search is exposed. Status/date indexes cover the actual list queries.

Admin navigation opens `/email-logs`: masked table, counts, filters, pagination,
disabled banner, explicit evidence descriptions, native accessible metadata
dialog, loading/empty/error/retry/refresh states and existing theme styles.
The table scrolls within its card on small screens. Native dialogs supply modal
focus containment/Escape/return-focus behavior. Query keys include user, role,
list/detail, ID and filters; AbortSignal is consumed, stale data is hidden on
errors/role loss, and unused caches expire immediately. No protected localStorage.

## Exact migration operations

One explicit BEGIN/COMMIT transaction, creating only new objects:

1. Four enums: EmailLogStatus (DISABLED, UNKNOWN, ACCEPTED, FAILED), EmailLogProvider
   (DISABLED, RESEND), EmailLogType (EMAIL_VERIFICATION), EmailLogError
   (EMAIL_DISABLED, NOT_CONFIRMED, PROVIDER_REJECTED, TIMEOUT, TRANSPORT_ERROR,
   INVALID_RESPONSE).
2. `email_logs` columns: id TEXT primary key; messageType enum;
   recipientMasked VARCHAR(20); provider enum; status enum;
   idempotencyHash VARCHAR(64); nullable providerMessageId UUID;
   attemptCount INTEGER default 0; nullable errorCategory enum;
   createdAt TIMESTAMP(3) default CURRENT_TIMESTAMP; updatedAt TIMESTAMP(3);
   nullable acceptedAt and failedAt TIMESTAMP(3).
3. Three checks: exact masked-recipient shape; 64 lower-case hex hash; status,
   provider, attempt, error category and evidence-timestamp consistency.
4. Unique index email_logs_idempotencyHash_key; chronological index
   email_logs_createdAt_id_idx; status/chronological index
   email_logs_status_createdAt_id_idx (in addition to the primary-key index).

No foreign key or cascade; no existing table alteration, row update, deletion,
data backfill, enum alteration, trigger, extension, or destructive SQL. Historical
attempts are not fabricated. Catalog/new-table locks only, not an existing users
table rewrite. The table starts empty after approval.

## Verification evidence before approval

- Focused mailer/Auth/Email Logs backend: 78 passed in 3 suites.
- Full non-database backend: 456 passed in 32 suites (all integration/DB files
  intentionally excluded until this new migration is approved).
- Focused Email Logs/cache/registration frontend: 19 passed in 4 files.
- Final full frontend: 263 passed in 56 files, no skips/failures.
- Final production build: passed, 1786 modules, JS 611.26 kB / gzip 175.36 kB;
  pre-existing >500 kB bundle warning remains nonblocking.
- Prisma format, validation and Client 5.22 generation: passed.
- Prepared DB suite: six tests, syntax checked, NOT RUN. It covers physical
  constraints/enums/indexes, narrow failure classification and row survival,
  parallel disabled/enabled reservations, competing completion, real HTTP role
  authorization/safe projections and scoped fixture cleanup. Provider is mocked
  to reject any accidental construction; tests never send email.
- Primary self-review corrected misleading unknown public outcome handling and
  preserved sanitized 401s for invalid/expired JWTs. Cache-error regression waits
  for TanStack's asynchronous observer notification; no application fix needed.
- Redacted changed-text scan: no likely real credentials. Recognized dummy test
  credentials are fixtures, not rotation requirements. Diff check passed.

No Phase B ship verdict yet: physical DB behavior and real DB tests remain gated.
Real-browser visual/keyboard/mobile smoke testing has not been performed.

## After explicit approval (do not run yet)

1. Recheck target, this sole pending migration, exact checksum and all 17 applied
   checksums; ensure no backend/account writer is running.
2. Apply once from server: `npx prisma migrate deploy`.
3. Verify one successful ledger row/step, all 18 current, physical constraints,
   indexes, enum labels and table columns, no historical log backfill.
4. Run the opt-in Email Logs DB suite with RUN_EMAIL_LOG_DB_TESTS=true and
   EMAIL_PROVIDER=disabled. Confirm its generated log hashes/users are cleaned;
   preserve all pre-existing rows. No actual provider use, even for accepted cases.
5. Run full backend with Department/lifecycle/watcher/Email Logs safe DB flags;
   rerun affected client checks only if a repair changes client code.
6. Refresh diff/secret/ledger checks and primary review, then report Phase B.
7. Do not begin Attachment Cleanup unless Phase B is independently verified and
   the user's continuing instructions permit it.

Manual smoke checklist after migration, without sending email: Admin opens log
list, filters UTC dates/status/type/ID, opens/closes safe metadata with keyboard,
checks narrow/light/dark layout; Agent/User cannot navigate/read it; logout/role
switch hides data. Use mocked/synthetic log fixtures for outcome examples.

## Phase B file manifest

Shared with Phase A: client/src/App.jsx; client/src/components/layout/Sidebar.jsx;
server/prisma/schema.prisma; server/src/routes/index.js;
server/src/modules/auth/auth.service.js.

Additional files:
- client/src/api/emailLogs.api.js
- client/src/hooks/useEmailLogs.js
- client/src/hooks/useEmailLogs.test.jsx
- client/src/pages/EmailLogsPage.jsx
- client/src/pages/EmailLogsPage.test.jsx
- client/src/pages/CheckEmailPage.jsx
- client/src/pages/CheckEmailPage.test.jsx
- server/src/utils/mailer.js
- server/src/modules/auth/__tests__/auth.service.test.js
- server/src/modules/auth/__tests__/mailer.config.test.js
- server/src/modules/emailLogs/emailLog.schema.js
- server/src/modules/emailLogs/emailLog.service.js
- server/src/modules/emailLogs/emailLog.routes.js
- server/src/modules/emailLogs/__tests__/emailLog.test.js
- server/src/modules/emailLogs/__tests__/emailLog.integration.test.js
- server/prisma/migrations/20260912020000_add_email_delivery_logs/migration.sql
- docs/EMAIL_DELIVERY_LOGS.md

All work is unstaged. No commit, push, deployment, real email, environment-file
change, tatus modification, applied-migration edit, existing-data deletion or
attachment cleanup occurred. No Astral, workers or subagents were used.
