# Ticketing System — Backend + Frontend (Steps 1–5)

This package contains:
- **`server/`** — Express + Prisma + PostgreSQL API (`auth`, `users`, `tickets`, `comments`, `dashboard`)
- **`client/`** — React (Vite) + Tailwind frontend wired to the real API above

Run the backend first (Part 1 below), then the frontend (Part 2).

---

# Part 1 — Backend

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally or accessible remotely
- npm

## 1. Install dependencies

```bash
cd server
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point at your Postgres instance, e.g.:

```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ticketing_db?schema=public"
```

Also change `JWT_SECRET` to a long random string (e.g. `openssl rand -hex 32`).

## 3. Create the database

Make sure a Postgres database named `ticketing_db` (or whatever you put in
`DATABASE_URL`) exists:

```bash
# example using psql
psql -U postgres -c "CREATE DATABASE ticketing_db;"
```

## 4. Run migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

This creates all tables (`users`, `tickets`, `comments`, `ticket_history`)
from `prisma/schema.prisma`.

## 5. (Optional but recommended) Seed sample data

```bash
npm run prisma:seed
```

This creates three already-verified accounts you can log in with immediately:

| Role  | Email               | Password       |
|-------|---------------------|----------------|
| Admin | admin@example.com   | Password123!   |
| Agent | agent@example.com   | Password123!   |
| User  | user@example.com    | Password123!   |

It also creates two sample tickets.

## 6. Start the server

```bash
npm run dev
```

The API will be running at `http://localhost:5000`. Check it's alive:

```bash
curl http://localhost:5000/health
# -> {"status":"ok"}
```

## 7. Try it out

Register a new user (new registrations require email verification):
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"SecurePass123"}'
```

Log in (or use one of the seeded accounts):
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Password123!"}'
```

Copy the `token` from the response, then create a ticket:
```bash
curl -X POST http://localhost:5000/api/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"title":"Printer not working","description":"The 3rd floor printer is jammed.","priority":"LOW","category":"PRINTER_SCANNER"}'
```

## Useful commands

```bash
npm run dev              # start with nodemon (auto-restart)
npm run start             # start in production mode
npm run prisma:studio     # open Prisma Studio (visual DB browser) at localhost:5555
npm run prisma:migrate    # run new migrations after editing schema.prisma
npm run prisma:generate   # regenerate the Prisma client
```

## Project structure

```
server/
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── config/          # env.js, prisma.js (singleton client)
│   ├── middleware/       # authenticate, authorize, validate, errorHandler
│   ├── utils/             # AppError, asyncHandler, jwt
│   ├── modules/
│   │   ├── auth/          # register, login, /me
│   │   ├── users/         # admin user management, /agents list
│   │   ├── tickets/       # full CRUD, assignment, RBAC visibility
│   │   ├── comments/      # nested under tickets, public + internal notes
│   │   └── dashboard/     # aggregated stats
│   ├── routes/index.js    # mounts all module routers under /api
│   ├── app.js
│   └── server.js
├── .env.example
└── package.json
```

## API Endpoint Reference

