# Private-beta release preparation

Status: **ship to staging** for the bounded Phase 1 preparation and verification.
This is readiness for a separately approved staging operation, not deployment or
approval to invite real beta users. The staging configuration checks below remain required.
No deployment, cloud resources, production database, DNS, billing or email changes
are authorized by this document. Existing 18 migrations are preserved.

## Baseline and current checks

Accessibility/E2E baseline commit: `a4462d77cc814f0a30dfe620e229143240a53019`;
remote `origin/main` was independently checked to match. Historical accessibility
and browser evidence remains in [ACCESSIBILITY.md](ACCESSIBILITY.md) and
[E2E_TESTING.md](E2E_TESTING.md); do not relabel it as production testing.

The release hardening changes are intentionally left uncommitted for review.
Fresh results and outstanding verification are recorded below.
Neither a passing build nor automated tests constitute production approval,
security certification or WCAG certification.

### Final browser verification — 2026-10-04–05

The approved strict pin is **installed Google Chrome 154.0.8037.95** at
`C:\Program Files\Google\Chrome\Application\chrome.exe`, reverified before the pin
edit and again on recovery. Playwright 1.63.0 still uses `channel: 'chrome'`, fresh
temporary profiles, separate role/account contexts, the complete mobile descriptors,
one worker and zero automatic retries. No personal Chrome profile was attached.
Only the current guard, project labels, emulated user agent and current documentation
changed during this browser continuation; no production repair was necessary.

| Chrome 154.0.8037.95 verification | Passed/executed | Test stage / total runtime |
| --- | ---: | --- |
| Focused authentication/account switching | 5/5 | 31.674s / 34.965s |
| Focused role authorization | 2/2 | 13.476s / 15.514s |
| Focused creation and synthetic attachments | 3/3 | 21.523s / 23.787s |
| Focused Knowledge Base privacy | 2/2 | 18.376s / 20.695s |
| Focused personal workflows/reports | 3/3 | 19.819s / 22.068s |
| Independent functional run 1 | 29/29 | 184.431s / 190.129s |
| Independent functional run 2 | 29/29 | 160.533s / 164.428s |
| Bounded accessibility compatibility | 10/10 | 70.823s / 90.843s |

Every browser run had zero failed, skipped, not-run and retried cases; no observed
flake or assertion repair. Functional collection remains 29 project cases: 24
distinct source definitions, including five repeated in desktop mobile emulation.
No count increase is caused by the browser-version labels.

Independent functional run IDs:

- Run 1: `27063595-11b6-4a90-8c36-fd0f4b559623`.
- Run 2: `784f5ab0-e5ef-471c-8d01-695715050d81`.
- Compatibility: `5b8228bb-1051-43b9-a451-3e1d98d93359`.

The terminal session disappeared across interruption; run 2's complete persisted
sanitized evidence was inspected instead of repeating the successful run. Each full
run recorded 29 per-case fixture/upload restorations, two exact-version browser
disconnections/profile removals, temporary-root removal and owned API/web shutdown.
The five focused runs and compatibility run also passed all per-case cleanup checks.
Chrome URL-fetcher scratch directories were removed only inside their verified owned
temporary roots after browser disconnection. No real uploads were accessed.

Compatibility exercised six desktop/mobile keyboard cases plus four light/dark
authenticated cases: skip link, form-error association/focus, native dialog Tab and
Shift+Tab containment, Escape/restoration, navigation semantics, visible focus,
notification controls, search, saved-view confirmation and reduced-motion/reflow.
All **24 scanned states** had **zero critical, serious, moderate or minor Axe
violations**. Eight states retain incomplete contrast findings (32 node occurrences),
not automatic passes. All 16 separate Summary gradient samples passed conservative
contrast bounds; lowest normal-text ratio was 4.594:1 (required 4.5:1).

