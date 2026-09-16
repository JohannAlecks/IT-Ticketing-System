# Isolated E2E verification — installed Chrome 152

## Current evidence (2026-09-16)

Prepared on main, baseline commit b5bd78c. No product backend/schema/migration, real environment file, or tracked tatus change was made. Everything remains unstaged.

Browser coverage is **installed Google Chrome 152.0.7977.83**, Playwright 1.63.0, channel: 'chrome'. Mobile coverage is **desktop Chrome emulation**, not a physical device. Bundled Chromium 153, Firefox and WebKit remain unverified. The approved Chrome isolated launch smoke passed. No installer retry or connection to a personal Chrome profile is permitted.

Collection: **29 project cases in 10 files: 24 desktop and five mobile-emulated**. There are 24 distinct source test definitions; five also run in the mobile project. The original 27 project cases became 29 through two added desktop regressions: same-tab notification/search/report cache isolation, and published-internal Knowledge Base API/search/feedback denial with live role downgrade. No count increase is attributed to renaming projects.

| Verification | Observed result |
| --- | --- |
| Current focused authentication group | 5/5 passed, zero retries; 25.052 s, 27.071 s including runtime |
| Complete run 1: 179b3c68-e2b4-46da-8350-f3c4ad631ec1 | 29/29 passed; 0 failed/skipped/retries; 116.794 s, 118.970 s including startup/teardown |
| Complete run 2: c9270b8c-c065-468d-9fe9-055d5ebfdae3 | 29/29 passed; 0 failed/skipped/retries; 134.868 s, 156.454 s including startup/teardown |
| Infrastructure checks | 11/11 passed; zero failures/skips |
| Frontend focused after saved-view repair | 19 tests across SavedTicketViewPage, usePersonal and AuthContext passed |
| Full frontend after saved-view repair | 268 tests / 56 files passed; 34.90 s; protected-cache tests included |
| Production frontend build | Passed in 12.05 s; 1786 modules; main JS 611.46 kB / 175.45 kB gzip; existing >500 kB warning |
| Backend (retained evidence, not rerun here) | 608 tests / 47 suites passed; zero skipped, ticketing_test only |
| Prisma validation and E2E migration status | Valid; all 18 migrations current; no deployment performed |

Both runs reported 29 per-case fixture/upload restorations, desktop and mobile browser disconnection with profile/artifact removal, temporary-root removal, runner-owned API/web shutdown, and unchanged development fingerprint. The two runs used separate UUIDs and roots. Automatic retries are disabled. Across these two complete runs, all 58 executions passed with zero failures, skips, retries or observed flakes; prior explicit failures below are not erased.

Final primary-session verdict: **ship for this bounded E2E change set**, with the coverage limitations below. Both independent complete runs, cleanup, preservation and final safety/self-review passed. This is not a claim of comprehensive browser, device or workflow coverage.

Final safety checks: Prisma validation passed; all 18 applied migration checksums and physical schema contracts match in both isolated test databases and development. E2E and integration fingerprints exactly match the table below; no synthetic users/tickets/articles/notifications/email logs remain, and four baseline SLA policies remain. Development's read-only 20-table fingerprint is unchanged. No E2E temporary roots remain. The only remaining local browser artifact is the ignored 45-byte last-run status file; no auth state, screenshots, traces, video or downloads are staged. No files at all are staged.

Redacted scan: 30 changed text files, zero likely credentials; seven recognized synthetic examples. All 22 changed CJS files pass syntax checks, changed text has no trailing whitespace, and git diff --check passes. No Prisma/schema/migration/tatus diff exists. LF-to-CRLF Git notices are informational, not whitespace failures.

Final self-review inspected account-switch/logout cache clearing and late auth responses, keyed saved-view deletion navigation after account/role changes, Tailwind working directory and responsive assertions, forwarded mobile settings, fail-closed runtime/database identity, role authorization, per-test UUID ownership, cross-run fingerprints, failure cleanup, browser artifacts and transient UI assertions. No further demonstrated product defect remains. The touch interaction, stable archive destinations, explicit modal completion and positive readiness waits preserve assertions. OS-wide process verification remains access-denied; only runner-owned shutdown is claimed. Startup intermittency and forced-interruption recovery limitations remain recorded rather than hidden.

## Repairs preserved and reviewed

