# BACKEND_TODO.md — Helm (SoW & Project Tracker)

> **Planning document. No backend code here beyond schema DDL, no migrations run, no server scaffolded.**
> This is the implementation-ready design for turning the current frontend-only app into a
> persistent, multi-tenant, zero-trust backend on PostgreSQL.

## 1. Header

**What the app is today.** Helm is a single-user dashboard for tracking Statements of Work (SoWs),
the projects they become, and a running dev journal per project. It is **100% frontend**: all state
lives in an in-memory store (`src/data/repo.ts`) seeded deterministically (`src/data/seed.ts`) and
consumed through React hooks (`src/hooks/use-repo.ts`). **Nothing persists** — a browser reload
rebuilds the seed (`repo.ts:501 resetDemo`, called on module load). Forms exist and capture data;
that data is written only to the in-memory `db` object and is lost on refresh.

**The core domain fact (must survive into the schema):** *a Project is not a separate entity — it
is a SoW whose `status = 'Approved'`* (`src/types.ts:8`, `repo.ts:274 listProjects`,
`repo.ts:287 getProject`). "Projects" pages read/write the same rows as "SoWs" pages, filtered to
Approved. There is **no** `estimatedValue`/money field anywhere (it was removed from the model).

**Standing maintenance rule (enforce in code review).** Any change that adds/removes/edits a piece
of persistent state, a user-triggered operation, an input point, or a security flow **must update
this file in the same PR**. A new form field with no column home is silent data loss. A new
endpoint with no auth/RLS note is a hole. CI should fail a PR touching `src/data/repo.ts`,
`src/types.ts`, or `src/components/forms/**` that does not also touch `BACKEND_TODO.md`.

---

## 2. How to read

Every backlog item and feature carries a **priority tag** and a **rough effort size**.

| Priority | Meaning |
|---|---|
| `foundational` | The spine. Nothing else is safe until it exists (auth, tenancy, RLS, idempotency). |
| `core` | Backs a shipping frontend feature; needed for the app to persist at all. |
| `enhancement` | Improves an existing flow (search indexes, audit richness). |
| `later` | Deliberately deferred; listed in §9 Not yet scoped. |

Effort: `XS` (<½ day) · `S` (~1 day) · `M` (2–4 days) · `L` (~1 week) · `XL` (>1 week).

---

## 3. Phase 0 — Frontend audit (the grounding)

### 3.1 State inventory (`src/data/repo.ts`, `src/types.ts`)

The store is `let db = { clients, sows, logEntries }` (`repo.ts` `buildSeed` in `seed.ts`), plus a
pub/sub `version` counter and monotonic id counters. Classification: **P** = persistent-worthy,
**E** = ephemeral/derived (never stored).

| State | Shape / keying | Mutations & write semantics | Class |
|---|---|---|---|
| `clients: Client[]` | `Client { id, name, industry?, contacts?: ClientContact[], notes?, createdAt }` (`types.ts:25`), keyed by `id`, scoped to the (implicit) single user | `createClient` (`repo.ts:100`), `updateClient` (`:114`, replaces `contacts` array wholesale), `addClientContact` (`:126`, append) | **P** |
| `Client.contacts` | `ClientContact { name, contact?, role? }[]` (`types.ts:19`) | Edited **per item** in the UI: `ContactRow` Edit → `onSave`, Remove → `onRemove` (`ClientContacts.tsx`), which map/filter then `updateClient` | **P** |
| `sows: Sow[]` | `Sow { id, clientId, title, docLink?, status, decisionNote?, createdAt, updatedAt, sentAt?, decidedAt?, workStatus?, description?, repoUrl?, stagingUrl?, links?, startedAt?, completedAt? }` (`types.ts:47`), keyed by `id`, FK `clientId` | `createSow` (`:191`), `updateSow` (`:223`, status transition stamps timestamps via `applyStatusTransition` `:241`), `deleteSow` (`:265`, cascades log entries), `updateProject` (`:301`, work fields) | **P** |
| `Sow.status` | enum `Draft \| Sent \| Approved \| Rejected` (`types.ts:35`) | State machine — see §7.3 | **P** |
| `Sow.workStatus` | enum `Active \| On Hold \| Completed` (`types.ts:39`), meaningful only when `status='Approved'`; set on approval (`becomeProject` `:214`) | State machine — see §7.4 | **P** |
| `Sow.links` | `ProjectLink { label, url }[]` (`types.ts:42`) | Replaced wholesale by `ProjectFormDialog` Save (`:63`) | **P** (JSONB) |
| `Sow.sentAt/decidedAt/startedAt/completedAt` | ISO timestamps, stamped by the status machine | derived from transitions but **stored as truth** because approval time is not otherwise recoverable | **P** |
| `Sow.updatedAt` | ISO timestamp, bumped on any SoW edit **and on any log-entry write** via `touchSow` (`:320,362,376,384`) | powers "date edited" sort | **P** |
| `logEntries: ProjectLogEntry[]` | `ProjectLogEntry { id, sowId, type, body, createdAt, pinned, resolved? }` (`types.ts:81`), keyed by `id`, FK `sowId` | `addLogEntry` (`:352`), `updateLogEntry` (`:367`), `deleteLogEntry` (`:381`), `togglePinned` (`:389`), `toggleResolved` (`:397`) | **P** |
| `ProjectLogEntry.pinned` | boolean, **multiple pins allowed per project** | `togglePinned` flips one row; no single-pin invariant | **P** |
| `ProjectLogEntry.resolved` | boolean, only meaningful for `type='Reminder'` | `toggleResolved` flips | **P** |
| `version`, listeners set | global reactivity counter | `emit()` bumps; `useSyncExternalStore` | **E** (client runtime) |
| id counters | monotonic per-prefix | id generation (server generates UUIDs instead) | **E** |
| UI: `query`, `statusFilter`, `sort`, `expanded` sets, `editing`/`adding` toggles, dialog open flags, theme | per-page `useState`; theme in `localStorage('helm-theme')` (`use-theme.ts`) | selection/view state | **E** (theme is a client pref, not server data) |

**Derived, never stored as truth:** dashboard stats (`getStats` `:426` — counts, `conversionRate`,
`awaitingDecision`, project-by-work-status), focus items (`getFocusItems` `:469`), reminders
(`getReminders` `:488`), all sorts (`sortSows` `:164`), all searches (`searchLogEntries` `:339`).

### 3.2 Operation inventory (user-triggered → API call)