Historical accessibility evidence is unchanged: Chrome **153.0.8010.48**, two runs
of **22/22**, **324 scanned states each**. Historical Chrome **154.0.8037.59** runs
are also preserved, not counted as current runs. All 31 pre-existing sanitized
verification reports were hash-checked unchanged during this continuation; the
historical E2E documentation body is unchanged. One ad-hoc comparison initially
included the newly inserted current approval section; comparing the actual historical
section confirmed preservation without editing any old evidence.

Final checks and self-review:

- E2E/accessibility infrastructure: **16/16**, 1322.5129ms, zero skips/failures.
- Prisma validation passed; live migration status on all three databases reports
  **18 current migrations**. All applied/local checksums and physical catalogs match.
- All three 20-table fingerprints below remain exactly unchanged after the runs
  and recovery. Synthetic fixtures are fully removed; the test databases remain isolated.
- Complete backend **673/673** and frontend **286/286**, plus the production build,
  are retained from the checks below. No subsequent production edit invalidated them.
- `git diff --check` passed. The final redacted scan covers 34 changed text files;
  no likely real credential was found. Synthetic/example matches were inspected;
  no real environment values were displayed or persisted.
- No files are staged, including browser reports, traces, screenshots, videos,
  downloads or authenticated storage states. Only sanitized ignored evidence is retained.
- Primary-session self-review passed: strict version/channel enforcement, zero retries,
  account/logout generation guards, saved-view navigation ownership, notification
  unmount handling, responsive CSS, role authorization, isolation/cleanup, error
  redaction, bounded upload checks, migration integrity and artifact safety. No new
  demonstrated defect or product repair was required. No Axe rules were disabled.

Git remains on `main`: **24 modified tracked files and 10 untracked files**, all
unstaged. Schema, migrations, real `.env` files and `tatus` are unchanged. No commit,
push, deployment, database recreation/reset/seed, real email/provider request, DNS
or billing change occurred.

Limitations remain: Chrome 154.0.8037.95 only for this continuation; mobile is desktop
emulation. Physical devices, Firefox, WebKit, bundled Chromium and manual assistive
technology are unverified. Windows-wide process inventory was previously access-denied;
runner-owned shutdown is not equivalent to that independent OS audit. Partial workflows
in the coverage matrix remain deferred. Zero Axe violations is not WCAG certification.
Hosted HTTPS/CSP/proxy, persistent-storage/restore, bootstrap concurrency and operational
staging checks remain outstanding; replace the public CSP origin placeholder before
any separately approved deployment.

### Historical database checkpoint — 2026-10-04, before browser approval

The user authorized private in-memory reading of `server/.env` solely to derive
the three local verification connections. No connection or other environment
value was displayed, logged, persisted or written back. The file was not modified.
The existing saved implementation was preserved; no migrations were applied.

All three targets were independently verified at localhost:5432/public before
test writes. `ticketing_test` and `ticketing_e2e_test` have their exact respective
disposable-purpose markers from the centralized contract. Development has no
disposable-purpose marker. Every target has 18 successful one-step migrations,
matching approved local checksums and the physical PostgreSQL catalog contract.
`prisma migrate status` exited zero and reported all 18 migrations current on
each of the three databases. The new production-readiness ledger query was also
exercised against the isolated E2E database: ready before draining, false afterward.

The first backend run stopped at one attachment API assertion: the sanitizer
had replaced a deliberately safe operational 503 message with a generic error.
This was a **product API-contract regression**, not a database rollback failure.
Its fixtures and all three fingerprints were restored even on failure. A focused
diagnostic reproduced 7 passes/1 failure. The bounded repair preserves explicit
`AppError` domain messages (including 503), while unexpected driver errors remain
generic and 5xx details/stacks remain excluded. The existing database assertion
was not weakened. A new regression asserts the safe 503 shape without private
details. Focused sanitizer/HTTP/config regressions passed **56/56 in three suites**.

The complete safe `test:ci` entry point (`scripts/test-runner.js verify`) was then
rerun successfully:

