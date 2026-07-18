# Helm - SoW & Project Tracker

A personal dashboard for tracking Statements of Work (SoWs), the projects they turn
into, and a running dev journal per project. Built as a single-user tool: write a SoW,
get it approved, and it becomes a project you deliver - with all your working notes in
one place.

**Live demo:** https://bit-nk.github.io/project-tracker/

> The app currently runs entirely on the frontend with deterministic, seeded stub data
> (stable across reloads). All reads and writes go through a thin data-access layer, so
> swapping in a real backend later touches only that layer - never the UI.

## Features

### Dashboard
- Headline stats: total SoWs, conversion rate, and projects by status (Active / On Hold / Completed).
- **Reminders** and **Current focus** surfaced front and center as cards.
- Add a reminder or a focus item inline, straight from the dashboard - pick the project, type the note, done.
- Resolve a reminder or remove a focus item in one click.

### Statements of Work
- Grouped by client, collapsible, and searchable (by SoW title or client name).
- Filter by status (Draft → Sent → Approved / Rejected) and sort by name, date added, or date edited.
- Create and edit SoWs inline - no modal juggling.
- Approving a SoW turns it into a project automatically.

### Projects
- A project *is* an approved SoW; you can also start one directly.
- List view with search, work-status filter, and sorting.
- Each project has a collapsible **Contacts** panel (the client's people).

### Project detail - the dev journal
- A running **log timeline** (newest first) with search and type filters.
- Entry types: Working On, Pending, Reminder, Backlog, Meeting Note, Note.
- Add and edit entries inline, with a resizable note field.
- **Pin** entries as current focus (multiple allowed) and **resolve** reminders.
- Compact overview: status, dates, repo / staging / doc links.

### Clients
- Line-item list with quick counts (contacts, SoWs, projects) and inline name editing.
- Client detail with a full history of their SoWs and projects.
- Inline editing everywhere: header (name / industry), notes, and contacts (add / edit / remove).

### Everywhere
- Light and dark themes (persisted, no flash on load).
- Clean, keyboard-accessible UI.

## Tech stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** + Radix UI primitives
- **React Router v6**
- `lucide-react` icons
- Deterministic seeded stub data via a small `mulberry32` RNG

## Getting started

```bash
npm install
npm run dev        # start the dev server
```

Other scripts:

```bash
npm run build      # type-check + production build
npm run preview    # preview the production build
npm run typecheck  # type-check only
npm run check:data # run the data-layer self-check (assertions, no framework)
```

## Project structure

```
src/
  data/        # the data-access seam (seed + repo) - swap this for a real API later
  hooks/       # thin reactive wrappers the UI consumes
  components/  # UI primitives, layout, common widgets, forms
  pages/       # Dashboard, SoWs, Projects, Project detail, Clients, Client detail
  types.ts     # shared entity types (single source of truth)
```

## License

Copyright © 2026 Nirvik Kc. All rights reserved.
