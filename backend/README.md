# Helm backend

Fastify + PostgreSQL API for the SoW & Project Tracker. Multi-tenant with
PostgreSQL Row-Level Security. Implements the design in
[`../BACKEND_TODO.md`](../BACKEND_TODO.md).

## Stack
- **Fastify 5** — HTTP server (helmet, CORS, rate limiting).
- **PostgreSQL** — 11 tables, RLS tenant isolation, state-machine CHECK constraints.
- **Argon2id** (`@node-rs/argon2`) — password hashing.
- **JWT** access tokens (15 min) + rotating opaque refresh tokens (in `session`).
- **zod** — input validation at every endpoint.

## Local development
```bash
# 1. Start Postgres (Docker)
docker run --name helm-db -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=helm -p 5432:5432 -d postgres:16

# 2. Configure
cp .env.example .env      # set JWT_SECRET, APP_DB_PASSWORD; admin URL uses postgres/dev

# 3. Install + migrate + run
npm install
npm run migrate           # creates the helm_app role, tables, RLS policies
npm run dev               # http://localhost:8080/health
```

## Commands
| Command | Does |
|---|---|
| `npm run dev` | Watch-mode server |
| `npm run start` | Run the server |
| `npm run migrate` | Apply pending SQL migrations (idempotent) |
| `npm run selfcheck` | Unit-check the SoW state machine (no DB needed) |
| `npm run typecheck` | `tsc --noEmit` |

## Security model
- The app connects as the **non-superuser** role `helm_app`, so RLS is enforced.
- Every org-scoped request runs inside `withTenant(orgId, userId, …)`, which sets
  `app.current_org_id` / `app.current_user_id` for the transaction; RLS policies
  filter by those. See [`src/db.ts`](src/db.ts).
- Auth tables (`org`, `app_user`, `session`, `auth_token`) are app-protected, not
  under RLS (login must read them before any tenant context exists) — see the
  note in [`migrations/003_rls_grants.sql`](migrations/003_rls_grants.sql).

## Endpoints
`POST /auth/{signup,login,refresh,logout}`, `GET /auth/me` ·
`GET/POST /clients`, `GET/PATCH /clients/:id`, `POST /clients/:id/contacts`, `PATCH/DELETE /contacts/:id` ·
`GET/POST /sows`, `GET/PATCH/DELETE /sows/:id`, `POST /sows/:id/status` ·
`GET /projects`, `PATCH /projects/:id` ·
`GET/POST /sows/:id/logs`, `PATCH/DELETE /logs/:id` ·
`GET /dashboard` · `GET /health`