| Operation | Frontend origin | Sends | Mutates | → Endpoint (§7) |
|---|---|---|---|---|
| Create client | `ClientFormDialog` submit | name, industry, notes, contacts[] | `clients`, `client_contact` | `POST /clients` |
| Edit client name (inline) | `Clients.tsx` row, `ClientDetail` header | name (± industry) | `client` | `PATCH /clients/:id` |
| Edit client notes (inline) | `ClientDetail` NotesSection | notes | `client` | `PATCH /clients/:id` |
| Add / edit / remove contact | `ClientContacts.tsx` per-row | name, contact, role | `client_contact` | `POST/PATCH/DELETE /clients/:id/contacts[/:contactId]` |
| Create SoW | `SowFormDialog` submit | clientId, title, status, docLink, decisionNote | `sow` | `POST /sows` |
| Edit SoW (inline) | `Sows.tsx` `SowEditForm` | title, status, docLink, decisionNote | `sow` | `PATCH /sows/:id` + `POST /sows/:id/status` |
| Approve/Send/Reject SoW | status change in edit | status | `sow` (+ becomes project) | `POST /sows/:id/status` |
| Delete SoW | `Sows.tsx` (via edit) | — | `sow` (+ cascade log) | `DELETE /sows/:id` |
| Create project directly | `NewProjectDialog` submit | clientId, title, workStatus, description | `sow` (status=Approved) | `POST /projects` |
| Edit project | `ProjectFormDialog` submit | workStatus, description, repoUrl, stagingUrl, links[] | `sow` | `PATCH /projects/:id` |
| Add log entry | `LogEntryForm` (project detail) | type, body, pinned | `project_log_entry` | `POST /projects/:id/log` |
| Add reminder / focus (dashboard) | `AddLogItemForm` (`Dashboard.tsx:87,129`) | projectId, note (type implied) | `project_log_entry` | `POST /projects/:id/log` |
| Edit log entry | `LogEntryForm` edit | type, body, pinned | `project_log_entry` | `PATCH /log/:id` |
| Pin/unpin, resolve/reopen | row actions | — | `project_log_entry` | `POST /log/:id/pin`, `/log/:id/resolve` |
| Delete log entry | row action | — | `project_log_entry` | `DELETE /log/:id` |
| List/search/sort/filter | every list page | query params | — (read) | `GET` list endpoints |
| Open dashboard / project switch | app load | — | — (read) | `GET /bootstrap`, `GET /dashboard` |

### 3.3 Input inventory (every place user input enters)

All inputs today have **no server validation** (there is no server). Client-side there is only
`canSave` non-empty checks and render-time URL sanitization (`src/lib/url.ts` `safeHref`/`safeMailto`,
added for XSS). The backend must validate all of these (see S7).

| Input | File:line | Today's validation |
|---|---|---|
| Client name | `ClientFormDialog.tsx:88`, `Clients.tsx` inline, `ClientDetail.tsx` header | non-empty (`canSave`) |
| Client industry | `ClientFormDialog.tsx:98`, `ClientDetail.tsx` header | none |
| Client notes | `ClientFormDialog.tsx:167`, `ClientDetail.tsx` NotesSection | none |
| Contact name/contact/role | `ClientFormDialog.tsx:125/130/137`, `ClientContacts.tsx:157/164/170` | name non-empty; `contact` rendered as `mailto:` only if it matches `safeMailto` |
| SoW title | `SowFormDialog.tsx:106` | non-empty |
| SoW status | `SowFormDialog.tsx:114` (`Select`) | constrained to `SOW_STATUSES` client-side only |
| SoW docLink | `SowFormDialog.tsx:133` (`type="url"`) | none server-side; rendered via `safeHref` |
| SoW decisionNote | `SowFormDialog.tsx:144` | none |
| Project name/workStatus/description | `NewProjectDialog.tsx:105/113/131` | title non-empty |
| Project repoUrl/stagingUrl | `ProjectFormDialog.tsx:115/125` (`type="url"`) | rendered via `safeHref` |
| Project link label/url | `ProjectFormDialog.tsx:148/153` | non-empty pair kept |
| Log entry type/body | `LogEntryForm.tsx` type select / `:84` body | body non-empty; type constrained to `LOG_ENTRY_TYPES` client-side |
| Reminder/focus note | `Dashboard.tsx` `AddLogItemForm` | non-empty |
| Search / filter / sort | list pages | query params, unvalidated |
| **No file uploads, no pasted credentials, no rich text/HTML** anywhere | — | — |

### 3.4 External calls

**None.** A repo-wide search for `fetch(`/`XMLHttpRequest`/`axios`/`WebSocket`/`sendBeacon`/third-party
hosts finds only: (a) comments describing this future backend (`repo.ts:7`, `seed.ts:6`), and
(b) user-pasted URLs stored as plain strings (`docLink`, `repoUrl`, `stagingUrl`, `links[].url`) that
the app only ever renders as `<a href>` — it never calls them. The one external resource the page
loads is the Google Fonts stylesheet (`src/index.css` `@import`), allowed by the production CSP.

**Consequences for scope:** there is **no AI/metered-compute proxy to build** (S5's expensive-compute
budget is N/A — noted in §9), **no third-party API credentials to broker**, and **no telemetry to
replace**. The server's job is purely: authenticate, persist, authorize, and serve reads.

---

## 4. Hard engineering rules (every table & endpoint obeys these)

1. **Zero-trust frontend.** The client never mutates data or checks permissions except through a
   backend route. No direct DB access, no trusting client-sent ids for ownership.
2. **Explicit state machines.** `sow.status` and `sow.work_status` are named states with named
   transitions (§7.3, §7.4), enforced by CHECK constraints and a transition endpoint — never
   scattered booleans.
3. **Atomicity & idempotency.** Every create/transition path is **one transaction** honouring an
   `Idempotency-Key` header (§S-IDEMP). A duplicate submit returns the first result. Idempotency is
   **operation-level**, keyed on `(org_id, user_id, idempotency_key)`, never per row of a batch.
4. **API-first.** Endpoint + request/response schema defined (§7) before any UI change.
5. **Types & DDL.** UUID PKs via `gen_random_uuid()`, `TIMESTAMPTZ` for time, `JSONB` only for
   genuinely unstructured data (`sow.links`, `audit_log.metadata`). `CREATE TABLE IF NOT EXISTS`
   always. Strict PostgreSQL (`RETURNING`, partial indexes, `NULLS NOT DISTINCT`); no other vendor
   syntax.
6. **Constraints on every column.** `NOT NULL`, `UNIQUE`, `CHECK` wherever an invariant exists.
   Enum-like columns are `TEXT` + `CHECK (col IN (...))` with the **exact UI strings** (values may
   contain spaces, e.g. `'On Hold'`, `'Working On'`); the UI-to-column mapping is in each feature's
   field mapping. Never silently coerce.
7. **No `DROP`/`TRUNCATE`** anywhere without explicit written confirmation. Schema changes ship as
   ordered, reviewed, forward-only migration files. Enum-value additions are new migrations.
8. **Naming maps 1:1.** `snake_case` columns ↔ `camelCase` API fields. Shared logical keys are the
   same type everywhere (`org_id uuid`, `client_id uuid`, `sow_id uuid` in every table that carries
   them, so they join everywhere).
9. **Indexing discipline.** Composite indexes for hot multi-column `WHERE`/sort. No index on a
   low-cardinality boolean alone (use **partial** indexes, e.g. `WHERE pinned = true`). Explicit
   column lists in production queries.
10. **Least privilege.** The API connects as a dedicated non-superuser, non-`BYPASSRLS` role that
    owns no tables. RLS `ENABLE`d **and** `FORCE`d on every tenant table from day one (§S1).
    Parameterized queries / ORM only. All credentials in server env / secret manager.