- Real client defect: saved-view deletion invalidated its query and unmounted the controls before the mutation promise resolved, suppressing navigation. Navigation now belongs to the account/role/view-keyed parent page. It survives a deleted-view refetch but cannot navigate after logout or an account/role change. Five regression cases cover active/archive destinations and three late-completion identity changes.
- Vite starts with client as its working directory, so Tailwind content globs scan actual application files. Desktop/mobile navigation visibility asserts loaded responsive CSS. Results obtained before this repair are not sufficient responsive evidence.
- Native HTTP readiness drains responses and requires status 200 plus the exact unpredictable run identity. Initial startup has one bounded 15-second window; per-fixture checks remain three seconds. No redirects, identity fallback, or test retries are used. Redacted phase/elapsed diagnostics distinguish connection/header/body failures.
- Touch-enabled contexts use touch taps for the account/logout menu, avoiding an artificial mouse hover/leave sequence. The five-case auth group and run 1 passed afterward.
- Test-contract repairs preserve assertions: protected login destination, accessible ticket rows, sidebar-scoped Users navigation, Knowledge draft edit navigation, explicit focus origin for modal focus-return checks, waiting for Department dialogs to close, exact Email status locator, and archive/restore navigation instead of a transient banner.
- The account-switch fixture establishes unread state before login's first query. Same-document observers detect stale ticket/notification content; report/search/notification ownership assertions remain intact.

No additional backend production fix was necessary, so the retained 608-test result was not invalidated. Latest changes after the frontend suite/build affect E2E infrastructure/tests and documentation only.

## Failure and interruption record

Failures are explicit runs, not hidden automatic retries.

- Historical installer failures were official CDN timeouts. Subsequent user approval selected installed Chrome; no further installer attempt is made.
- Earlier zero-case startup failures included Vite CJS/ESM import mismatch and local readiness timeouts; safe reporter editing once introduced a syntax error. These were infrastructure failures, not passing browser coverage.
- Earlier browser failures included locator/destination mismatches, missing Tailwind styling, test focus/modal sequencing, the real saved-view navigation defect, a transient archive banner assertion, unread-fixture timing, and mobile mouse-menu interaction. Bounded repairs and affected reruns are preserved above.
- Earlier execution approval returned “Selected model is at capacity”; those commands did not execute and no bypass was used.
- An interrupted earlier full run left two synthetic users, two tickets, one saved view, one watcher and two audit rows with the verified single prefix e2e-bd4fdfa8-8bea-45db-a0a5-c94ed551df8c. No active E2E advisory lock or responding owned ports remained. An exact-ID, baseline-guarded transaction removed only these fixtures (joins cascaded); original E2E and development fingerprints were verified. Only its verified temporary root ticketing-e2e-tKMvWu, including its abandoned test profile, was removed. Interrupted cleanup is not represented as automatic success.
- Current recovery had two zero-case web-readiness failures before the successful five-case auth group: run 6c731d71-a982-4c46-ab18-d915b720168f and run b9af3550-a7a6-4f06-8c67-0efe833ca7c7. Both reported clean teardown/preservation. The latter timed out in global setup after parent readiness; this is retained startup intermittency, not a proved universal cure.
- Run 8dc8ed05-335c-4ccf-a637-7309d6376458 lost its execution handle across interruption. Recovery independently found the clean database baseline and no E2E temporary roots, but no final test total/process-shutdown result was captured. It is not counted toward repeatability.

## Database, runtime and fixture safety

Existing databases are preserved. Do not create, reset, seed, truncate, remigrate, or alter them.

| Database | Purpose | 20-table preservation digest |
| --- | --- | --- |
| ticketing_db | Read-only development comparison | 588532a7b6824f17fbafd3a814635a3adb1cdff5b7350c9bc4550eeb0c8bc90d |
| ticketing_test | Backend integration only | 7bcc9790eaeba5c314d7891bf425ac88de3d5228248e53bfd6dbc0bed62836c7 |
| ticketing_e2e_test | Browser synthetic fixtures only | 02fe142baa20f1c6bcb1cbeb9979f0766f91cdb0ec2f64a544b10cbd05af9750 |

All target localhost:5432/public. Integration marker is ticketing-system:disposable-integration-tests:v1; E2E marker is ticketing-system:disposable-e2e-tests:v1. The centralized guard requires exact identity, marker, all 18 successful one-step migration entries/checksums and physical schema. Its default integration behavior remains isolated; E2E rejects development and integration targets. Read-only recovery verified zero users/tickets/articles/notifications/email logs and four migration-provided SLA policies in both test databases.

API 127.0.0.1:5410 and frontend 127.0.0.1:5411 are runner-owned, strict-port, fresh-identity processes. Process-only environment allowlisting removes ambient development/provider/preload settings. Email is disabled; API refuses Resend construction and outbound fetch/HTTP(S). Browser origins are restricted to the two isolated runtimes. This is application-level defense, not an OS-wide network sandbox.

The real app, middleware, auth and database contracts run unchanged; no authentication bypass/test endpoints exist. Test-process-only rate-limit windows are one second (10 authentication and 120 API requests); production rate-limit window behavior is not covered.