All routes are prefixed with `/api`. Protected routes require
`Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| POST | `/auth/register` | — | any | Register (always creates a `USER`) |
| POST | `/auth/login` | — | any | Log in (verified active accounts only), returns `{ user, token }` |
| POST | `/auth/verify-email` | — | any | Consume a verification token; safe to retry after successful verification |
| POST | `/auth/resend-verification` | — | any | Generic anti-enumeration resend response; delivery is only attempted when available |
| GET | `/auth/me` | ✅ | any | Current user profile |
| GET | `/users/agents` | ✅ | AGENT, ADMIN | List active assignment candidates (id, name, role only) |
| GET | `/users` | ✅ | ADMIN | List all users |
| GET | `/users/:id` | ✅ | ADMIN | Get one user |
| POST | `/users` | ✅ | ADMIN | Create a user with a specific role |
| PATCH | `/users/:id/role` | ✅ | ADMIN | Change a user's role |
| PATCH | `/users/:id/status` | ✅ | ADMIN | Activate/deactivate a user |
| PATCH | `/users/:id/deactivate` | ✅ | ADMIN | Deactivate a user, unassigning unresolved tickets with history |
| PATCH | `/users/:id/reactivate` | ✅ | ADMIN | Reactivate a user |
| GET | `/tickets` | ✅ | any | List tickets (filtered by role visibility) — query: `status, priority, category, assignedToId, search, page, limit` |
| GET | `/tickets/:id` | ✅ | any* | Get one ticket with comments + history |
| POST | `/tickets` | ✅ | any | Create a ticket |
| PATCH | `/tickets/:id` | ✅ | any* | Update title/description (USER); + status/priority (AGENT/ADMIN) |
| PATCH | `/tickets/:id/assign` | ✅ | AGENT, ADMIN | Assign/unassign a ticket |
| DELETE | `/tickets/:id` | ✅ | ADMIN | Delete a ticket |
| GET | `/tickets/:ticketId/comments` | ✅ | any* | List comments (internal notes hidden from USER) |
| POST | `/tickets/:ticketId/comments` | ✅ | any* | Add a comment (`isInternal` restricted to AGENT/ADMIN) |
| GET | `/dashboard/stats` | ✅ | any | `{ total, byStatus, byPriority, recentActivity }` scoped to role visibility |

`*` USER role is restricted to tickets they created — enforced server-side, not just hidden in the UI.

**Role visibility rules** (enforced in `ticket.service.js`, not just the frontend):
- **USER** — sees/edits only tickets they created; cannot change status/priority/assignment; cannot see internal notes.
- **AGENT** — sees tickets assigned to them, plus unassigned tickets; can change status/priority/assignment; can post internal notes.
- **ADMIN** — sees everything; can additionally delete tickets and manage users.

---

# Part 2 — Frontend

React (Vite) + Tailwind, using Axios + TanStack Query for API integration,
React Router for routing, and Context for auth/session state.

## 1. Install dependencies

```bash
cd client
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

By default `VITE_API_URL=http://localhost:5000/api` — change it if your
backend runs elsewhere. No secrets belong in this file; it only points at
the API's public base URL.

## 3. Start the dev server

Make sure the backend (Part 1) is already running on port 5000, then:

```bash
npm run dev
```

Open **http://localhost:5173**. Log in with one of the seeded accounts:

| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | Password123! |
| Agent | agent@example.com | Password123! |
| User | user@example.com | Password123! |

## Frontend project structure

```
client/
├── src/
│   ├── api/               # axios instance + one file per resource (auth, tickets, comments, users, dashboard)
│   ├── context/            # AuthContext — login/register/logout, persisted session
│   ├── hooks/               # TanStack Query hooks (useTickets, useComments, useUsers, useDashboard...)
│   ├── components/
│   │   ├── ui/               # Button, Input, Select, Textarea, Spinner, EmptyState, ErrorState, ConfirmDialog
│   │   ├── layout/            # Sidebar, Header, AppLayout
│   │   ├── tickets/           # StatusBadge, PriorityBadge, TicketTable, TicketFilters, Pagination,
│   │   │                      # CommentList, CommentForm, HistoryTimeline, TicketControls
│   │   └── ProtectedRoute.jsx # auth + role gating
│   ├── pages/                # Login, Register, Dashboard, TicketList, TicketDetail, CreateTicket,
│   │                          # Profile, Users (admin-only), Settings, NotFound
│   ├── utils/format.js       # date + ID formatting helpers
│   ├── App.jsx                # route tree
│   └── main.jsx                # QueryClient, BrowserRouter, AuthProvider, Toaster
```

## What it does (mapped to the real backend)

- **Auth** — `AuthContext` calls `/auth/login`, `/auth/register`, `/auth/me`; JWT is stored in `localStorage`
  and attached to every request via an Axios interceptor. A `401` anywhere triggers an automatic logout.