11. **FK discipline.** Every reference is a real `FOREIGN KEY` with a deliberate `ON DELETE`
    (§S-FK). Cross-parent attachment blocked with composite FKs on `(parent_id, org_id)` because FK
    checks bypass RLS.
12. **3NF.** No repeating groups, no partial/transitive dependencies, no derivable data stored as
    truth. "Latest" = `ORDER BY` on an indexed column; tallies/deltas are computed; a stored pointer
    exists only when a status makes it non-derivable. Denormalized snapshots only on immutable
    versioned rows, each documenting its authoritative source and sync owner (**this app has none**).

### §S-FK — ON DELETE policy (stated once)
- **CASCADE** — artefact data that cannot exist without its parent: `client → sow` (a SoW is
  meaningless without its client), `sow → project_log_entry` (matches `deleteSow` cascade,
  `repo.ts:265`), `client → client_contact`, `org → {client, sow, project_log_entry, membership,
  idempotency_key, audit_log}`, `app_user → {membership, session, auth_token, idempotency_key}`.
- **SET NULL** — traceability links that must survive a parent delete: `audit_log.actor_user_id →
  app_user` (the audit trail outlives the actor), `session.rotated_to → session` (broken rotation
  chain link).
- **RESTRICT** — none required today. (A future `DELETE /clients/:id` will cascade a client's whole
  SoW/project/log tree; because that blast radius is large it must be a guarded/soft-delete endpoint
  — see §9.)

### §S-IDEMP — Idempotency recipe (stated once)
`idempotency_key` table stores `(org_id, user_id, idempotency_key)` UNIQUE, a request fingerprint
(hash of method+path+canonical body), and the first response (`response_status`, `response_body`).
Middleware on every non-GET mutating route: open the request transaction, `INSERT ... ON CONFLICT DO
NOTHING RETURNING`; if the row already existed and is completed, return the stored response; if it
existed but is in-flight, return `409`; else run the operation and write the response before commit.
Keys expire after 24h. **Never** put idempotency per row of a batch — one key per user operation.

### §S-PAGINATION — Keyset pagination (stated once)
Every list endpoint uses **keyset** pagination: `limit` default 50, max 200; `cursor` encodes the
sort column value plus `id` as a tiebreaker; results are newest-first on the sort column. The sort
column is always present in the serving index (see each feature). Never `OFFSET`.

---

## 5. Security guidelines (S0–S7, prompt-ready work orders)

### S0. Threat model (one paragraph)
**Assets:** a user's clients, SoWs (commercial pipeline), projects, and private dev-journal notes —
all business-sensitive; plus auth credentials and session tokens. **Attack surfaces:** the public
HTTP API (all mutations flow here once persistence exists), the login/signup/reset flows, the
user-pasted URL fields (`docLink`, `repoUrl`, `stagingUrl`, `links[].url`) and freeform notes/bodies
(stored-XSS vector on render), and the database itself (tenant isolation). **What each guideline
traces to:** S1 RLS → tenant isolation of `client/sow/project_log_entry`; S2 → the login/session
flows that do not exist yet; S3 → IDOR on `/clients/:id`, `/sows/:id`, `/projects/:id`, `/log/:id`;
S4 → deployment/audit; S5 → login/API abuse (no expensive compute exists, so no AI budget); S6 →
secrets (none in the tree today — keep it that way); S7 → the untrusted inputs enumerated in §3.3,
especially the URL fields and note bodies.

### S1. Multi-tenancy & Row-Level Security (the recipe)
**Tenancy chain:** `org` → `client` → { `client_contact`, `sow` } → `project_log_entry`. Every
tenant table carries `org_id uuid NOT NULL`. (`app_user`, `session`, `auth_token` are platform/auth
infra scoped by `user_id`, not `org_id`.)

- The API connects as role `helm_api` — **non-superuser, non-`BYPASSRLS`, owns no tables**.
- On every tenant table: `ALTER TABLE t ENABLE ROW LEVEL SECURITY; ALTER TABLE t FORCE ROW LEVEL
  SECURITY;` (FORCE so the table owner is also constrained).
- **Per-request middleware (transaction-scoped, pooler-safe):**
  ```
  BEGIN;
  SELECT set_config('app.current_org_id',  $1, true);   -- $1 = resolved org uuid, bind param
  SELECT set_config('app.current_user_id', $2, true);   -- $2 = authenticated user uuid
  -- ... run the request's queries ...
  COMMIT;
  ```
  `set_config(..., true)` is transaction-local (the only safe form under PgBouncer transaction
  pooling). Never plain `SET LOCAL` (cannot take bind params) and never a session-level `SET`.
- **Org-scoped policy template** (fails closed when context is unset):
  ```sql
  CREATE POLICY org_isolation ON client
    USING      (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
    WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
  ```
  Both `USING` and `WITH CHECK` present, so an unset/empty context selects and writes **zero** rows.
- **Per-user tables** (`session`, `auth_token`, `idempotency_key` scoped to the caller): exactly
  **ONE** policy carrying the user predicate (`user_id = NULLIF(current_setting('app.current_user_id',
  true),'')::uuid`), replacing — not adding to — the template, because permissive policies OR
  together and a second broad policy would silently widen access. `idempotency_key` and `audit_log`
  keep the **org** predicate (they are org-scoped).
- **`org` / `membership`:** `org` policy `USING (id = current_org_id)`; `membership` policy
  `USING (org_id = current_org_id)`. `app_user` policy `USING (id = current_user_id)` (self only).
- **Grants:** `GRANT SELECT, INSERT, UPDATE, DELETE ON <tables> TO helm_api;` plus
  `ALTER DEFAULT PRIVILEGES FOR ROLE helm_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE,
  DELETE ON TABLES TO helm_api;` so future-migration tables inherit grants. `audit_log` grants
  **INSERT, SELECT only** (append-only).
- **RLS ships in the same migration as the table it protects.**
- **CI acceptance test (blocking):** seed two orgs; assert (1) cross-org `SELECT` returns 0 rows,
  (2) cross-org `INSERT`/`UPDATE` is rejected by `WITH CHECK`, (3) unset context returns 0 rows and
  rejects writes, (4) a composite-FK insert cannot attach a child to another org's parent.

### S2. Authentication
- **Hashing:** Argon2id (or bcrypt cost ≥ 12) with per-user salts; store only the hash in
  `app_user.password_hash`. **Constant-time** comparison on every credential/token check.
- **Sessions:** short-lived access token in an `httpOnly; Secure; SameSite=Lax` cookie; a rotating
  refresh token stored **hashed** in `session.refresh_token_hash` with idle + absolute expiry and
  a linear rotation chain (`session.rotated_to`, partial-unique). Global revocation = delete/flag
  the user's sessions.
- **Email verification** blocks login until `app_user.email_verified_at` is set. Verification and
  **single-use** reset tokens live in `auth_token` (hashed at rest, `expires_at`, `consumed_at`);
  reset tokens expire ≤ 30 min.
- **Rate limits** per account and per IP on login/signup with progressive lockout
  (`app_user.failed_login_count`, `locked_until`); both attempts and lockouts logged to `audit_log`.
