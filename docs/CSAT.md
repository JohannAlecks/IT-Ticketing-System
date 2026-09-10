# Customer satisfaction (CSAT)

Requester-only 1–5 feedback, optional trimmed 1,000-character comment, editable
for 14 elapsed days after a completed resolution. The endpoint rejects inactive
requesters, active tickets, other owners, stale versions and expired windows.
Archived completed tickets remain eligible because feedback is not a ticket edit.

## Completion identity and preservation

Every future transition to RESOLVED increments a ticket completion counter and
creates an immutable TicketResolutionCycle in the same transaction. This covers
tickets without SLA. Reopening preserves cycles and feedback; another resolution
creates a new cycle. Closing preserves the completed cycle. Earlier completions
are unavailable: no historical timestamps, attribution, or ratings are fabricated.
Existing tickets can become eligible when genuinely resolved again.

Cycles snapshot requester, resolution time, department, and attributed Agent.
Admin-resolved or unassigned work is unattributed. Reassignment and deactivation
never recalculate attribution. Agent removal sets the attribution relation null;
requester/ticket/cycle/feedback relations use RESTRICT to preserve records.
Tickets with completion cycles must be archived instead of permanently deleted.

## API and concurrency

- GET/POST/PATCH /api/tickets/:ticketId/satisfaction
- GET /api/satisfaction/me (requester, paginated)
- GET /api/satisfaction/summary (Agent/Admin, last 30 days)
- GET /api/reports/satisfaction (Agent/Admin)

Bodies strictly allow rating and comment only. GET returns a server-issued
editToken; POST and PATCH send it in If-Match, never as client-controlled cycle
or identity fields. Missing token is 428, stale cycle/version or expiry is 409,
inaccessible feedback is 404. To preserve lost-update detection, polling does
not silently upgrade an unsaved form's token. Conflict reload explicitly discards
the draft; transient failures otherwise preserve it.

Writes lock the requester then ticket, recheck role/activity/ownership/current
cycle/status/deadline, and use a unique cycle constraint plus conditional feedback
versions. A database-clock expiry check at transaction end rolls back all writes
if the window closed. Feedback does not modify ticket updatedAt. CSAT queries and
mutations are account/role scoped and removed by protected-cache cleanup.

## Privacy, reporting, notifications

Agents see only their immutable attributed feedback, including after reassignment.
Admins see service-wide authorized feedback. Requester email and ticket contents
are not returned by CSAT reports. Comments render as text, never HTML.
The date range is original submission date, inclusive UTC days, maximum 366 days;
edits retain the original date. Admin filters use snapshot Agent/department and
rating; Agent scope cannot be overridden. Empty averages are null. Response rate
is unavailable because no historical invitation denominator is inferred.

Summary shows average/count only; Reports adds distribution, pagination, comments,
and Admin daily trends. No leaderboard or CSAT CSV export is added. The existing
ticket CSV remains unchanged, including its limits and formula-injection defense.
No new Settings preference is added in v1. The generic in-app submission alert
goes once to the active attributed Agent, excludes the actor, and never broadcasts
to Admins. Edits do not alert again. No email is sent.
Audit events record ticket/cycle/rating/hasComment only, never feedback text.

## Verification and operation

Migration 20260910000000_add_ticket_satisfaction requires separate explicit
approval before prisma migrate deploy. Do not db push/reset or backfill.
After approval, opt into the isolated local database suite with process-local
RUN_CSAT_DB_TESTS=true and run Jest satisfaction.integration.test.js. It verifies
the exact localhost:5432/ticketing_db/public target and applied migration, creates
uniquely prefixed fixtures, and removes only its own UUIDs. Never use that cleanup
against real records. Non-database checks use controlled time.

Manual smoke checks after migration: requester submit/edit and expiration;
keyboard Tab/arrow/Space radio selection; transient error preserves draft;
reopen/re-resolve preserves history; archive remains rateable; Agent reassignment
does not change reports; account switching clears data; mobile and light/dark
surfaces/focus indicators. No automatic scheduler or retention deletion exists.
