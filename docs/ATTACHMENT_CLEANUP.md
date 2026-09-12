# Safe Attachment Cleanup — Phase C

## Final checkpoint: ship (2026-09-12)

Phases A and B remain ship. Phase C required no migration. All 18 migrations
are current and every applied SQL checksum still matches. No migration was
rerun. Final primary-session three-phase review passed; no workers, Astral,
delegation, or separate reviewer were used.

Final verification:

- Focused attachments, ticket service and user-directory regression run:
  **110 passed in seven suites**, including eight real PostgreSQL attachment
  tests with synthetic files only.
- Complete backend after final service/controller repairs: **554 passed,
  20 skipped; 43 passing suites, three skipped suites**. Enabled DB coverage:
  Department (8), Email Logs (6), attachments (8), lifecycle, watchers, ticket
  integrity, notifications and knowledge. The unrelated SLA, CSAT and personal
  opt-in DB suites were not enabled; their unit/route tests ran.
- Attachment DB fixtures: users, tickets, attachments, history and audits all
  zero afterward. Test-owned temporary directories removed and absence checked.
- All 19 pre-existing tables' full-row and physical-structure fingerprints
  remain identical to the retained Phase B baseline. Legacy mapping remains
  11 users, nine empty/unassigned and two linked to two departments; no invalid
  mapping or duplicate normalized department.
- Prisma validation and migration status passed. `git diff --check` passed.
- Redacted scan: 74 changed text files, 20 recognized synthetic fixture matches,
  zero likely real credentials. No secret values printed.
- No Phase C frontend edits: retain Phase B full frontend **263/263 in 56 files**,
  focused **19/19**, and successful production build (1786 modules; existing
  >500 kB bundle-size warning). No unnecessary frontend/build rerun.

Review repairs: shared validated/exclusive Multer writes and failed-upload
removal; sanitized download/cleanup errors and public attachment projections;
strict end-of-filename validation; missing-file identity protection; fresh
delete authorization within the transaction; duplicate/archived reference
preservation; a Department missing-membership filter now intersects an explicit
department instead of overwriting it. Regression tests cover these paths.
The initial full run discovered the new fixture helper as an empty Jest suite;
moving it outside `__tests__` fixed discovery, and subsequent full runs passed.

## Inspected lifecycle before implementation

- Local storage is fixed at server/uploads; Multer generates UUID + allowed
  extension filenames. Attachment metadata stores the generated basename.
- Upload middleware currently writes the file before authorization/database
  publication. Rejected uploads attempt an unchecked, silent unlink.
- Downloads enforce ticket visibility, resolve the stored path, and permit
  archived tickets. Existing lexical path checks do not reject symlink targets.
- Attachment deletion requires ticket visibility plus Admin, uploader, or
  assigned-Agent authority. Metadata/history commit before filesystem unlink.
  Filesystem failure is reported, but its audit includes a raw path/error.
- Permanent Admin ticket deletion already exists. It refuses archived tickets
  and tickets with completed feedback cycles, captures attachment inventory,
  commits metadata cascade and then unlinks files. Its failure audit also exposes
  raw filesystem details. No new ticket deletion capability is needed.
- Attachment storagePath is not unique. A duplicate/legacy reference must never
  cause a still-referenced file to be deleted. Archive does not remove metadata.
- Existing audit records can record safe failure categories; orphan files
  themselves remain discoverable after failed unlink or a process interruption.
  Therefore a dedicated cleanup queue/outbox or new migration is not justified.
- Git ignores uploads, PDFs, build output and temporary directories. Real uploads
  have not been enumerated, read, removed or subjected to cleanup during this task.

## Implementation contract

Use one shared local-store validator for middleware, download and cleanup.
Restrict operations to flat generated UUID filenames with supported extensions;
reject malformed paths, external absolute paths, symlinks/junctions and hard links.
Validate the root and ancestors and recheck file identity immediately before a
mutation. Application-owned directories must not be writable by untrusted users;
portable Node APIs cannot provide a race-proof openat/unlinkat sandbox against a
privileged local adversary replacing path ancestors between syscalls.

Keep metadata-first deletion. On DB failure the file stays untouched; on storage
failure report a safe partial-result error and retain the orphan for operator
recovery. Recheck all current references, including archived tickets and duplicate
case-insensitive filenames, before any post-commit removal. Coordinate publication
and cleanup through a shared PostgreSQL advisory lock.

Provide an operations-only scanner: default dry-run, bounded batch/enumeration,
configurable grace period, fail-closed reference inventory, safe hashed output.
Execute additionally requires explicit acknowledgement that writers are stopped;
quarantine only, never automatic purge. Each unique quarantine entry records a
content-free intent manifest before moving the file. Partial results return a
nonzero exit code and remain recoverable. No browser execution endpoint.

Tests use only newly created synthetic directories and fixtures. No execute or
dry-run scan of the real upload directory will be run for verification.

## Normal application behavior

The shared module is `server/src/modules/attachments/attachment.storage.js`.
It performs no filesystem access at import. Multer streams only to exclusively
created generated filenames through this module; normal size/type checks stay
in place. Rejected uploads clean only their unpublished generated file and
surface cleanup failures. Public list/upload responses exclude storage paths.
Download visibility remains enforced and archived downloads stay available.