- **MFA** required for `owner`/`admin` membership roles (secret encrypted at rest).
- **No auth secret** ever reaches a frontend bundle or a build-time public env var (`VITE_*` is
  public — nothing sensitive there; see S6).

### S3. API & data access (IDOR)
- **One central deny-by-default authorization layer.** Every request resolves ownership through the
  **full chain** before any read/modify/delete: `user → membership(org) → client/sow → child`.
- **Opaque 404** for both missing and forbidden, so existence never leaks (a SoW in another org is
  indistinguishable from a nonexistent one).
- **Server-generated UUIDs only.** Child resources are verified by **joining to their parent**
  (`project_log_entry` → `sow` → `org`), never by trusting an id's shape. RLS is the backstop; the
  auth layer is the primary gate.

### S4. Deployment & logging
- HTTPS with HSTS; the full security header set (`Content-Security-Policy`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`) as **real
  HTTP headers** (the client already ships a defense-in-depth CSP `<meta>` via `vite.config.ts`; the
  server must also send the header). Secrets in server env / secret manager. DB on a private network,
  TLS-only, **no public port**.
- **Structured JSON logs** with a correlation id per request, covering auth attempts, authorization
  denials, API errors, and anomalies; alerting on spikes. **Scrub** secrets and user content
  (note bodies, emails) before write. **Append-only, tenant-scoped `audit_log`** for state-changing
  actions (SoW status transitions, deletes, contact changes). Staging is a separate DB from prod.

### S5. Abuse & rate limiting
- Token buckets keyed **per user, per org, per IP**: strict on login/signup, moderate on the API.
  `429` with `Retry-After`. Per-user concurrency caps on writes.
- **No expensive-compute budget needed** — the app calls no AI/metered API (§3.4). If one is added
  later, this section gains pre-flight estimates + hard stops (§9).
- **Bounded ingestion** enforced server-side (fold all body limits here): request body ≤ 64 KB,
  contacts ≤ 50/client, links ≤ 20/project, log body ≤ 20 000 chars, page size ≤ 200 (§S-PAGINATION).
  **No file uploads exist** (§3.3), so no per-file/MIME rules are needed yet.

### S6. Secrets
- Scan the working tree **and full git history** with a scanner (gitleaks/trufflehog); add it as a
  **blocking CI gate**. (Current tree has no secrets — the app is credential-free; keep it so.)
- Nothing secret in frontend code or `VITE_*` build-time vars. Platform keys are server-held. There
  are **no per-tenant third-party credentials** today (no connectors); if added, they are encrypted
  at rest and **write-only** through the API (no endpoint ever returns a stored token), with
  rotation. Secret patterns scrubbed from every log/error/response.

### S7. Input validation
- **A schema per endpoint** (zod/Ajv) that **rejects unknown fields**, with per-field length caps,
  charset rules for names, real date parsing, enum validation against the exact UI option sets, and
  payload-shape validation derived from the frontend's actual forms (§3.3, §7 field mappings).
- **Enum values** validated exactly: `sow.status ∈ {Draft,Sent,Approved,Rejected}`, `work_status ∈
  {Active,On Hold,Completed}`, `log_entry_type ∈ {Working On,Pending,Reminder,Backlog,Meeting Note,
  Note}` — reject anything else (never coerce).
- **URL fields** (`docLink`, `repoUrl`, `stagingUrl`, `links[].url`): server-side allowlist of
  `http:`/`https:` schemes (mirror `src/lib/url.ts` `safeHref`), reject `javascript:`/`data:`/etc.,
  store normalized. **`contact`** validated as email/phone; only `@`-form emails become `mailto:`.
- **Notes/bodies** stored as **plain text**; any rendering escapes HTML (no `dangerouslySetInnerHTML`
  exists in the app — keep it that way). Parameterized SQL only; no shell interpolation.

---

## 6. Area backlog (grounded in Phase 0)

| Area | Priority | Effort | Backs (frontend) |
|---|---|---|---|
| **Identity, auth, RBAC** — `org`, `app_user`, `membership`, `session`, `auth_token`; signup/login/refresh/verify/reset; per-request org+user context | `foundational` | L | Nothing yet (the app has no auth) — but persistence is impossible without knowing whose workspace the `db` in `repo.ts` belongs to. |
| **Multi-tenancy & isolation** — `org_id` everywhere, RLS+FORCE, composite FKs, CI cross-org test (§S1) | `foundational` | M | Every read/write in `repo.ts`. |
| **Idempotency & audit infra** — `idempotency_key`, `audit_log` (§S-IDEMP, S4) | `foundational` | S | Every create/transition/delete op in §3.2. |
| **Data model & persistence** — `client`, `client_contact`, `sow`, `project_log_entry` | `core` | L | `types.ts`, all of `repo.ts`, every page. |
| **Read paths** — `GET /bootstrap`, `GET /dashboard`, list+detail endpoints, serving indexes | `core` | M | `Dashboard.tsx`, `Sows.tsx`, `Projects.tsx`, `ProjectDetail.tsx`, `Clients.tsx`, `ClientDetail.tsx`. |
| **Observability & ops** — structured logs, correlation ids, alerting, security headers (§S4) | `enhancement` | M | Whole API. |
| **Expensive-compute proxy** | `later` | — | **N/A** — app calls no AI/metered API (§3.4). |
| **Integrations/connectors** | `later` | — | **N/A** — no third-party calls; URLs are stored strings only. |
| **Realtime / shared state** | `later` | — | **N/A** — single-user UI, no collaboration affordance. |

---

## 7. Per-feature storage designs

**Shared enum values (TEXT + CHECK, exact UI strings):**
`sow_status = {'Draft','Sent','Approved','Rejected'}` · `work_status = {'Active','On Hold','Completed'}`
· `log_entry_type = {'Working On','Pending','Reminder','Backlog','Meeting Note','Note'}` ·
`membership_role = {'owner','admin','member'}`.

Every table below is `org`-scoped and RLS-protected per **§S1** unless noted. `id uuid PRIMARY KEY
DEFAULT gen_random_uuid()`, `created_at/updated_at timestamptz NOT NULL DEFAULT now()` throughout.

### 7.1 Identity, auth, tenancy (`foundational`)

*Backs:* the (currently implicit) single owner of the in-memory `db`. Lifecycle: signup → verify →
login → session rotation → logout/revoke. A personal signup creates one `org` + an `owner`
`membership`.

```sql
CREATE TABLE IF NOT EXISTS org (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id)               -- referenced by simple FKs; composite children reference client/sow, not org
);

