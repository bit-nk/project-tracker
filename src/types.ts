/**
 * Shared entity types - the single source of truth for the whole app.
 *
 * Produced today by the seeded stub layer (`src/data/seed.ts`) and served
 * through the data-access seam (`src/data/repo.ts`). When the real Postgres
 * backend lands, only the repo changes; these shapes stay put.
 *
 * NOTE on the model: a **Project is not a separate entity** - it *is* a SoW that
 * has been Approved (won). Once a SoW is Approved it gains the "work" fields
 * below (workStatus, repo/staging, logs) and shows up under Projects.
 */

// ---------- shared ----------
export type ID = string;
/** ISO 8601 timestamp, e.g. "2026-03-14T09:00:00.000Z". */
export type ISODate = string;

// ---------- Client ----------
export interface ClientContact {
  name: string; // person's name
  contact?: string; // email / phone / handle
  role?: string; // what they do - e.g. "Billing", "Tech lead", "Approver"
}

export interface Client {
  id: ID;
  name: string;
  industry?: string;
  contacts?: ClientContact[];
  notes?: string;
  createdAt: ISODate;
}

// ---------- SoW (which becomes a Project once Approved) ----------
export const SOW_STATUSES = ["Draft", "Sent", "Approved", "Rejected"] as const;
export type SowStatus = (typeof SOW_STATUSES)[number];

/** Work status of an Approved SoW (i.e. a project). */
export const WORK_STATUSES = ["Active", "On Hold", "Completed"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export interface ProjectLink {
  label: string;
  url: string;
}

export interface Sow {
  id: ID;
  clientId: ID;
  title: string;
  docLink?: string; // URL to the SoW doc you wrote
  status: SowStatus;
  decisionNote?: string; // freeform, e.g. why it was rejected
  createdAt: ISODate;
  updatedAt: ISODate; // last time the SoW/project (or its log) was edited
  sentAt?: ISODate; // set on Draft -> Sent
  decidedAt?: ISODate; // set on Approved | Rejected

  // ----- project fields: meaningful once status === "Approved" -----
  workStatus?: WorkStatus; // Active | On Hold | Completed
  description?: string;
  repoUrl?: string;
  stagingUrl?: string;
  links?: ProjectLink[]; // small set of optional freeform metadata links
  startedAt?: ISODate; // when it became a project (~ approval)
  completedAt?: ISODate; // set on -> Completed
}

// ---------- Log entry (the dev journal - the heart of the app) ----------
// Keyed by the SoW id, since a project *is* its SoW.
export const LOG_ENTRY_TYPES = [
  "Working On",
  "Pending",
  "Reminder",
  "Backlog",
  "Meeting Note",
  "Note",
] as const;
export type LogEntryType = (typeof LOG_ENTRY_TYPES)[number];

export interface ProjectLogEntry {
  id: ID;
  sowId: ID; // the SoW/project this entry belongs to
  type: LogEntryType;
  body: string; // plain text (textarea); markdown rendering can come later
  createdAt: ISODate;
  pinned: boolean; // pinned = a "current focus". Multiple pins are allowed.
  resolved?: boolean; // for Reminders: resolved ones drop off the dashboard
}