| Independent DB suite | Executed/passed |
| --- | ---: |
| Account lifecycle | 19 |
| Notifications | 3 |
| Knowledge Base | 5 |
| SLA | 7 |
| CSAT | 7 |
| Saved views/shortcuts | 8 |
| Watchers | 8 |
| Departments | 8 |
| Email Logs | 6 |
| Attachments | 8 |
| Ticket integrity | 7 |
| **Total** | **86/86** |

- Combined database run 1: **86/86**, 11 suites, 13.757s.
- Combined database run 2: **86/86**, 11 suites, 13.778s.
- Complete backend: **673/673**, 50 suites, 21.880s, no failures or skips.
- Fixture fingerprint restoration passed after every independent suite, both
  combined runs and the complete suite. Synthetic attachment directories were
  removed; no matching attachment-test roots remained after completion.
- E2E infrastructure: **16/16**, zero skips, 1974.9871ms.
- Isolated API/Vite runtime identity: passed, run
  `12731761-465b-4028-a02f-3695f3855c6c`, 9162ms runtime. Fixture baseline and
  development fingerprint preserved; temporary root removed; owned API/web
  processes stopped. This was a runtime check, **not browser execution**.

Final preservation fingerprints (20 application tables each) match both the
start-of-turn and retained baseline:

| Database | SHA-256 fingerprint |
| --- | --- |
| `ticketing_db` | `588532a7b6824f17fbafd3a814635a3adb1cdff5b7350c9bc4550eeb0c8bc90d` |
| `ticketing_test` | `7bcc9790eaeba5c314d7891bf425ac88de3d5228248e53bfd6dbc0bed62836c7` |
| `ticketing_e2e_test` | `02fe142baa20f1c6bcb1cbeb9979f0766f91cdb0ec2f64a544b10cbd05af9750` |

**Browser blocker:** the installed executable reports Chrome **154.0.8037.95**;
the strict approved runtime pin remains **154.0.8037.59**. No browser regression
was launched, no pin/label changed, and no historical evidence relabeled. Approval
for the bounded pin update has been requested. No new profile was created by the
runtime-only check, so browser-profile cleanup is not claimed as newly exercised.
The earlier Chrome evidence does not verify this Phase 1 change set.

Primary-session review covered the sanitizer repair, preserved operational error
contract, test isolation, actual readiness queries, migration integrity, upload
and fixture cleanup, and verification output redaction. The release verdict stays
**blocked** until browser regressions pass on an explicitly approved installed
version. Frontend 286/286 and build results below are retained because no frontend
production repair occurred. No full accessibility rerun is claimed.

Current Git inventory is 21 modified tracked files plus 10 untracked files, all
unstaged. `tatus`, Prisma schema and migrations are unchanged. No commit/push,
database reset/recreation/seed, real-upload access, email/provider request,
deployment, DNS or billing operation occurred.

### Historical verification checkpoint — 2026-10-01

- Focused security/configuration/upload/bootstrap: **89/89**, six suites, 2.789s.
- Complete non-database backend entry point `npm run test:unit`: **586/586**,
  39 suites, 6.428s, no failures/skips. This deliberately excludes the opt-in
  database suites; it is **not** a complete `test:ci` result.
- Frontend: **286/286**, 58 files, 46.16s; Vite environment-file loading disabled.
  Initial sandbox execution hit a directory-traversal permission error; the approved
  normal-environment rerun passed. No assertion was weakened.
- Production frontend build: **passed**, 1789 modules, 15.69s. Existing 620.95kB
  JavaScript bundle warning remains. No frontend application source changed.
- E2E/accessibility infrastructure: **16/16**, zero skips, 808.7988ms.
- Prisma **format and validation passed**, no schema diff. CLI environment-file
  discovery/read access was blocked process-locally; validation used a nonconnecting
  synthetic URL. No real `.env` file was read.
- **18/18 local migration checksums** match the approved database contract;
  migrations, schema, locks and `tatus` have no Git changes.
