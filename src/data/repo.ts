/**
 * Data-access seam.
 *
 * The ONLY module that knows how data is stored. Today it keeps the seeded
 * dataset in memory and mutates it synchronously; a tiny pub/sub lets the React
 * hooks in `src/hooks/` re-render on change. When the real backend lands, this
 * file becomes `fetch()` calls - the signatures (and every hook/component) stay.
 *
 * Model: a **Project is an Approved SoW**. There is no separate Project entity.
 * `listProjects()` is "the Approved SoWs"; log entries are keyed by SoW id.
 *
 * Rules of the seam:
 *  - Components never import this module directly; they go through hooks.
 *  - Read functions return fresh arrays/objects (never internal references).
 *  - Writes mutate the store, then `emit()` so subscribers refresh.
 */
import { buildSeed, type SeedData } from "./seed";
import type {
  Client,
  ClientContact,
  ID,
  ProjectLink,
  ProjectLogEntry,
  Sow,
  SowStatus,
  WorkStatus,
  LogEntryType,
} from "@/types";

// ---------------------------------------------------------------------------
// Store + reactivity
// ---------------------------------------------------------------------------
let db: SeedData = buildSeed();

// Monotonic id counters. Seeded from the max existing id and only ever
// increase, so deleting a row never lets its id be recycled (which could
// otherwise silently re-link unrelated records).
type Prefix = "c" | "s" | "l";
function seedCounters(d: SeedData): Record<Prefix, number> {
  const maxNum = (items: { id: ID }[], p: Prefix) =>
    items.reduce((m, it) => {
      const n = Number(it.id.slice(p.length));
      return !Number.isNaN(n) && n > m ? n : m;
    }, 0);
  return { c: maxNum(d.clients, "c"), s: maxNum(d.sows, "s"), l: maxNum(d.logEntries, "l") };
}
let counters = seedCounters(db);
function nextId(prefix: Prefix): ID {
  counters[prefix] += 1;
  return `${prefix}${counters[prefix]}`;
}

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  for (const l of listeners) l();
}

/** Subscribe to any data change. Returns an unsubscribe fn. */
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
/** Monotonic snapshot used by `useSyncExternalStore`. */
export function getVersion(): number {
  return version;
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export function listClients(): Client[] {
  return [...db.clients].sort((a, b) => a.name.localeCompare(b.name));
}
export function getClient(id: ID): Client | undefined {
  return db.clients.find((c) => c.id === id);
}

export interface ClientInput {
  name: string;
  industry?: string;
  contacts?: ClientContact[];
  notes?: string;
}

function cleanContacts(contacts?: ClientContact[]): ClientContact[] | undefined {
  const cleaned = contacts
    ?.filter((c) => c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      contact: c.contact?.trim() || undefined,
      role: c.role?.trim() || undefined,
    }));
  return cleaned && cleaned.length ? cleaned : undefined;
}

export function createClient(input: ClientInput): Client {
  const client: Client = {
    id: nextId("c"),
    name: input.name.trim(),
    industry: input.industry?.trim() || undefined,
    contacts: cleanContacts(input.contacts),
    notes: input.notes?.trim() || undefined,
    createdAt: now(),
  };
  db.clients.push(client);
  emit();
  return client;
}

export function updateClient(id: ID, patch: Partial<ClientInput>): Client {
  const client = db.clients.find((c) => c.id === id);
  if (!client) throw new Error(`Client ${id} not found`);
  if (patch.name !== undefined) client.name = patch.name.trim();
  if (patch.industry !== undefined) client.industry = patch.industry.trim() || undefined;
  if (patch.contacts !== undefined) client.contacts = cleanContacts(patch.contacts);
  if (patch.notes !== undefined) client.notes = patch.notes.trim() || undefined;
  emit();
  return client;
}

/** Quick-add a single contact without opening the full edit form. */
export function addClientContact(id: ID, contact: ClientContact): Client {
  const client = db.clients.find((c) => c.id === id);
  if (!client) throw new Error(`Client ${id} not found`);
  if (!contact.name.trim()) return client;
  const next = [...(client.contacts ?? []), contact];
  client.contacts = cleanContacts(next);
  emit();
  return client;
}

