# Helm — SoW & Project Tracker

React frontend + Fastify/Postgres backend for tracking Statements of Work, the projects
they become, and a per-project dev journal.

## Commands

**Frontend** (repo root):
- `npm run dev` — Vite dev server (localhost:5173)
- `npm run build` — typecheck (`tsc -p tsconfig.app.json`) + production build
- `npm run typecheck` — types only
- `npm run check:data` — url-safety self-check (the XSS guard for user-entered links)
- `npm run deploy` — publish `dist/` to GitHub Pages

**Backend** (`backend/`):
- `npm run dev` — Fastify with watch · `npm run start` — run
- `npm run migrate` — apply SQL migrations (idempotent; creates the `helm_app` role + RLS)
- `npm run typecheck` · `npm run selfcheck` — SoW state-machine unit check

**Deploy**: AWS Lightsail single box — see [deploy/DEPLOY.md](deploy/DEPLOY.md). Remaining backend
work is tracked in [BACKEND_TODO.md](BACKEND_TODO.md).

## Architecture invariants (don't break these)

- **A project IS an approved SoW.** No separate project table/entity — a project is a `sow` row
  with `status = 'Approved'`; project-only fields (`work_status`, `repo_url`, `links`…) live on
  that same row. Frontend: `src/types.ts`, `src/data/repo.ts` (`listProjects`/`getProject`).
- **No money/estimatedValue anywhere** — deliberately removed from the model.
- **Frontend data seam**: all state flows through `src/data/repo.ts` — a **write-through cache
  backed by the API** (`src/data/api.ts` + `src/data/auth.ts`). It hydrates from the API on login;
  each mutation calls the API then updates the cache; components read synchronously via
  `use-repo.ts`. Auth is JWT (login/signup in `src/pages/Login.tsx`, gate in `src/App.tsx`).
- **Backend multi-tenancy = Postgres RLS.** The app connects as non-superuser `helm_app`; every
  org-scoped request runs inside `withTenant()` which sets `app.current_org_id` per transaction.
  RLS policies must wrap the setting in `NULLIF(current_setting(...), '')::uuid` — a bare
  `''::uuid` cast throws on reused pooled connections. See `backend/migrations/003_rls_grants.sql`.

## Conventions

- **Design tokens only** — colors come from HSL CSS vars in `src/index.css` (mapped in
  `tailwind.config.ts`); no hard-coded hex. Semantic status colors: `primary`/`warning`/`success`/
  `info`/`destructive`. Light default, dark opt-in (`.dark` class, `use-theme.ts`).
- **shadcn/ui primitives** in `src/components/ui/`. Custom controls (`Combobox`, `SelectTrigger`)
  take an `id` for label association — always pair a `<Label htmlFor>` with them.
- **Commits**: no AI/co-author trailers or mentions (project policy).