- `git diff --check`: passed. Redacted scan: 30 changed text files, zero likely-real
  credential findings; five known synthetic/example matches. No values printed.
- No staged paths and no tracked sensitive/generated paths found by the safety
  review. No raw browser artifacts were created or accessed during this phase.

Current blocker: `TEST_DATABASE_URL`, `E2E_DATABASE_URL` and
`E2E_DEVELOPMENT_DATABASE_URL` were still absent from the executing session at the
last check. The user chose to supply process variables, not authorize reading `.env`.
Therefore full safe backend `test:ci`, live migration status/physical checks,
development/integration/E2E fingerprints, DB fixture checks and relevant Chrome
regressions **remain unexecuted for this change set**. No database was accessed or
mutated by this phase. No claim of fresh fingerprint equality is made. Retained
608-test backend and prior browser results do not verify the new production changes.

Primary-session review covered configuration, proxy trust, rate isolation,
error/log redaction, upload authorization/signatures/cleanup, lifecycle, bootstrap,
deployment CSP and operational documentation. It found and repaired an overly strict
hex-secret diversity check (a focused run had 87 passes/1 failure); the deterministic
regression and final 89-test focused/586-test unit runs pass. An earlier first run
also caught and repaired the multipart boundary rejection and a parameterized-test
setup error. Live staging CSP, trusted proxy behavior, bootstrap rollback/concurrency
and new database readiness queries still require integration/staging verification.

Final checkpoint verdict: **blocked**, not ship to staging. Phase 1 changes are
20 modified tracked files plus 10 untracked source/config/documentation files, all
unstaged. No Phase 1 commit/push, deployment, email/provider call, production resource,
DNS/billing change or database mutation was performed.

### Exact Phase 1 file inventory

Configuration and lifecycle:

```text
server/.env.example
server/src/config/env.js
server/src/config/security.js
server/src/config/readiness.js
server/src/config/lifecycle.js
server/src/app.js
server/src/server.js
```

Authentication, rate limits and redaction:

```text
server/src/utils/jwt.js
server/src/middleware/errorHandler.js
server/src/middleware/rateLimit.js
server/src/middleware/requestLogger.js
server/src/modules/audit/audit.service.js
server/src/modules/auth/auth.routes.js
server/src/modules/reports/report.routes.js
server/src/modules/search/search.routes.js
```

Attachment safety and operator bootstrap:

```text
server/src/middleware/upload.js
server/src/middleware/attachmentSignature.js
server/src/modules/attachments/attachment.routes.js
server/src/modules/attachments/attachment.service.js
server/src/modules/attachments/attachment.storage.js
server/scripts/attachment-cleanup.js
server/scripts/bootstrap-admin.js
```

Regression tests:

```text
server/src/middleware/__tests__/productionSecurity.test.js
server/src/middleware/__tests__/httpSecurity.test.js
server/src/middleware/__tests__/errorHandler.test.js
server/src/middleware/__tests__/bootstrap.test.js
server/src/modules/attachments/__tests__/attachment.service.test.js
server/src/modules/attachments/__tests__/attachment.upload.test.js
server/src/modules/auth/__tests__/mailer.config.test.js
```

Deployment preparation:

```text
client/vercel.json
docs/PRIVATE_BETA_RELEASE.md
```

Current browser verification configuration/documentation:

```text
e2e/browser-fixture.cjs
e2e/playwright.config.cjs
docs/E2E_TESTING.md
```

## Recommended bounded architecture

Use Vercel for the Vite SPA, one paid Render web service for Express, and managed
PostgreSQL in the same region. For the first private beta, use a backed-up Render
persistent disk mounted at an explicit absolute attachment directory. The current
adapter is filesystem-only: **S3 is not implemented**. Do not select an S3 provider
in configuration or deploy the current adapter onto ephemeral storage.