// ---------------------------------------------------------------------------
// Sorting (shared by the SoW and Project lists)
// ---------------------------------------------------------------------------
export type SortOption =
  | "edited-desc"
  | "edited-asc"
  | "added-desc"
  | "added-asc"
  | "name-asc"
  | "name-desc";

export function sowComparator(sort: SortOption): (a: Sow, b: Sow) => number {
  switch (sort) {
    case "edited-desc":
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt);
    case "edited-asc":
      return (a, b) => a.updatedAt.localeCompare(b.updatedAt);
    case "added-desc":
      return (a, b) => b.createdAt.localeCompare(a.createdAt);
    case "added-asc":
      return (a, b) => a.createdAt.localeCompare(b.createdAt);
    case "name-asc":
      return (a, b) => a.title.localeCompare(b.title);
    case "name-desc":
      return (a, b) => b.title.localeCompare(a.title);
  }
}

export function sortSows(items: Sow[], sort: SortOption): Sow[] {
  return [...items].sort(sowComparator(sort));
}

// ---------------------------------------------------------------------------
// SoWs (Approved SoWs double as Projects)
// ---------------------------------------------------------------------------
export function listSows(filter?: { status?: SowStatus; clientId?: ID }): Sow[] {
  let rows = [...db.sows];
  if (filter?.status) rows = rows.filter((s) => s.status === filter.status);
  if (filter?.clientId) rows = rows.filter((s) => s.clientId === filter.clientId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getSow(id: ID): Sow | undefined {
  return db.sows.find((s) => s.id === id);
}

export interface SowInput {
  clientId: ID;
  title: string;
  docLink?: string;
  status?: SowStatus;
  decisionNote?: string;
  /** Used when creating a project directly (an Approved SoW). */
  description?: string;
}

export function createSow(input: SowInput): Sow {
  const status = input.status ?? "Draft";
  const created = now();
  const sow: Sow = {
    id: nextId("s"),
    clientId: input.clientId,
    title: input.title.trim(),
    docLink: input.docLink?.trim() || undefined,
    status,
    decisionNote: input.decisionNote?.trim() || undefined,
    description: input.description?.trim() || undefined,
    createdAt: created,
    updatedAt: created,
    sentAt: status !== "Draft" ? created : undefined,
    decidedAt: status === "Approved" || status === "Rejected" ? created : undefined,
  };
  if (status === "Approved") becomeProject(sow);
  db.sows.push(sow);
  emit();
  return sow;
}

/** Give an Approved SoW its project fields (idempotent). */
function becomeProject(sow: Sow) {
  sow.workStatus = sow.workStatus ?? "Active";
  sow.startedAt = sow.startedAt ?? now();
}

/**
 * Update SoW-core fields. Status transitions auto-stamp timestamps and, on
 * approval, promote the SoW to a project.
 */
export function updateSow(id: ID, patch: Partial<SowInput>): Sow {
  const sow = db.sows.find((s) => s.id === id);
  if (!sow) throw new Error(`SoW ${id} not found`);

  if (patch.clientId !== undefined) sow.clientId = patch.clientId;
  if (patch.title !== undefined) sow.title = patch.title.trim();
  if (patch.docLink !== undefined) sow.docLink = patch.docLink.trim() || undefined;
  if (patch.decisionNote !== undefined)
    sow.decisionNote = patch.decisionNote.trim() || undefined;

  if (patch.status !== undefined && patch.status !== sow.status) {
    applyStatusTransition(sow, patch.status);
  }
  sow.updatedAt = now();
  emit();
  return sow;
}

function applyStatusTransition(sow: Sow, status: SowStatus) {
  sow.status = status;
  const ts = now();
  switch (status) {
    case "Draft":
      sow.sentAt = undefined;
      sow.decidedAt = undefined;
      break;
    case "Sent":
      sow.sentAt = sow.sentAt ?? ts;
      sow.decidedAt = undefined;
      break;
    case "Rejected":
      sow.sentAt = sow.sentAt ?? ts;
      sow.decidedAt = ts;
      break;
    case "Approved":
      sow.sentAt = sow.sentAt ?? ts;
      sow.decidedAt = ts;
      becomeProject(sow);
      break;
  }
}

export function deleteSow(id: ID): void {
  db.sows = db.sows.filter((s) => s.id !== id);
  db.logEntries = db.logEntries.filter((e) => e.sowId !== id); // cascade
  emit();
}

// ---------------------------------------------------------------------------
// Projects === Approved SoWs
// ---------------------------------------------------------------------------
export function listProjects(filter?: { workStatus?: WorkStatus; clientId?: ID }): Sow[] {
  let rows = db.sows.filter((s) => s.status === "Approved");
  if (filter?.workStatus) rows = rows.filter((s) => (s.workStatus ?? "Active") === filter.workStatus);
  if (filter?.clientId) rows = rows.filter((s) => s.clientId === filter.clientId);
  const order: Record<WorkStatus, number> = { Active: 0, "On Hold": 1, Completed: 2 };
  return rows.sort(
    (a, b) =>
      order[a.workStatus ?? "Active"] - order[b.workStatus ?? "Active"] ||
      (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt)
  );
}

/** A project is an Approved SoW; anything else isn't a project. */
export function getProject(id: ID): Sow | undefined {
  const sow = db.sows.find((s) => s.id === id);
  return sow && sow.status === "Approved" ? sow : undefined;
}

export interface ProjectInput {
  workStatus?: WorkStatus;
  description?: string;
  repoUrl?: string;
  stagingUrl?: string;
  links?: ProjectLink[];
}

/** Update the project (work) fields on an Approved SoW. */
export function updateProject(id: ID, patch: ProjectInput): Sow {
  const sow = db.sows.find((s) => s.id === id);
  if (!sow) throw new Error(`Project ${id} not found`);
  if (patch.description !== undefined) sow.description = patch.description.trim() || undefined;
  if (patch.repoUrl !== undefined) sow.repoUrl = patch.repoUrl.trim() || undefined;
  if (patch.stagingUrl !== undefined) sow.stagingUrl = patch.stagingUrl.trim() || undefined;
  if (patch.links !== undefined)
    sow.links = patch.links.filter((l) => l.label.trim() && l.url.trim());
  if (patch.workStatus !== undefined && patch.workStatus !== sow.workStatus) {
    sow.workStatus = patch.workStatus;
    sow.completedAt =
      patch.workStatus === "Completed" ? sow.completedAt ?? now() : undefined;
  }
  sow.updatedAt = now();
  emit();
  return sow;
}

/** Bump a SoW/project's "last edited" time (called on log activity). */
function touchSow(sowId: ID) {
  const sow = db.sows.find((s) => s.id === sowId);
  if (sow) sow.updatedAt = now();
}

// ---------------------------------------------------------------------------
// Project log entries (the dev journal) - keyed by SoW id
// ---------------------------------------------------------------------------
export function listLogEntries(sowId: ID): ProjectLogEntry[] {
  return db.logEntries
    .filter((e) => e.sowId === sowId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPinnedEntries(sowId: ID): ProjectLogEntry[] {
  return listLogEntries(sowId).filter((e) => e.pinned);
}

/** Plain case-insensitive substring search within one project's log. */
export function searchLogEntries(sowId: ID, query: string): ProjectLogEntry[] {
  const q = query.trim().toLowerCase();
  const rows = listLogEntries(sowId);
  if (!q) return rows;
  return rows.filter((e) => e.body.toLowerCase().includes(q));
}

export interface LogEntryInput {
  type: LogEntryType;
  body: string;
  pinned?: boolean;
}

export function addLogEntry(sowId: ID, input: LogEntryInput): ProjectLogEntry {
  const entry: ProjectLogEntry = {
    id: nextId("l"),
    sowId,
    type: input.type,
    body: input.body,
    createdAt: now(),
    pinned: input.pinned ?? false,
  };
  db.logEntries.push(entry);
  touchSow(sowId);
  emit();
  return entry;
}

export function updateLogEntry(
  id: ID,
  patch: Partial<Pick<ProjectLogEntry, "type" | "body" | "pinned">>
): ProjectLogEntry {
  const entry = db.logEntries.find((e) => e.id === id);
  if (!entry) throw new Error(`Log entry ${id} not found`);
  if (patch.type !== undefined) entry.type = patch.type;
  if (patch.body !== undefined) entry.body = patch.body;
  if (patch.pinned !== undefined) entry.pinned = patch.pinned;
  touchSow(entry.sowId);
  emit();
  return entry;
}

export function deleteLogEntry(id: ID): void {
  const entry = db.logEntries.find((e) => e.id === id);
  db.logEntries = db.logEntries.filter((e) => e.id !== id);
  if (entry) touchSow(entry.sowId);
  emit();
}

/** Toggle an entry's pin. Multiple pins per project are allowed. */
export function togglePinned(id: ID): void {
  const entry = db.logEntries.find((e) => e.id === id);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  emit();
}

/** Toggle a reminder's resolved state (resolved reminders leave the dashboard). */
export function toggleResolved(id: ID): void {
  const entry = db.logEntries.find((e) => e.id === id);
  if (!entry) return;
  entry.resolved = !entry.resolved;
  emit();
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------
export interface DashboardStats {
  sow: {
    total: number;
    byStatus: Record<SowStatus, number>;
    decided: number;
    approved: number;
    rejected: number;
    conversionRate: number; // approved / decided, 0 when none decided
    awaitingDecision: number; // status === "Sent"
  };
  project: {
    total: number;
    byStatus: Record<WorkStatus, number>;
    active: number;
    onHold: number;
    completed: number;
  };
}

export function getStats(): DashboardStats {
  const byStatus: Record<SowStatus, number> = { Draft: 0, Sent: 0, Approved: 0, Rejected: 0 };
  const projStatus: Record<WorkStatus, number> = { Active: 0, "On Hold": 0, Completed: 0 };

  for (const s of db.sows) {
    byStatus[s.status] += 1;
    if (s.status === "Approved") projStatus[s.workStatus ?? "Active"] += 1;
  }
  const approved = byStatus.Approved;
  const rejected = byStatus.Rejected;
  const decided = approved + rejected;

  return {
    sow: {
      total: db.sows.length,
      byStatus,
      decided,
      approved,
      rejected,
      conversionRate: decided === 0 ? 0 : approved / decided,
      awaitingDecision: byStatus.Sent,
    },
    project: {
      total: approved,
      byStatus: projStatus,
      active: projStatus.Active,
      onHold: projStatus["On Hold"],
      completed: projStatus.Completed,
    },
  };
}

/**
 * Pinned "current focus" entries for the dashboard, one item per pinned entry.
 * Reminders are excluded (they have their own dashboard section) as are
 * completed projects.
 */
export interface FocusItem {
  entry: ProjectLogEntry;
  project: Sow;
  client: Client | undefined;
}

export function getFocusItems(): FocusItem[] {
  const out: FocusItem[] = [];
  for (const e of db.logEntries) {
    if (!e.pinned || e.type === "Reminder") continue;
    const project = db.sows.find((s) => s.id === e.sowId);
    if (!project || project.status !== "Approved" || project.workStatus === "Completed")
      continue;
    out.push({ entry: e, project, client: getClient(project.clientId) });
  }
  return out.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
}

/** All "Reminder" log entries across projects, newest first, with context. */
export interface ReminderItem {
  entry: ProjectLogEntry;
  project: Sow;
  client: Client | undefined;
}

export function getReminders(): ReminderItem[] {
  const out: ReminderItem[] = [];
  for (const e of db.logEntries) {
    if (e.type !== "Reminder" || e.resolved) continue;
    const project = db.sows.find((s) => s.id === e.sowId);
    // Skip reminders on completed projects - they're no longer actionable.
    if (!project || project.workStatus === "Completed") continue;
    out.push({ entry: e, project, client: getClient(project.clientId) });
  }
  return out.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
}

/** Reset the in-memory store to a fresh seed (dev/demo convenience). */
export function resetDemo(): void {
  db = buildSeed();
  counters = seedCounters(db);
  emit();
}
