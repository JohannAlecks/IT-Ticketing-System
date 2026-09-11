# Global Search v1

Search is an authenticated, read-only view over current permissions. It never
grants resource access or writes search history, audit events, saved views,
shortcuts, emails, or database records. No new migration or external service.

## API and authorization

`GET /api/search?q=...&type=all&includeArchived=false&limit=5`
returns at most five entries per authorized group. `GET /api/search/results`
accepts q, type, includeArchived, page (1–100), and pageSize (1–20). Both reject
unknown parameters, arrays, malformed numbers/booleans and invalid types. Query
text is limited to 100 characters, trimmed with whitespace runs normalized, and
must contain at least two Unicode letters/numbers. Controls/format characters
are rejected. LIKE metacharacters are escaped; Prisma parameterizes all input.

Types: all, tickets, knowledge, users. Non-Admin explicit users requests return
403; all omits that group. Authentication and a current account read reject
deactivated/unverified accounts and use the database role, never the JWT role.
Ticket predicates reuse buildTicketVisibilityFilter: USER owns the ticket;
AGENT is its assignee or it is unassigned; ADMIN has existing service-desk access.
Knowledge predicates reuse readPolicy, further intersected with PUBLISHED and
not archived even for Admin. USER gets PUBLIC articles; staff can also get
published INTERNAL articles according to the existing reader permission.
User-directory access reuses authorize('ADMIN'). Inactive directory entries
remain visible to Admin only. Every query applies these rules before retrieval.

Archived tickets are excluded unless includeArchived=true; that flag includes
active AND archived matches and never relaxes ownership. Detail routes still
enforce authorization and archived mutation guards. All group queries select
only display/navigation fields, fetch one lookahead row for hasMore, and use
updatedAt descending then ID ascending for deterministic per-group pagination.
There is no total-count query. All groups paginate independently on the same
page number; filter to a single group when browsing deeply.

Tickets: title, displayed #UUID prefix/full UUID, category/status, visible
requester/assignee names. No descriptions, comments, notes, attachments, SLA
internals, CSAT text, or notification/audit contents. Knowledge: title, summary,
exact normalized tag, category; not body or draft/review content. Admin users:
name, email, department, role and exact active/inactive status. Excerpts are
short plain-text summaries, never HTML. Paths are generated from internal
route mappings, not user-controlled destination fields. User links open the
existing Admin directory with all statuses and focus the matching row.

## UI, privacy, and performance

Header search debounces 300ms; arrows/Enter select, Escape returns focus,
outside click/blur closes, View all navigates to /search. Full results preserve
query/type/archive/page in the URL, with bounded pagination and explicit empty,
loading, error/retry states. Mobile uses a viewport-bounded dropdown; existing
theme colors, status badges and date helpers are reused. Search is not saved
automatically. URL query text is necessarily visible in browser history; no
application search-history feature or localStorage persistence is added.

Query keys include account, role, mode, normalized q, type, archived flag and
pagination. Requests honor AbortSignal and cancel on input changes, unmount,
logout/account changes. Cache GC is immediate when unused; no placeholders or
cached results are shown during refetch/error. Same-account protected mutations
invalidate search. Focus/mount always refresh; visible pages poll every 30s.
Other-session changes are enforced on the next request and destination access;
already-rendered text cannot be remotely recalled instantaneously without push.

The existing IP limiter remains, plus the same limiter implementation enforces
60 authenticated search requests/minute/account/process. No query strings are
included in text/JSON request logs. Prisma operational events are redacted
because raw errors can contain query values. API errors never expose SQL,
Prisma internals, search terms or result content.

Existing ownership, category, archive and publication indexes can narrow
queries, but case-insensitive substring matching and relation-name matching
may scan authorized rows. Limits bound returned data, not necessarily scanned
rows. This v1 has no relevance scoring, typo tolerance, stemming, business-wide
full-text index, cursor stability during concurrent edits, or distributed rate
limiter. Ordering favors recency, not title similarity. Inspect representative
EXPLAIN plans and volume before proposing any additive search indexes; none
were speculatively added. No migration approval is needed for this change.

## Verification and manual smoke

Run backend search/logging tests and complete Jest suite; frontend search/hook/
page tests and complete Vitest suite; production Vite build; Prisma validate;
git diff --check and redacted changed-file scan. Tests cover query construction,
current-role access, excluded content, bounded results, safe errors, debounce,
abort/late responses, account isolation, keyboard behavior and URL validation.

Manual: each role, short/long/no-match queries, archived toggle, published vs
draft/internal articles, Admin inactive directory links, keyboard-only search,
mobile viewport, dark theme, long titles, logout while a request is pending.
Production-scale performance and real screen-reader/mobile checks remain manual.