Attachment deletion retains Admin/uploader/assigned-Agent authorization and
rechecks current ticket assignment and attachment ownership in the transaction.
Archive and optimistic ticket-update guards remain. The path and file identity
are validated before metadata/history deletion. The existing Admin-only ticket
deletion retains archive/feedback-cycle restrictions and validates its complete
attachment inventory before the existing cascade. No new deletion endpoint.

After DB commit, each file is removed only under advisory lock `(73521, 3)` and
after rechecking all metadata references, including archived tickets. Duplicate
case-insensitive names remain protected. Missing files are idempotent. A changed
file identity, unsafe storage, or unlink failure produces a sanitized 503, not a
false success. A safe `attachment.cleanup_failed` audit contains operation,
entity IDs, a generated-name hash and recovery category, never a path/raw error.
Audit failure emits only a fixed safe warning; the orphan remains rediscoverable.

PostgreSQL and filesystem operations are not atomic. A crash after metadata
commit can leave an orphan without an audit, but cannot make this cleanup delete
a still-referenced file. Recover through a reviewed orphan scan, not by assuming
a second DELETE on the now-missing attachment ID will retry storage cleanup.
No queue/outbox migration is necessary for this conservative recovery design.

## Operator runbook (not executed against real uploads)

From `server`, a future read-only report uses:

```powershell
npm run attachments:cleanup -- --grace-hours=24 --batch=100
```

Defaults: dry-run, 24-hour grace and 100-file batch. Accepted grace is an integer
1–8760 hours; batch is 1–500. Inventory and directory enumeration are capped at
10,000 entries; excess or malformed database references fail closed. Unmanaged
names, directories and quarantine internals are ignored; managed symlinks or
hardlinks cause a safe failure. Age uses the later of mtime/ctime. Output is
deterministically sorted hashed identifiers and counts, never attachment content
or physical paths. Dry-run does not create quarantine directories or audits.

Only after separate operational approval, review, backup, and stopping all
application/external upload writers, a future operator could add
`--execute --writers-stopped`. This is not permission to run it now. The CLI has
no configurable arbitrary root and no browser execution endpoint. The stop flag
is an operator acknowledgement, not automatic process detection; the DB lock
coordinates cooperating metadata writers, not unrelated external file writers.

Execution rechecks references under the same advisory lock used by upload
publication. It moves eligible orphans to a unique directory under
`.quarantine/<generated-entry-id>/`, never overwriting an existing entry.
`intent.json` is written exclusively before the move and contains only generated
relative filename/hash, size and timestamps. It records intent, not an assertion
that the move finished. On partial failure, inspect the intent and file presence
through a controlled operator process; retry may create another intent directory
while safely processing the still-present orphan. Successful entries remain
untouched on repeated scans. No attachment content is read by cleanup.

Unsafe configuration or partial failure returns exit code 1. Successful dry-run
or quarantine returns 0. No purge, retention job, scheduler, or restore endpoint
is provided. A future purge requires a separately approved action and retention
policy; valid-file recovery must be reviewed manually, never via arbitrary paths.

## Operational limitations

- Upload-root ancestors and ACLs must remain application-owned, not writable by
  untrusted actors. Portable Node path checks cannot eliminate privileged local
  path-replacement races between syscalls. Symlinks/junctions and hard links are
  rejected; Windows junction-escape and hard-link tests passed.
- The global advisory lock prioritizes safety over high-volume upload throughput.
  Large stores above the conservative inventory cap require a separately reviewed
  bounded-inventory design; operators must not raise limits blindly.
- Old unmanaged filenames are intentionally not deleted. Malformed metadata
  blocks cleanup and requires an operator to investigate without rewriting data.
- Quarantine consumes disk space indefinitely; no automatic purge was authorized.
- Existing PDFs/uploads were neither scanned nor read nor cleaned. Browser visual,
  responsive and keyboard smoke testing remains a manual step for A/B screens.
- Email stays disabled; no real email or Resend network request was made.

## Changed-file groups and final workspace state

- Department Administration: Prisma model/applied SQL; department schema,
  projection, service/routes and tests; read-only migration-inspection script;
  Auth/Settings/Users/Summary/Reports/search/new-CSAT-snapshot integration;
  client Department API/hooks/directory/picker and Settings/Users integration.
- Email Logs: Prisma enums/model/applied SQL; Email Logs schema/service/routes
  and DB/unit tests; mailer/auth integration; client API/hook/Admin page and
  registration-status tests. Shared App/sidebar/API routes register A/B.
- Attachment Cleanup: upload middleware; attachment storage/cleanup/service/
  controller; existing ticket deletion; CLI and package script; attachment
  service/controller/upload/filesystem/DB tests; ticket-service tests and
  test-only synthetic-store helper. No frontend or schema changes for Phase C.
- Documentation: this file, DEPARTMENT_ADMINISTRATION.md, EMAIL_DELIVERY_LOGS.md.

At final verification: branch `main`, HEAD `66ccd06`, **37 modified tracked files,
37 untracked files, zero staged**. All work remains available for manual review.
`tatus` unchanged; no real environment file, upload, PDF, generated binary or build
output staged/changed by this work. No temporary Astral artifacts were created
or found among changes. Only verified synthetic test directories were removed;
the fixture helper was relocated, not discarded. No commit/push/deploy/reset,
existing-data deletion, scheduler, email, or applied-migration modification.