- **Protected/role-gated routes** — `ProtectedRoute` redirects unauthenticated users to `/login`, and
  redirects non-Admins away from `/users`. This mirrors, but does not replace, the backend's own RBAC checks.
- **Ticket list** — search, status/priority/category filters, an agent filter (Agent/Admin only), and
  pagination all map directly to the `/tickets` query params the backend already supports. Column sorting
  is applied client-side to the current page, since the backend always orders by `createdAt desc`.
- **Ticket detail** — shows full ticket info, comments (with an internal-note toggle for Agents/Admins),
  and the real activity/history log from `ticket_history`. Status, priority, and assignment controls are
  only editable for Agents/Admins, matching the backend's rejection of those changes from a `USER`.
- **Dashboard** — stat cards and status/priority distributions come from `/dashboard/stats`; "Recent
  Tickets" is a live `/tickets?limit=5` call rather than invented data.
- **Users page (Admin only)** — lists users, creates new accounts with a chosen role, and updates
  role/active-status inline, all against the existing `/users` endpoints.
- **Settings page** — intentionally read-only: the backend doesn't expose account/notification-preference
  endpoints yet, so no fake controls were added. Extend this once those routes exist.

## Build for production

```bash
npm run build     # outputs to client/dist
npm run preview   # serve the production build locally to sanity-check it
```

---

## Security and operations

The API applies Helmet security headers, server-side role checks, request validation,
request correlation IDs, origin allowlisting, and configurable in-memory rate limits.
It does not log request bodies, authorization headers, passwords, tokens, cookies, or
attachment contents.

Set these backend variables in `server/.env` for deployment:

```env
CLIENT_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
TRUST_PROXY=true
LOG_FORMAT=json
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=120
STORAGE_PROVIDER=local
MAX_ATTACHMENT_SIZE_MB=5
```

`TRUST_PROXY=true` is appropriate only behind a trusted reverse proxy that sets the
real client IP. The built-in limiter is suitable for a single Node.js instance; use a
shared store-backed limiter before running multiple API instances.

Critical ticket, comment, attachment, user-management, and successful-login actions
are recorded in the `audit_events` table. Audit metadata excludes comment content,
file names, passwords, tokens, and request bodies. Apply migrations with
`cd server && npx prisma migrate deploy`; do not use a database reset.

### In-app notifications

`/api/notifications` is an authenticated, recipient-scoped inbox. Recipients and copy
are created only by successful server-side domain transactions; it sends no email or
push notification and stores no source ticket, comment, or article content. A future
delivery channel must use a transactional outbox. Future retention should preserve
unread rows and expire read rows only under an explicit policy.

Attachments use private local storage during development. Every list, upload,
download, and deletion is checked against the ticket's server-side authorization.
`STORAGE_PROVIDER=local` is the only implemented and verified provider; configure an
S3-compatible provider only after adding and testing its credentials and provider
adapter.

### Email verification with Resend

Email verification has two explicit delivery modes:

- `EMAIL_PROVIDER=disabled` is the safe local/default mode. Accounts can be created but
  no verification email is sent, so use the already-verified seed accounts for local UI
  work.
- `EMAIL_PROVIDER=resend` enables Resend delivery only after the deployment operator has
  configured the required production settings below.

The server fails closed in production: public registration must not run with delivery
disabled, missing credentials, an invalid sender, or a non-public/non-HTTPS client URL.
Do not treat a registration status of `accepted` as inbox delivery. It means Resend
accepted the provider request; the recipient may still receive it late, in spam, or not
at all. The client deliberately presents `accepted`, `unavailable`, and `failed` as
different states. Resend requests always use the same generic response, so that response
does not prove delivery or reveal whether an account exists.