Playwright launches Chrome, never attaches via CDP or supplies a personal user-data directory. Each worker uses a fresh temporary profile; each actor/account has a non-persistent context. Deliberate account-switch tests log out and sign in within the same document. The helper forwards viewport, screen, scale factor, touch/mobile, user agent, locale/timezone and appearance settings.

Each case uses UUID-owned synthetic records. Cleanup closes contexts, waits for outstanding API requests, deletes only owned IDs in FK-safe order, restores complete captured policy rows and compares full fingerprints. The exclusive E2E advisory lock and one browser worker prevent concurrent runs. Synthetic uploads/downloads use only canonical runner-owned temporary directories; real upload contents are never accessed.

Each independent full run gets a new UUID and temporary root and shuts down its own API/web/browser processes. Windows-wide process inventory previously returned access denied; an empty pipeline from that command is not evidence of no processes. Runner-owned exit tracking, browser disconnection and temporary profile/root deletion are separate verified evidence. Forced OS-termination/failure-injection cleanup remains unverified.

## Coverage matrix

These are bounded workflow assertions, not comprehensive product coverage. Full-run results determine execution, not collection alone.

| Group | Assertions exercised | Partial/deferred |
| --- | --- | --- |
| Authentication | Login failures/success, redirects/logout, inactive/unverified accounts, disabled registration email, delayed real role response, same-tab cache no-flash | More account/role switch permutations |
| Authorization | Role navigation/direct routes, Admin APIs 403, foreign ticket and Agent assignment restrictions | Exhaustive endpoint/role permutations |
| Creation | Category suggestion/edit/guidance, department, normal/work-blocking priority, URGENT denial, synthetic upload/download bytes | Broader file types and invalid-input permutations |
| Lifecycle | Claim/unassign, assign/reassign, internal/public reply privacy, priority/status, close/reopen, archive read-only, Admin restore | Explicit category triage, ineligible/unassigned Agent archive denial |
| Notifications | Bell/read/unread/all, pagination/type, mandatory locked preference, optional future suppression, watch/unwatch, reply dedupe/privacy | Explicit assignment/status notification UI |
| Knowledge Base | Draft/submit/return/publish/archive/republish, feedback, management boundaries, internal API/search/feedback denial and live downgrade | Wider lifecycle/concurrency combinations |
| SLA/CSAT | Public response, requester wait/resume, resolution cycles, feedback editing/staff read-only, policy edit/restore, synthetic breached deadline | Due-soon indicator, role-specific policy settings, broader CSAT concurrency |
| Settings/Users | URL sections, profile save/discard/dirty state, department sync, theme, password controls, filters/details/lifecycle/self-protection, 21-row pagination | Last-active-Admin concurrency covered in retained backend, metric value completeness |
| Departments/Email | Create/edit/deactivate/inactive retention/merge membership; Admin masked four-state logs | Department reactivation, another user's inactive choices, broader log filters |
| Personal/Search/Reports | Saved-view CRUD/scope, shortcut ordering/cascade, ownership and keyboard search, role Summary/Reports and CSV; account-switch report/search isolation | Deeper totals/distributions and all filter combinations |
| Responsive/keyboard | Five mobile-emulated cases, overflow/navigation, modal Escape/focus return, pagination/search keys | Full keyboard/contrast/accessibility audit, physical devices, other browsers |

Synthetic ACCEPTED/UNKNOWN/FAILED email rows are UI fixtures, not provider evidence. Acceptance is never claimed as delivery.

## Operation and artifact policy

From e2e, use npm run test:list and npm run test:infra for non-database checks. Approved browser commands require privately supplied process-only E2E_DATABASE_URL, E2E_DEVELOPMENT_DATABASE_URL and E2E_APPROVED=true. Never print URLs/credentials or persist them in real .env files.

npm test runs one full suite. For independent repeatability, invoke it twice separately so each run owns new runtime identity and roots. test:repeat/test:verify share one runner runtime across stages and do not replace this independent-run requirement. Named groups remain auth, roles, creation, lifecycle, notifications, knowledge, sla-csat, settings-users, departments-email, personal-reports.

Retries are zero, forbidOnly enabled, one worker, stop-on-first-failure. The redacted reporter rejects zero/skipped/failed/retried results, prints safe source/status totals and excludes raw request/error bodies. No authenticated storage state is exported; trace, video and screenshots are disabled. Temporary downloads are removed after in-memory checks. Common reports/auth-state/artifacts are ignored, never staged.

Backend 608-test evidence is retained unless a production backend repair invalidates it; do not rerun it unnecessarily. Frontend 268-test/build results remain valid unless a later client repair invalidates them.

No staging, commit, push, deployment, real email, Resend request, real-upload access, .env/tatus change or development mutation is part of this task.
