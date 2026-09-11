# Saved ticket views and personal shortcuts

Per-account database preferences, not grants of ticket access. USER has My Tickets
and Archived scopes; AGENT has Assigned to me, All authorized (assigned/unassigned),
and Archived; ADMIN has All authorized and Archived. Current role/activity is
reread under an account lock. The normal ticket service always applies visibility,
archive boundaries, SLA/department restrictions and existing safe projections.

Structured filters reuse the ticket list schema: status, priority, category,
Agent ID (Admin or own Agent), department (Admin), SLA state (staff, active only),
work-blocking boolean, assignment state, waiting reason (staff), sort field/direction.
Search is limited to 200 characters in normal lists but NEVER persisted. Pagination,
search, arbitrary Prisma objects, private content and identity fields are rejected
by saved-filter validation. Names/labels are plain text, never HTML.

Limits: 20 views and 8 total shortcuts (including unavailable ones) per account.
Names are trimmed 1–60 characters, unique after NFKC/case normalization; labels
are trimmed 1–40. Mutations lock the owner row before checking limits or ordering.
PATCH/DELETE require a positive integer version; reorder supplies every current
shortcut ID/version once, in desired order. Stale state/limits/duplicates return
409; unknown fields return 422; inaccessible records return 404 even for Admins.

Routes: GET/POST /api/saved-views; PATCH/DELETE /api/saved-views/:id;
GET /api/saved-views/:id/tickets (page/limit only). GET/POST /api/shortcuts;
PATCH/DELETE /api/shortcuts/:id; PATCH /api/shortcuts/reorder with items[].
All routes authenticate and return private, no-store. Shortcut route keys resolve
through personal.policy.js, never arbitrary URLs. Agent Reports means existing
personal Reports, not Admin Reports. SLA Settings points to the Admin-only section.

SavedTicketView and UserShortcut cascade only when their owning User is permanently
deleted. Deactivation changes neither. A composite owner/view FK prevents cross-owner
targets; deleting a view cascades only its shortcuts. There are no ticket writes,
backfills, new noisy audit records, email deliveries, schedulers or storage persistence.
Reordering parks rows in positions 8–15 within one transaction, then commits unique
contiguous 0–7 positions. The SQL range permits this private intermediate state.
A deferred constraint trigger checks the final row state at commit; a transaction
that leaves any parking position behind is rejected and rolled back by PostgreSQL.
The service also checks deferred constraints before COMMIT so Prisma 5 cannot
silently report success when PostgreSQL rejects the commit protocol.
The explicit check uses `public.user_shortcuts_committed_position`; its check
violations become a generic HTTP 409 with no raw database or Prisma details.

UI: Save current view on Tickets, Assigned Tickets and Archived Work Items.
Saved view pages use the same filters/table/pagination, reset page on filter changes,
track dirty drafts with their original version, and require explicit save/update.
Settings offers shortcut add/rename/remove and keyboard-operable move buttons.
Unavailable destinations have no link and can be removed. Sidebar hides empty lists
and uses the same responsive scrolling navigation. All queries/mutations are protected
by account and role, cancellable on logout; there is no optimistic rollback to leak
late data. Drafts are keyed by account, role and saved view.

## Migration gate

20260911000000_add_saved_views_shortcuts is additive and requires its own explicit
approval. Do not migrate reset/db push/backfill. Before approval run Prisma format,
validate/generate, non-DB backend/frontend tests and frontend build. After approval,
run migrate deploy once, status, and RUN_PERSONAL_DB_TESTS=true with Jest's
personal.integration.test.js on localhost:5432/ticketing_db/public only. That suite
creates UUID-prefixed fixture users/preferences (no tickets), tests concurrent limits,
versions, ownership and FK behavior, then deletes only its fixture user IDs and asserts
users/views/shortcuts are zero. Re-run full verification after migration.

Manual smoke: save/rename/update/delete a view, change filters across tabs and verify
409 preserves drafts, reopen a sidebar shortcut, switch account/role with requests
pending, verify only current permissions, reorder via keyboard, and inspect mobile,
dark mode, focus and long names. Search omission is deliberate; shared views,
external shortcuts and organization-wide templates are outside this feature.