Configure production secrets in the deployment platform rather than source control:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=deployment-only-secret
EMAIL_FROM=HelpDesk <support@mail.example.com>
EMAIL_REPLY_TO=help@example.com
EMAIL_SUPPORT=help@example.com
EMAIL_APP_NAME=HelpDesk
EMAIL_DELIVERY_TIMEOUT_MS=10000
EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
CLIENT_URL=https://app.example.com
```

`RESEND_API_KEY` is created and maintained by the operator in their Resend account; this
project does not create a Resend account or key. Store it only in the deployment secret
manager, give it the least privilege required for this sender, limit access to the
smallest operations group, and rotate it immediately after suspected exposure and on a
defined operational schedule. Never put it in `.env.example`, a client `VITE_*` variable,
source control, logs, tests, or tickets.

`EMAIL_FROM` uses standard display-name sender syntax (`HelpDesk <address@domain>`). Its
domain must be owned by the operator and aligned with the domain verified in Resend.
Use a dedicated sending subdomain such as `mail.example.com` where practical, then add
and verify the SPF and DKIM DNS records Resend provides before enabling production
delivery. DNS changes can take time to propagate; wait for Resend to show the domain as
verified before deployment. `EMAIL_REPLY_TO` and `EMAIL_SUPPORT` are optional, but should
be monitored support addresses when supplied. `CLIENT_URL` must be the public HTTPS URL
of the client because verification links are sent to that origin; keep it aligned with
`CORS_ORIGINS`.

For development and controlled testing, understand Resend's restrictions: the shared
`resend.dev` sender can send only to the Resend account owner's address, and Resend test
recipient addresses simulate delivery outcomes. Those facilities are useful for tests,
but they are not proof that a production sending domain or recipient path works.

#### Email deployment checklist

- Create/configure the Resend account and a least-privilege API key in the deployment
  secret manager.
- Verify an operator-owned sending domain (preferably a sending subdomain) and its SPF/
  DKIM records; wait for DNS propagation and Resend verification.
- Set `EMAIL_PROVIDER=resend`, a domain-aligned `EMAIL_FROM`, required `CLIENT_URL=https://…`,
  and matching `CORS_ORIGINS` in the production environment.
- Set optional reply-to/support addresses only if those inboxes are monitored.
- Deploy, register a controlled test account, and confirm the UI only calls the provider
  response `accepted`—not a delivery guarantee.
- Monitor provider failures/timeouts and rotate the API key according to the operator's
  secret-management policy.

#### Email troubleshooting

- **401 or 403 from Resend:** verify the API key is present in the server environment,
  active, scoped appropriately, and belongs to the intended Resend account. Rotate a
  suspected or revoked key instead of reusing it.
- **Domain/sender mismatch:** ensure the `EMAIL_FROM` address uses the Resend-verified,
  operator-owned domain and that SPF/DKIM DNS verification has completed.
- **Timeout:** verify outbound network access to Resend, inspect deployment logs without
  exposing recipients or tokens, and tune `EMAIL_DELIVERY_TIMEOUT_MS` only with a known
  network reason.
- **Rate limiting:** respect the verification resend cooldown and API rate limits. The
  generic resend response intentionally does not disclose account state or delivery.

This implementation did not create a Resend account or domain, configure live
credentials, deploy the application, or send real email. Those are deliberate operator
actions required before production use.

### Verification run

```bash
cd server && npm test -- --runInBand
cd client && npm run build
```

The route-level lifecycle integration suite is opt-in. It runs with
`RUN_DB_INTEGRATION_TESTS=true` against a local PostgreSQL database whose name includes
`test`. A developer may explicitly opt an existing local-only database in with
`ALLOW_NON_TEST_DB_INTEGRATION=true`; the suite still creates uniquely prefixed rows,
cleans up only those rows, and never resets or migrates the database.

---

## What's next

**Step 6 (Integration)** — running both servers together end-to-end, plus a short checklist for
verifying each role's permissions in the UI — and **Step 7 (Deployment)** for shipping both
the API and the frontend to production, are up next.
