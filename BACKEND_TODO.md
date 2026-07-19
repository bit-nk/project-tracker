# BACKEND_TODO.md — Helm (remaining work)

> The backend is **built and deployed**. This file now tracks **only what is not yet implemented**.
> The shipped design lives in the code: schema + RLS in [`backend/migrations/`](backend/migrations),
> routes in [`backend/src/routes/`](backend/src), the tenancy recipe in [`backend/src/db.ts`](backend/src/db.ts),
> and an overview in [`backend/README.md`](backend/README.md). The original full design is in git
> history (commit `e377032`).

## Shipped (removed from this list)

For baseline context only — do not re-plan these:

- **11 tables + RLS** (`org`, `app_user`, `membership`, `session`, `auth_token`, `idempotency_key`,
  `audit_log`, `client`, `client_contact`, `sow`, `project_log_entry`), multi-tenant with
  `ENABLE`+`FORCE` RLS, `set_config`-per-transaction context, composite `(id, org_id)` FKs, and the
  full §S-FK `ON DELETE` policy.
- **Auth:** signup / login / refresh / logout / me — Argon2id, JWT (HS256-pinned), rotating hashed
  refresh tokens, account lockout, login timing equalization, and refresh-token reuse detection.
- **Domain CRUD:** clients + contacts, SoWs + the status state machine, projects (= approved SoWs) +
  the work-status machine, the dev-journal log entries, and the dashboard aggregate.
- **Security done:** S3 (IDOR — RLS backstop + opaque 404), S7 (per-endpoint zod validation, URL
  scheme allowlist, enum exactness), most of S4 (HTTPS/HSTS + full security-header set, structured
  JSON logs, append-only `audit_log`), a global rate limit, and secrets kept in server env (S6 core).

## Maintenance rule (still in force)

Any change that adds/removes/edits a piece of persistent state, a user-triggered operation, an input
point, or a security flow **must update this file in the same PR**. A new form field with no column
home is silent data loss; a new endpoint with no auth/RLS note is a hole.

---

## Remaining work

### R1. Idempotency middleware — `foundational`, S
The `idempotency_key` table exists but **no route uses it** (dead schema today). Wire middleware on
every non-GET mutating route: open the request transaction, `INSERT ... ON CONFLICT (org_id, user_id,
idempotency_key) DO NOTHING RETURNING`; if the row already existed and is completed, return the stored
`(response_status, response_body)`; if it existed but is in-flight, return `409`; else run the
operation and write the response before commit. Key on `(org_id, user_id, idempotency_key)` from the
`Idempotency-Key` header, one key per user operation (never per row of a batch). Keys expire after 24h.

### R2. Keyset pagination — `core`, S
List endpoints (`GET /clients`, `/sows`, `/projects`, `/sows/:id/logs`) currently return everything
(logs are hard-capped at 1000, the rest unbounded). Add keyset pagination: `limit` default 50, max
200; `cursor` encodes the sort-column value + `id` tiebreaker; newest-first on the sort column; never
`OFFSET`. The sort column is already in a serving index for each list.

### R3. Auth flows not yet built — `foundational`, L (S2 remainder)
- **Email verification.** Issue an `auth_token` (`token_type='email_verification'`, hashed,
  `expires_at`), add `POST /auth/verify-email`, and **gate login** on `app_user.email_verified_at`
  (login does not check it today).
- **Password reset.** `POST /auth/request-password-reset` + `POST /auth/reset-password`; single-use
  hashed tokens in `auth_token` (`token_type='password_reset'`), expiring ≤ 30 min, consumed via
  `consumed_at`.
- **MFA.** Re-add the `mfa_enabled` / `mfa_secret_enc` columns to `app_user` (they were dropped from
  the shipped schema), a TOTP enroll/verify flow, and require MFA for `owner`/`admin` memberships
  (secret encrypted at rest, never returned by any endpoint).
- Both email flows are blocked on a transactional-email provider (**R9**).

### R4. Observability remainder — `enhancement`, S (S4 remainder)
- Write the per-request correlation id into `audit_log.correlation_id` (the column exists but is never
  set) so an audit row ties back to its request log.
- Alerting on spikes in auth failures, authorization denials, and API errors.
  (Security headers, HSTS, structured logs, and the append-only audit trail are already done.)

### R5. Rate-limit & ingestion hardening — `enhancement`, S (S5 remainder)
- Add **per-route strict limits** on `/auth/login`, `/auth/signup`, `/auth/refresh` on top of the
  single global 300/min bucket (per-IP keying is now correct since `trustProxy` was fixed to `1`).
- Tighten ingestion caps to the S5 numbers: request body ≤ 64 KB (currently 1 MB), `links` ≤ 20/project
  (currently 50), and enforce contacts ≤ 50/client (currently unbounded).

### R6. Secrets-scanning CI gate — `enhancement`, XS (S6 remainder)
Add gitleaks/trufflehog over the working tree **and full git history** as a blocking CI check. The
tree is credential-free today; this keeps it so.

### R7. CI cross-org RLS test — `foundational`, S (§S1 acceptance test)
RLS is implemented and was verified by hand (the smoke test proves cross-org isolation), but there is
no committed **blocking** test. Add one: seed two orgs and assert (1) cross-org `SELECT` returns 0
rows, (2) cross-org `INSERT`/`UPDATE` is rejected by `WITH CHECK`, (3) unset context returns 0 rows
and rejects writes, (4) a composite-FK insert cannot attach a child to another org's parent.

### R8. Frontend → API wiring — `core`, M
The deployed frontend still reads its **in-memory demo data** (`src/data/repo.ts`). Swap that data
seam to `fetch()` the live `/api/*` endpoints, add token storage + silent refresh, and build the two
screens the API needs that the UI lacks: a **signup form** (email / password / orgName →
`POST /auth/signup`) and a **login screen**. This is the step that makes the deployed UI actually
persist.

### R9. Not yet scoped (deferred)
- **Transactional email** — verification/reset emails (R3) need a provider; the token table is ready,
  the sender is not.
- **`GET /bootstrap`** — one round-trip on app open (`{ user, org, role }` + client list). Today the
  frontend would make two calls (`/auth/me` + `/clients`); fold into one when wiring R8 if it matters.
- **Billing / plans / usage metering** — no pricing surface exists.
- **Team management UI** — `membership` supports `owner/admin/member`, but there is no invite/
  role-management screen; every org has exactly one `owner` today.
- **`DELETE /clients/:id`** — no delete-client affordance exists. The FK cascade would wipe a client's
  entire SoW/project/log tree, so it must ship as a **guarded/soft-delete** op, not a bare `DELETE`.
- **Background jobs** — expired-row sweeps for `session` / `auth_token` / `idempotency_key`, and
  `audit_log` retention.
- **Admin tooling / impersonation.**
- **Expensive-compute (AI) proxy, third-party connectors, realtime/collaboration** — the app calls no
  external API and has no shared-editing UI. If any is added, S5 gains a compute budget, S6 gains
  per-tenant encrypted credentials, and a realtime channel gets designed — update this file then.
- **Markdown rendering of note bodies** — bodies are plain text today; if rendered as HTML later, add
  sanitization to the S7 rules.
- **File uploads** — none exist; if added, add per-file/MIME/count caps and a storage table.