Render disks are single-instance and restrict deployment/scaling choices; plan a
short maintenance window. This also matches the current in-memory rate limiter.
Before multiple API instances, implement a shared rate-limit store (e.g. Redis)
and an S3-compatible attachment adapter with private buckets, authorized downloads,
stream limits, ownership/reference checks, quarantine and lifecycle policies.
Migrate attachment objects in a separately approved, verified operation; retain
metadata identifiers and reconcile checksums before cutting over. Do not invent
successful S3 support or run migration/copy commands against existing uploads here.

Official references checked for this preparation:

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Express on Render](https://render.com/docs/deploy-node-express-app)
- [Render persistent disks](https://render.com/docs/disks)
- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/)
- [Helmet headers and CSP](https://helmet.js.org/)
- [Prisma production migrations](https://www.prisma.io/docs/orm/migrations/applying-a-migration)

These are an architecture recommendation, not a claim that provider configuration,
availability, pricing, networking or storage durability has been verified for an
actual deployment.

## Configuration and fail-closed startup

Supply production secrets through the host's secret manager/process environment,
not checked-in files, build arguments, shell history or frontend `VITE_*` variables.
Production runtime does not load dotenv. Local development still supports dotenv;
automated tests explicitly prevent reading it.

Required backend variable names:

- `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`, `CORS_ORIGINS`
- `STORAGE_PROVIDER`, `ATTACHMENT_STORAGE_ROOT`, `ATTACHMENT_STORAGE_PERSISTENT`

Operational variables:

- `PORT`, `JWT_EXPIRES_IN`, `TRUST_PROXY`, `LOG_FORMAT`, `EMAIL_PROVIDER`
- `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`
- `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX`
- `SEARCH_RATE_LIMIT_WINDOW_MS`, `SEARCH_RATE_LIMIT_MAX`
- `UPLOAD_RATE_LIMIT_WINDOW_MS`, `UPLOAD_RATE_LIMIT_MAX`
- `REPORT_RATE_LIMIT_WINDOW_MS`, `REPORT_RATE_LIMIT_MAX`
- `MAX_ATTACHMENT_SIZE_MB`, `ALLOWED_ATTACHMENT_MIME_TYPES`

Frontend public variable: `VITE_API_URL`. It must point to the HTTPS API `/api`
base before building; no secrets belong in it.

Use production mode explicitly. Generate the JWT secret from at least 48 random
bytes in a trusted secret manager; validation requires at least 48 bytes, rejects
obvious placeholders/low-diversity strings, but cannot prove entropy. Tokens use
HS256 only; production expiry is a positive `m`, `h` or `d` interval at most one
day. Rotation invalidates current sessions; plan communication and re-login.

Production client URL requires public HTTPS; CORS requires explicit HTTPS origins
without paths, credentials, wildcards, query or fragment. Include only the approved
frontend origin(s), not arbitrary preview subdomains. CORS is not authentication.
Use TLS with certificate verification for the managed database as required by its
provider. Prefer separate runtime and migration roles; the runtime needs application
table access and read access to the migration ledger, not database-owner privileges.

`TRUST_PROXY` defaults to false. Only explicit IP/CIDR entries are accepted, never
`true`, a hop count, or a catch-all range. Before staging, obtain and test the actual
proxy path: the edge must overwrite forwarding headers, direct API access must not
bypass it, and no untrusted workload may originate from an allowed subnet. Do not
guess Render/Railway proxy ranges. If the provider cannot give a verifiable boundary,
keep trust disabled (shared-edge clients may share a limit) and resolve topology as
a staging blocker. Spoofed forwarding headers must not change the effective IP.

Numeric limits are positive and bounded. General API defaults to 120/minute/IP;
auth endpoints each have a separate 10/15-minute/IP bucket; resend additionally
limits its validated email identity. Password changes have a per-authenticated-user
bucket. Search 60/minute/user, uploads 20/minute/user, reports (including CSV/CSAT)
30/minute/user. Other endpoints retain the global IP ceiling. Authenticated IDs come
from the database-authorized JWT path, never client identity headers. Expired entries
are swept and per-limiter cardinality is bounded; saturation returns sanitized 429.
Process restart resets counters. Edge DDoS protection and multi-instance shared
limits are deferred, not supplied by this implementation.

## HTTP and browser policy

The API emits a deny-all document CSP, frame denial, nosniff, no-referrer,
Permissions-Policy, no-store and production HSTS. It does not serve the SPA.
Unknown routes and unexpected errors do not echo URLs, SQL, paths or stacks.
Known validation/domain errors remain useful; request logs use route templates,
never bodies, query strings, auth headers or cookies. Audit/Prisma/provider failure
logs are static signals. Configure the hosting edge to redact query strings,
Authorization and Cookie headers too; application redaction cannot govern edge logs.

`client/vercel.json` is a deployment template with an intentionally non-working
`https://api.example.com` connect-src placeholder. **Replace only this public origin
with the actual staging API origin before deployment**, matching `VITE_API_URL`.
Do not add wildcard connect-src or unsafe-eval. Configure equivalent headers at any
other frontend host. Vite development/preview is not a production server.

The SPA permits inline **styles only** because react-hot-toast/goober injects style
elements and progress/trend components assign dynamic widths. Scripts still require
self-hosted external files, and inline event handlers are forbidden. This bounded
style allowance is intentional; nonce-based styling would require a separate
rendering/hosting change. Verify toasts, charts, dialogs, downloads and upload progress
under the deployed CSP. API Helmet headers do not protect a separately hosted SPA.

## Attachments

Uploads require authentication and ticket access before storage, with a second
transactional authorization/archive check before publishing metadata. Configurable
size limits, one file/no fields, MIME-extension pairs, safe names, random managed
paths, exclusive creation, ancestor/link checks and bounded content signatures are
enforced. A renamed executable cannot masquerade as a supported document simply
by supplying its MIME header. Downloads remain authorized and attachment-disposition;
the API is not a public static file host.

Signatures are **not antivirus or a full parser**: Office macros, malicious ZIP
contents and polyglots remain risks. For the beta, restrict the MIME allowlist to
the minimal business need, retain forced download, and communicate this limitation.
Before wider rollout, add isolated malware scanning/quarantine and archive-bomb
defenses without trusting client MIME claims. Existing uploads were not inspected.

Set an absolute persistent attachment path and the persistence assertion only after
mount/restart/backup/restore tests. The assertion does not prove the disk is durable.
Do not place uploads beneath a publicly served directory. The runtime account needs
only its storage directory. Monitor disk capacity and cleanup failures.

## Build and migration sequence (future approved staging operation)

1. Select supported Node LTS and locked dependencies; review dependency advisories
   before deployment. No dependency/security certification is implied here.
2. Backend working directory `server`: `npm ci`, `npm run prisma:generate`.
3. Frontend working directory `client`: `npm ci`, `npm run build`; publish `dist`
   through the frontend platform with the reviewed routing/headers template.
4. Snapshot the target database and attachment volume; stop all application writers
   for the approved migration window. Independently verify the target and checksum
   set. Run **`npx prisma migrate deploy` from `server`** exactly for approved pending
   migrations, then `npx prisma migrate status`. Never `migrate dev`, `db push`, reset,
   drop, truncate or the sample seed in a deployed database. No migration is needed
   for this release preparation, and none was applied by this work.
5. Backend start command: `npm start`, with production process configuration and a
   provider-assigned port. Use `/health/ready` as the load-balancer health check.

`/health` is dependency-free liveness. `/health/ready` checks database connectivity
and the complete successful migration ledger/checksum manifest in a read-only,
bounded transaction; results coalesce/cache for five seconds. Responses disclose
only ready/unavailable. In production, API traffic is refused while the dependency
check fails. Readiness does not prove absence of manual physical-schema drift or
storage durability; verify both separately at deployment. Keep migration files in
the backend image. SIGINT/SIGTERM mark draining, stop HTTP intake, drain requests,
then disconnect Prisma; a ten-second deadline force-closes owned HTTP connections.
Unhandled failures log only a static message and exit nonzero for supervisor restart.

## First Admin and email-disabled beta

Do not run `prisma/seed.js`: it creates demonstration credentials and tickets.
For a separately approved **new deployment with an empty User table**, stop writers,
verify the target and all migrations, and verify the first operator's identity through
a trusted out-of-band channel. Inject `BOOTSTRAP_APPROVED`, `BOOTSTRAP_ADMIN_NAME`,
`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` in a one-shot secret-manager job
with the production backend configuration. Set approval explicitly, use a unique
password of at least 16 characters, and run `node scripts/bootstrap-admin.js` from
`server`. It locks User, refuses any existing account, hashes with bcrypt, and creates
one verified Admin plus an audit entry in one serializable transaction. It never
prints the password. Remove all bootstrap variables immediately. This script was
not executed against any database during release preparation.

For an existing deployment, recover an existing Admin using a separately reviewed
procedure; never use bootstrap to overwrite/promote accounts. Admin-created beta
accounts are verified by the existing schema default: the operator must verify each
identity and deliver unique initial credentials securely. Public self-registration
still requires email verification and cannot complete while delivery is disabled.
Do not imply otherwise, expose verification tokens or bypass the login guard.

Keep `EMAIL_PROVIDER=disabled`: no sending domain or Resend credential is required.
Enable a provider only after a separate approval/domain verification. DISABLED is
not ACCEPTED or DELIVERED, and provider acceptance is not delivery evidence.

## Operations, backup and rollback

- External SLA scheduling is optional and **not configured here**. After approval,
  invoke the one-shot `npm run sla:sweep -- --batch-size=100 --max-batches=20`
  with runtime configuration; prevent overlapping jobs and monitor exit/status.
- Attachment cleanup defaults to dry-run: `npm run attachments:cleanup --
  --grace-hours=24 --batch=100`. Never run against real uploads during verification.
  Execute/quarantine requires separately approved maintenance with writers stopped;
  review [ATTACHMENT_CLEANUP.md](ATTACHMENT_CLEANUP.md). Never treat quarantine as an
  automatic permanent-delete policy.
- Set managed PostgreSQL backups/PITR, encrypted storage backups, retention/access
  limits, and a restore drill to an isolated target. Reconcile attachment references
  and files after restore. Record recovery-time and recovery-point objectives.
- Retain the prior application image/configuration. Roll back code only when schema
  compatible; do not edit applied migrations or apply destructive down migrations.
  Restore data only through an approved incident procedure, never over a live DB.
- Monitor readiness, latency, 5xx/429, disk space, audit write failures, sweep lag,
  DB connections and backup success. Protect logs and configure retention/alerts.
  A successful automated suite does not verify any of these hosted operations.

## Release gate and limitations

Before `ship to staging`: all focused/security, complete safe backend (including
isolated database cases), frontend/build, infrastructure and relevant browser
regressions must pass; database fingerprints/fixture cleanup and migration checksums
must be verified; perform final diff/secret review. Never infer new DB/browser
results from the retained 608-test backend or earlier Chrome runs.

Before inviting real beta users: staging smoke tests under actual HTTPS/CSP/proxy
headers, persistent storage/restart and restore tests, first-admin procedure,
monitoring/alerts and rollback drill must pass. Replace the CSP placeholder.
Verification connections must remain process-only. For this local verification,
the user explicitly authorized private in-memory reading of `server/.env` solely
to derive the three guarded local connections. This does not authorize displaying,
persisting or modifying environment values, or using them for deployment.

Known retained coverage limitations: installed Chrome only; mobile means desktop
emulation; physical devices, Firefox, WebKit, bundled Chromium and manual assistive
technology remain unverified. Axe incomplete states are not passes. Independent
Windows-wide process inventory was access-denied; runner-owned shutdown is narrower
evidence. The coverage matrix retains partial workflows. No certification claimed.