CREATE TABLE IF NOT EXISTS app_user (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash      text NOT NULL,
  email_verified_at  timestamptz,
  failed_login_count int  NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until       timestamptz,
  mfa_enabled        boolean NOT NULL DEFAULT false,
  mfa_secret_enc     text,                       -- encrypted at rest; never returned by any endpoint
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_ci_uk ON app_user (lower(email));  -- case-insensitive login boundary

CREATE TABLE IF NOT EXISTS membership (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','admin','member')),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)                                   -- one membership per (org,user)
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_one_owner_uk ON membership (org_id) WHERE role = 'owner';  -- exactly one owner per org
CREATE INDEX IF NOT EXISTS membership_user_ix ON membership (user_id);

CREATE TABLE IF NOT EXISTS session (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  refresh_token_hash  text NOT NULL,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz,
  rotated_to          uuid REFERENCES session(id) ON DELETE SET NULL,   -- linear rotation chain
  ip                  inet,
  user_agent          text,
  CHECK (absolute_expires_at > issued_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS session_refresh_hash_uk ON session (refresh_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS session_rotated_to_uk   ON session (rotated_to) WHERE rotated_to IS NOT NULL;  -- one successor per session
CREATE INDEX IF NOT EXISTS session_user_active_ix ON session (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_type  text NOT NULL CHECK (token_type IN ('email_verification','password_reset')),
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,                                   -- single-use
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_token_hash_uk ON auth_token (token_hash);
CREATE INDEX IF NOT EXISTS auth_token_lookup_ix ON auth_token (user_id, token_type) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS idempotency_key (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  idempotency_key     text NOT NULL,
  request_fingerprint text NOT NULL,
  response_status     int,
  response_body       jsonb CHECK (response_body IS NULL OR jsonb_typeof(response_body) = 'object'),
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  UNIQUE (org_id, user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES app_user(id) ON DELETE SET NULL,       -- trail outlives the actor
  action         text NOT NULL CHECK (char_length(action) <= 100),      -- e.g. 'sow.status_changed'
  entity_type    text NOT NULL CHECK (entity_type IN ('client','client_contact','sow','project','project_log_entry','membership')),
  entity_id      uuid,
  correlation_id uuid,
  metadata       jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_org_time_ix ON audit_log (org_id, created_at DESC, id);
```
**RLS:** `org`/`membership` per §S1 (org predicate); `app_user` self (`id = current_user_id`);
`session`/`auth_token` per-user (single user policy); `idempotency_key`/`audit_log` org-scoped;
`audit_log` grants INSERT+SELECT only.

**Endpoints:** `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh`
· `POST /auth/verify-email` · `POST /auth/request-password-reset` · `POST /auth/reset-password` ·
`GET /auth/me` (current user + org + role). All rate-limited (S5), all constant-time (S2).

**Field mapping** (signup form to be added — see §9): `email` → `app_user.email`, `password` →
`app_user.password_hash` (hashed, never stored raw), `orgName`/`workspaceName` → `org.name`.

---

### 7.2 Clients & contacts (`core`)

*Backs:* `Clients.tsx` (list, inline name edit, New client), `ClientDetail.tsx` (inline header,
notes, contacts, history), `ClientFormDialog.tsx`, `ClientContacts.tsx`. Lifecycle: created →
edited in place → (delete not scoped). A client owns its contacts; contacts have per-item lifecycle.

```sql
CREATE TABLE IF NOT EXISTS client (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  industry   text CHECK (industry IS NULL OR char_length(industry) <= 120),
  notes      text CHECK (notes    IS NULL OR char_length(notes)    <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id)                    -- lets children composite-FK on (client_id, org_id)
);
-- No UNIQUE on name: the frontend intentionally allows duplicate client names (Clients.tsx has no
-- uniqueness check). Do NOT invent one.
CREATE INDEX IF NOT EXISTS client_org_name_ix ON client (org_id, lower(name));  -- alphabetical list (listClients sorts by name) + search

CREATE TABLE IF NOT EXISTS client_contact (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  contact    text CHECK (contact IS NULL OR char_length(contact) <= 320),  -- email/phone/handle
  role       text CHECK (role    IS NULL OR char_length(role)    <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, org_id) REFERENCES client (id, org_id) ON DELETE CASCADE  -- composite FK blocks cross-org attach
);
CREATE INDEX IF NOT EXISTS client_contact_client_ix ON client_contact (org_id, client_id, created_at);
```
**Why `client_contact` is a table, not JSONB:** the UI exposes **per-contact write operations** —
`ContactRow` Edit → `onSave`, Remove → `onRemove` (`ClientContacts.tsx`) — which map cleanly to
`PATCH`/`DELETE /clients/:id/contacts/:contactId` and avoid read-modify-write lost updates on a
shared array. (Contrast `sow.links`, which is bulk-saved only and never reached into → JSONB.)

**RLS:** org-scoped per §S1. **Contacts cap** 50/client (S5).

**Derived queries.**
- Client list with counts (one query, feeds `Clients.tsx` stat cluster + `GET /clients`):
  ```sql
  SELECT c.id, c.name, c.industry, c.notes, c.updated_at,
         (SELECT count(*) FROM client_contact cc WHERE cc.client_id = c.id) AS contact_count,
         (SELECT count(*) FROM sow s WHERE s.client_id = c.id) AS sow_count,
         (SELECT count(*) FROM sow s WHERE s.client_id = c.id AND s.status = 'Approved') AS project_count
  FROM client c
  WHERE c.org_id = $org
    AND ($q IS NULL OR c.name ILIKE '%'||$q||'%' OR c.industry ILIKE '%'||$q||'%')
  ORDER BY lower(c.name), c.id
  LIMIT $limit;
  ```
  Counts are **derived, never stored**. Served by `client_org_name_ix` and the child FK indexes.

**Endpoints (zero-trust, camelCase):**
`GET /clients?q&cursor&limit` (list) · `GET /clients/:id` (detail: client + contacts + its SoWs +
its projects) · `POST /clients` (Idempotency-Key; creates client + contacts in one txn) ·
`PATCH /clients/:id` (name/industry/notes) · `POST /clients/:id/contacts` · `PATCH
/clients/:id/contacts/:contactId` · `DELETE /clients/:id/contacts/:contactId`.

**Field mapping (every field named):**

| Frontend field | File:line | Column |
|---|---|---|
| Client name | `ClientFormDialog.tsx:88`, `Clients.tsx` inline, `ClientDetail.tsx` header | `client.name` |
| Client industry | `ClientFormDialog.tsx:98`, `ClientDetail.tsx` header | `client.industry` |
| Client notes | `ClientFormDialog.tsx:167`, `ClientDetail.tsx` NotesSection | `client.notes` |
| Contact name | `ClientFormDialog.tsx:125`, `ClientContacts.tsx:157` | `client_contact.name` |
| Contact contact (email/phone) | `ClientFormDialog.tsx:130`, `ClientContacts.tsx:164` | `client_contact.contact` |
| Contact role | `ClientFormDialog.tsx:137`, `ClientContacts.tsx:170` | `client_contact.role` |

---

### 7.3 SoWs (`core`) — and their status state machine

*Backs:* `Sows.tsx` (grouped-by-client, collapsible, search, status filter, sort, inline
create/edit), `SowFormDialog.tsx`, and the SoW rows on `ClientDetail.tsx`. Lifecycle: `Draft →
Sent → Approved | Rejected`, with un-decide allowed (matches `applyStatusTransition`, `repo.ts:241`).
An **Approved** SoW is simultaneously a **Project** (§7.4).

```sql
CREATE TABLE IF NOT EXISTS sow (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  status        text NOT NULL CHECK (status IN ('Draft','Sent','Approved','Rejected')),
  doc_link      text CHECK (doc_link IS NULL OR doc_link ~ '^https?://'),          -- S7 scheme allowlist
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 10000),
  -- project fields (present iff Approved) --
  work_status   text CHECK (work_status IN ('Active','On Hold','Completed')),
  description   text CHECK (description IS NULL OR char_length(description) <= 10000),
  repo_url      text CHECK (repo_url    IS NULL OR repo_url    ~ '^https?://'),
  staging_url   text CHECK (staging_url IS NULL OR staging_url ~ '^https?://'),
  links         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(links) = 'array'), -- ProjectLink[]; bulk-saved, never queried into
  -- timeline (state-machine stamps) --
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  decided_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  UNIQUE (id, org_id),                                                             -- lets project_log_entry composite-FK
  FOREIGN KEY (client_id, org_id) REFERENCES client (id, org_id) ON DELETE CASCADE,
  -- state machine invariants --
  CONSTRAINT sow_project_fields_ck   CHECK ((status = 'Approved') = (work_status IS NOT NULL)),
  CONSTRAINT sow_started_ck          CHECK (status <> 'Approved' OR started_at IS NOT NULL),
  CONSTRAINT sow_completed_ck        CHECK (completed_at IS NULL OR work_status = 'Completed'),
  CONSTRAINT sow_sent_ck             CHECK (status = 'Draft' OR sent_at IS NOT NULL),
  CONSTRAINT sow_decided_ck          CHECK ((status IN ('Approved','Rejected')) = (decided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sow_org_updated_ix ON sow (org_id, updated_at DESC, id);              -- default sort "date edited"
CREATE INDEX IF NOT EXISTS sow_org_created_ix ON sow (org_id, created_at DESC, id);              -- sort "date added"
CREATE INDEX IF NOT EXISTS sow_org_title_ix   ON sow (org_id, lower(title));                     -- sort "name" + title search
CREATE INDEX IF NOT EXISTS sow_org_client_ix  ON sow (org_id, client_id, updated_at DESC);       -- group-by-client + client filter
CREATE INDEX IF NOT EXISTS sow_org_status_ix  ON sow (org_id, status);                           -- status filter + dashboard stats
CREATE INDEX IF NOT EXISTS sow_org_project_ix ON sow (org_id, work_status, updated_at DESC, id)
  WHERE status = 'Approved';                                                                     -- project list/filter + project stats
```

**Status state machine (explicit, enforced by endpoint + CHECKs above).**

| From → To | Allowed | Stamps (server) | Clears |
|---|---|---|---|
| Draft → Sent | ✓ | `sent_at = now()` | — |
| Draft/Sent → Approved | ✓ | `sent_at ??= now()`, `decided_at = now()`, `work_status = 'Active'`, `started_at = now()` | — |
| Draft/Sent → Rejected | ✓ | `sent_at ??= now()`, `decided_at = now()` | — |
| Sent → Draft (un-send) | ✓ | — | `sent_at`, `decided_at` |
| Approved/Rejected → Sent/Draft (un-decide) | ✓ | — | `decided_at`; and on leaving Approved also `work_status`, `started_at`, `completed_at` |

> **Note vs current frontend:** `applyStatusTransition` (`repo.ts:241`) does **not** clear
> `workStatus/startedAt/completedAt` when un-approving — a minor client bug. The backend state
> machine clears them so `sow_project_fields_ck` always holds. This supersedes the client behavior;
> update the frontend to match (maintenance rule §1).

**RLS:** org-scoped per §S1. **Idempotency:** `POST /sows`, `POST /projects`. **Body cap** 64 KB;
`links` ≤ 20 (S5).

**Endpoints:** `GET /sows?q&status&clientId&sort&cursor&limit` · `GET /sows/:id` · `POST /sows`
(Idempotency-Key) · `PATCH /sows/:id` (title, docLink, decisionNote, clientId) · `POST
/sows/:id/status` `{ status }` (the transition op; validates the table above, stamps, writes
`audit_log action='sow.status_changed'`) · `DELETE /sows/:id` (cascades log entries).

**Field mapping:**

| Frontend field | File:line | Column |
|---|---|---|
| Client (combobox) | `SowFormDialog.tsx` (clientId) | `sow.client_id` |
| Title | `SowFormDialog.tsx:106`, `Sows.tsx` inline edit | `sow.title` |
| Status | `SowFormDialog.tsx:114` (`Select`) | `sow.status` (+ machine stamps) |
| Document link | `SowFormDialog.tsx:133` (`type="url"`) | `sow.doc_link` |
| Decision note | `SowFormDialog.tsx:144` | `sow.decision_note` |

---

### 7.4 Projects (= Approved SoWs) (`core`)

*Backs:* `Projects.tsx` (list, search, work-status filter, sort, New project), `ProjectFormDialog.tsx`,
`ProjectDetail.tsx` header/overview, `NewProjectDialog.tsx`. **No new table** — a project *is* a
`sow` with `status='Approved'`; its columns (`work_status`, `description`, `repo_url`, `staging_url`,
`links`, `started_at`, `completed_at`) live on `sow` (§7.3). This mirrors `repo.ts:274/287/301`.

**Work-status state machine** (via `PATCH /projects/:id`, `updateProject` `repo.ts:301`):

| From → To | Stamps |
|---|---|
| Active/On Hold → Completed | `completed_at = now()` (`sow_completed_ck`) |
| Completed → Active/On Hold | `completed_at = NULL` |

**Derived queries.**
- Project list (feeds `Projects.tsx`, `GET /projects`), served by `sow_org_project_ix`:
  ```sql
  SELECT id, client_id, title, work_status, repo_url, staging_url, started_at, updated_at
  FROM sow
  WHERE org_id = $org AND status = 'Approved'
    AND ($workStatus IS NULL OR work_status = $workStatus)
    AND ($clientId  IS NULL OR client_id  = $clientId)
    AND ($q IS NULL OR title ILIKE '%'||$q||'%')
  ORDER BY updated_at DESC, id            -- + name/created variants use sow_org_title_ix / sow_org_created_ix
  LIMIT $limit;
  ```
- Project detail (**bounded fan-out, documented**, feeds `ProjectDetail.tsx`) — this app has **no
  immutable composed artefact**, so there is **no stored render payload**; the normalized tables are
  authoritative. Opening a project is **two indexed reads**: (1) the sow row + client + contacts via
  one query (`sow` PK, `client` PK, `client_contact_client_ix`), (2) the first page of the log
  (`project_log_entry` keyset, §7.5). Pinned "current focus" (`getFocusItems`) comes from query (2).

**Endpoints:** `GET /projects?q&workStatus&clientId&sort&cursor&limit` · `GET /projects/:id`
(detail per above) · `POST /projects` (Idempotency-Key; creates a `sow` with `status='Approved'`,
stamping the approval machine) · `PATCH /projects/:id` (workStatus, description, repoUrl, stagingUrl,
links; workStatus change stamps `completed_at`).

**Field mapping:**

| Frontend field | File:line | Column |
|---|---|---|
| Client (New project) | `NewProjectDialog.tsx:89` | `sow.client_id` |
| Project name | `NewProjectDialog.tsx:105` | `sow.title` |
| Work status | `NewProjectDialog.tsx:113`, `ProjectFormDialog.tsx:86` | `sow.work_status` |
| Description | `NewProjectDialog.tsx:131`, `ProjectFormDialog.tsx:104` | `sow.description` |
| Repo URL | `ProjectFormDialog.tsx:115` (`type="url"`) | `sow.repo_url` |
| Staging URL | `ProjectFormDialog.tsx:125` (`type="url"`) | `sow.staging_url` |
| Link label | `ProjectFormDialog.tsx:148` | `sow.links[].label` (JSONB) |
| Link url | `ProjectFormDialog.tsx:153` | `sow.links[].url` (JSONB) |

---

### 7.5 Project log entries — the dev journal (`core`)

*Backs:* `ProjectDetail.tsx` (log timeline, search, type filter, inline add/edit via `LogEntryForm`,
pin/unpin, resolve/reopen, delete) and `Dashboard.tsx` (`AddLogItemForm` adds reminders + focus
items). Keyed by `sow_id` (`repo.ts:328` onward). Lifecycle: created → edited/pinned/resolved →
deleted (or cascade on SoW delete).

```sql
CREATE TABLE IF NOT EXISTS project_log_entry (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  sow_id     uuid NOT NULL,
  type       text NOT NULL CHECK (type IN ('Working On','Pending','Reminder','Backlog','Meeting Note','Note')),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  pinned     boolean NOT NULL DEFAULT false,     -- multiple pins allowed (no unique)
  resolved   boolean NOT NULL DEFAULT false,     -- reminders only
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sow_id, org_id) REFERENCES sow (id, org_id) ON DELETE CASCADE,   -- cascade = deleteSow behavior
  CONSTRAINT log_resolved_reminder_ck CHECK (resolved = false OR type = 'Reminder')
);
CREATE INDEX IF NOT EXISTS log_sow_time_ix ON project_log_entry (org_id, sow_id, created_at DESC, id);       -- a project's timeline (keyset)
CREATE INDEX IF NOT EXISTS log_reminders_ix ON project_log_entry (org_id, created_at DESC, id)
  WHERE type = 'Reminder' AND resolved = false;                                                              -- dashboard reminders
CREATE INDEX IF NOT EXISTS log_focus_ix ON project_log_entry (org_id, created_at DESC, id)
  WHERE pinned = true AND type <> 'Reminder';                                                                -- dashboard focus
CREATE INDEX IF NOT EXISTS log_body_trgm_ix ON project_log_entry USING gin (body gin_trgm_ops);              -- in-project search (needs pg_trgm)
```
> Timestamp columns are `NOT NULL DEFAULT now()`: they sort the "newest-first" timeline, so a
> nullable value would sort NULLs first and win forever (rule §12 / audit bar).

**RLS:** org-scoped per §S1. **Body cap** 20 000 (S5, matches `LogEntryForm` domain).

**Derived queries** (each maps 1:1 to a `repo.ts` view, all indexed single reads):
- Reminders (`getReminders` `:488`) — feeds Dashboard, served by `log_reminders_ix`:
  ```sql
  SELECT e.id, e.sow_id, e.body, e.created_at, s.title AS project_title, c.name AS client_name
  FROM project_log_entry e
  JOIN sow s    ON s.id = e.sow_id  AND s.org_id = e.org_id
  JOIN client c ON c.id = s.client_id AND c.org_id = e.org_id
  WHERE e.org_id = $org AND e.type = 'Reminder' AND e.resolved = false
    AND s.status = 'Approved' AND s.work_status <> 'Completed'
  ORDER BY e.created_at DESC, e.id
  LIMIT 200;
  ```
  Join columns (`sow.id`, `client.id`) are PKs → unique; the composite `(id, org_id)` keys keep the
  join tenant-safe.
- Focus items (`getFocusItems` `:469`) — same shape with `e.pinned = true AND e.type <> 'Reminder'`,
  served by `log_focus_ix`.
- In-project search (`searchLogEntries` `:339`): `WHERE org_id=$org AND sow_id=$id AND body ILIKE
  '%'||$q||'%'` (trigram-indexed) `ORDER BY created_at DESC, id`.

**Endpoints:** `GET /projects/:id/log?q&type&cursor&limit` · `POST /projects/:id/log`
(Idempotency-Key; `LogEntryForm` and both dashboard `AddLogItemForm` flows land here) · `PATCH
/log/:id` (type, body, pinned) · `POST /log/:id/pin` (toggle) · `POST /log/:id/resolve` (toggle;
rejects non-`Reminder`) · `DELETE /log/:id`.

**Field mapping:**

| Frontend field | File:line | Column |
|---|---|---|
| Entry type | `LogEntryForm.tsx` type `Select` | `project_log_entry.type` |
| Entry body | `LogEntryForm.tsx:84` | `project_log_entry.body` |
| Pin as focus | `LogEntryForm.tsx` toggle / row action | `project_log_entry.pinned` |
| Resolve (reminder) | `ProjectDetail.tsx` row action | `project_log_entry.resolved` |
| Reminder note (dashboard) | `Dashboard.tsx` `AddLogItemForm` kind=reminder | `body` (+ `type='Reminder'`) |
| Focus note (dashboard) | `Dashboard.tsx` `AddLogItemForm` kind=focus | `body` (+ `type='Working On'`, `pinned=true`) |
| Project (dashboard combobox) | `Dashboard.tsx` `AddLogItemForm` | `project_log_entry.sow_id` |

---

### 7.6 Dashboard & bootstrap (derived reads, `core`)

*Backs:* app load and `Dashboard.tsx`. Nothing new is stored — everything is computed.

- `GET /bootstrap` — one round trip on app open: `{ user, org, role }` (from `GET /auth/me`) plus
  the client list-with-counts (§7.2 query). Served by `client_org_name_ix` + child FK indexes.
- `GET /dashboard` — `getStats` + reminders + focus in one call:
  ```sql
  -- stats (one indexed aggregate, served by sow_org_status_ix / sow_org_project_ix):
  SELECT
    count(*)                                                  AS total_sows,
    count(*) FILTER (WHERE status = 'Draft')                  AS draft,
    count(*) FILTER (WHERE status = 'Sent')                   AS awaiting_decision,
    count(*) FILTER (WHERE status = 'Approved')               AS approved,
    count(*) FILTER (WHERE status = 'Rejected')               AS rejected,
    count(*) FILTER (WHERE status = 'Approved' AND work_status = 'Active')    AS active,
    count(*) FILTER (WHERE status = 'Approved' AND work_status = 'On Hold')   AS on_hold,
    count(*) FILTER (WHERE status = 'Approved' AND work_status = 'Completed') AS completed
  FROM sow WHERE org_id = $org;
  -- conversionRate = approved / NULLIF(approved + rejected, 0), computed in the app layer (derived, never stored).
  ```
  plus the reminders and focus queries from §7.5 (both index-served, both capped).

No field mapping (read-only, no inputs beyond the dashboard `AddLogItemForm` covered in §7.5).

---

## 8. Recommended build order

**Foundational spine (in sequence — each blocks the next):**
1. `org`, `app_user`, `membership` + the RLS recipe (§S1) + the **CI cross-org test** (`foundational`, M).
2. Auth flows: signup/login/refresh/verify/reset over `session` + `auth_token` (§S2) (`foundational`, L).
3. `idempotency_key`, `audit_log`, and the request-context middleware (§S-IDEMP, §S1) (`foundational`, S).

**Then parallel tracks (all depend on the spine, independent of each other):**
- **Track A — Clients & contacts** (§7.2): tables, list/detail/create/patch, contact sub-resource.
- **Track B — SoWs & the status machine** (§7.3): `sow` table + CHECKs, list/detail/create/patch,
  `POST /sows/:id/status`, delete.
- **Track C — Projects & log** (§7.4, §7.5): project endpoints over `sow`, `project_log_entry`
  table + endpoints, `pg_trgm` for search.
- **Track D — Dashboard/bootstrap reads** (§7.6): after A–C exist.
- **Track E — Observability & headers** (§S4): logging, correlation ids, security headers,
  alerting.

Ship RLS in the same migration as each table. No endpoint merges to `main` without its input schema
(S7) and an authorization test (S3).

---

## 9. Not yet scoped (honest omissions)

- **Billing / plans / usage metering** — no pricing surface exists.
- **Transactional email** — verification/reset emails need a provider; the token tables (§7.1) are
  ready, the sender is not.
- **Team management UI** — `membership` supports `owner/admin/member`, but there is **no invite/
  role-management screen**; today every org has exactly one `owner` row. Building the UI is later.
- **`DELETE /clients/:id`** — no delete-client affordance in the frontend. The FK cascade would wipe
  a client's entire SoW/project/log tree, so this must ship as a **guarded/soft-delete** op, not a
  bare `DELETE`.
- **Background jobs** — token/session/idempotency cleanup (expired-row sweeps) and audit retention.
- **Admin tooling / impersonation.**
- **Expensive-compute (AI) proxy, third-party connectors, realtime/collaboration** — the app calls
  no external API and has no shared-editing UI (§3.4). If any is added, S5's compute budget,
  S6's per-tenant encrypted credentials, and a realtime channel get designed then — and this file
  updated per §1.
- **Markdown rendering of note bodies** — bodies are plain text today (`types.ts:85`); if rendered
  as HTML later, add sanitization to S7.
- **File uploads** — none exist; if added, S5 gains per-file/MIME/count caps and a storage table.

---

## 10. Verification pass (adversarial self-audit)

**Table count: before 12 (first pass) → after 11.** The first draft split email-verification and
password-reset into two tables; they were **merged** into one `auth_token` (typed by a `token_type`
CHECK) with no loss of constraint (each still hashed, expiring, single-use via `consumed_at`).
`ProjectLink` was **kept as JSONB** on `sow` (never a table). Final tables: `org`, `app_user`,
`membership`, `session`, `auth_token`, `idempotency_key`, `audit_log`, `client`, `client_contact`,
`sow`, `project_log_entry`.

**1. Keys, joins, normalization.**
- Every FK has an explicit `ON DELETE` (§S-FK): CASCADE for artefact chains
  (org→client→sow→log, client→contact), SET NULL for the two traceability links
  (`audit_log.actor_user_id`, `session.rotated_to`). No bare defaults.
- Every stated invariant is a constraint: "one membership per (org,user)" → `UNIQUE (org_id,
  user_id)`; "one owner per org" → partial unique `membership (org_id) WHERE role='owner'`; "one
  successor per session" → partial unique `session (rotated_to) WHERE rotated_to IS NOT NULL`;
  case-insensitive login → `UNIQUE (lower(email))`; the sow status/work_status/timestamp machine →
  five named CHECKs; "reminders only resolve" → `log_resolved_reminder_ck`.
- Composite FKs `(client_id, org_id)` and `(sow_id, org_id)` prevent cross-tenant attachment (FK
  checks bypass RLS); their parents carry `UNIQUE (id, org_id)`.
- No derivable data stored as truth: contact/SoW/project counts, `conversionRate`, reminders, focus,
  and all sorts are computed. Stored timestamps (`sent_at`…`completed_at`) are **not** derivable
  post-hoc, so they are correctly stored (approval time can't be recomputed).
- No fail-open RLS: every policy predicate is `org_id = NULLIF(current_setting(...),'')::uuid` (or
  the user variant) with `WITH CHECK`, so unset context yields zero rows and rejects writes.
- Every documented query's join columns are unique (PKs) and indexed; `NULLS NOT DISTINCT` not
  needed here because no natural-key table has a nullable scope column (all tenant tables have
  `org_id NOT NULL`).

**2. Table necessity.**
- **Necessary:** `org`, `app_user`, `session`, `auth_token` (auth), `membership` (RLS user→org map +
  role enum + one-owner constraint), `idempotency_key` (§S-IDEMP), `audit_log` (S4 append-only),
  `client`/`sow`/`project_log_entry` (every page reads/writes them), `client_contact` (per-item
  edit/remove ops in `ClientContacts.tsx` + a documented count query).
- **Merged:** email-verification + password-reset → `auth_token` (kept: hashing, expiry, single-use).
- **Kept as JSONB (not a table):** `sow.links` (bulk-saved, never filtered/joined/reached-into),
  `audit_log.metadata` (unstructured).
- **Unnecessary:** none.

**3. Coverage both directions.**
- Every frontend form field maps to a column: verified in the §7.2/7.3/7.4/7.5 field-mapping tables
  (client name/industry/notes/contacts; SoW client/title/status/docLink/decisionNote; project
  client/name/workStatus/description/repoUrl/stagingUrl/links; log type/body/pinned/resolved;
  dashboard reminder/focus note+project). **No orphan field.** Money is correctly absent (removed
  from the model).
- Every table maps to a real feature/endpoint (§2 of this audit). **Nothing invented.**

**4. Read paths.** Every hot interaction has an endpoint whose query is one round trip (or a
documented bounded fan-out): bootstrap (§7.6), dashboard aggregate + reminders + focus (index-served),
client/SoW/project lists (keyset, serving indexes named), project detail (2 indexed reads,
render-payload deliberately omitted with justification), in-project log search (trigram index). Every
list's sort column (`updated_at`, `created_at`, `lower(title)`, `lower(name)`) has a serving index.

**5. Security.** S0 threat model; S1 RLS recipe with FORCE, transaction-scoped `set_config`,
fail-closed predicates, single per-user policy, default-privilege grants, CI test; S2 auth
(Argon2id, rotating hashed refresh, verification-gated login, ≤30-min single-use hashed reset,
rate-limited, MFA for admins, constant-time); S3 IDOR (full-chain ownership, deny-by-default, opaque
404, join-to-parent); S4 deployment/logging (HSTS + header set, private TLS DB, structured logs,
append-only audit); S5 abuse (per user/org/IP buckets, 429+Retry-After, ingestion caps folded here,
no compute budget since no AI); S6 secrets (history scan CI gate, no `VITE_*` secrets, write-only
tenant creds if ever added); S7 input validation (per-endpoint schema, reject-unknown, URL scheme
allowlist mirroring `src/lib/url.ts`, enum exactness, plain-text bodies). Each stated **once** in its
authoritative section; everything else points at it.
