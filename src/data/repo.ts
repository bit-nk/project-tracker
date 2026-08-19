/**
 * Data-access seam — backed by the Helm API.
 *
 * A write-through in-memory cache: components read synchronously (through the
 * hooks + useSyncExternalStore), `hydrate()` fills the cache from the API on
 * login, and each mutation calls the API then updates the cache and emits.
 *
 * Model: a Project is an Approved SoW. There is no separate Project entity.
 * The backend owns the state machine, so this file no longer stamps timestamps
 * or generates ids — it maps API rows (snake_case) to the domain types.
 */
import { api } from "./api";
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
interface Store {
  clients: Client[];
  sows: Sow[];
  logEntries: ProjectLogEntry[];
}
const emptyStore = (): Store => ({ clients: [], sows: [], logEntries: [] });
let db: Store = emptyStore();

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  for (const l of listeners) l();
}
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getVersion(): number {
  return version;
}

// ---------------------------------------------------------------------------
// Mappers (API row -> domain type) + cache upserts
// ---------------------------------------------------------------------------
const opt = (v: unknown): string | undefined => (v ? String(v) : undefined);

function mapClient(r: any): Client {
  return { id: r.id, name: r.name, industry: opt(r.industry), notes: opt(r.notes), contacts: [], createdAt: r.created_at };
}
function mapContact(r: any): ClientContact {
  return { name: r.name, contact: opt(r.contact), role: opt(r.role) };
}
function mapSow(r: any): Sow {
  return {
    id: r.id,
    clientId: r.client_id,
    title: r.title,
    docLink: opt(r.doc_link),
    status: r.status,
    decisionNote: opt(r.decision_note),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at ?? undefined,
    decidedAt: r.decided_at ?? undefined,
    workStatus: r.work_status ?? undefined,
    description: opt(r.description),
    repoUrl: opt(r.repo_url),
    stagingUrl: opt(r.staging_url),
    links: r.links ?? [],
    startedAt: r.started_at ?? undefined,
    completedAt: r.completed_at ?? undefined,
  };
}
function mapLog(r: any): ProjectLogEntry {
  return {
    id: r.id,
    sowId: r.sow_id,
    type: r.type,
    body: r.body,
    createdAt: r.created_at,
    pinned: r.pinned,
    resolved: r.resolved ?? undefined,
  };
}
function upsertSow(row: any): Sow {
  const s = mapSow(row);
  const i = db.sows.findIndex((x) => x.id === s.id);
  if (i >= 0) db.sows[i] = s;
  else db.sows.push(s);
  return s;
}
function upsertLog(row: any): ProjectLogEntry {
  const e = mapLog(row);
  const i = db.logEntries.findIndex((x) => x.id === e.id);
  if (i >= 0) db.logEntries[i] = e;
  else db.logEntries.push(e);
  return e;
}

// ---------------------------------------------------------------------------
// Hydration / teardown
// ---------------------------------------------------------------------------
/** Load the whole org dataset into the cache (called once after login). */
export async function hydrate(): Promise<void> {
  const [clients, contacts, sows, logs] = await Promise.all([
    api.get("/clients"),
    api.get("/contacts"),
    api.get("/sows"),
    api.get("/logs"),
  ]);
  const byId = new Map<ID, Client>();
  for (const row of clients) byId.set(row.id, mapClient(row));
  for (const row of contacts) {
    const client = byId.get(row.client_id);
    if (client) (client.contacts ??= []).push(mapContact(row));
  }
  db = { clients: [...byId.values()], sows: sows.map(mapSow), logEntries: logs.map(mapLog) };
  emit();
}
/** Drop everything (called on logout). */
export function clearCache(): void {
  db = emptyStore();
  emit();
}

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

function cleanContacts(contacts?: ClientContact[]): ClientContact[] {
  return (contacts ?? [])
    .filter((c) => c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      contact: c.contact?.trim() || undefined,
      role: c.role?.trim() || undefined,
    }));
}

export async function createClient(input: ClientInput): Promise<Client> {
  const row = await api.post("/clients", {
    name: input.name.trim(),
    industry: input.industry?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  });
  const client = mapClient(row);
  client.contacts = [];
  for (const ct of cleanContacts(input.contacts)) {
    client.contacts.push(mapContact(await api.post(`/clients/${client.id}/contacts`, ct)));
  }
  db.clients.push(client);
  emit();
  return client;
}

export async function updateClient(id: ID, patch: Partial<ClientInput>): Promise<Client> {
  const client = db.clients.find((c) => c.id === id);
  if (!client) throw new Error(`Client ${id} not found`);

  if (patch.name !== undefined || patch.industry !== undefined || patch.notes !== undefined) {
    const row = await api.patch(`/clients/${id}`, {
      name: patch.name?.trim(),
      industry: patch.industry !== undefined ? patch.industry.trim() : undefined,
      notes: patch.notes !== undefined ? patch.notes.trim() : undefined,
    });
    client.name = row.name;
    client.industry = opt(row.industry);
    client.notes = opt(row.notes);
  }

  // ponytail: contact edits replace the whole set (fetch ids -> delete -> recreate).
  // Ceiling: not atomic and re-mints contact ids. Fine for a low-contact app.
  if (patch.contacts !== undefined) {
    const detail = await api.get(`/clients/${id}`);
    for (const existing of detail.contacts ?? []) await api.del(`/contacts/${existing.id}`);
    const fresh: ClientContact[] = [];
    for (const ct of cleanContacts(patch.contacts)) {
      fresh.push(mapContact(await api.post(`/clients/${id}/contacts`, ct)));
    }
    client.contacts = fresh;
  }
  emit();
  return client;
}

export async function addClientContact(id: ID, contact: ClientContact): Promise<Client> {
  const client = db.clients.find((c) => c.id === id);
  if (!client) throw new Error(`Client ${id} not found`);
  if (!contact.name.trim()) return client;
  const row = await api.post(`/clients/${id}/contacts`, {
    name: contact.name.trim(),
    contact: contact.contact?.trim() || undefined,
    role: contact.role?.trim() || undefined,
  });
  (client.contacts ??= []).push(mapContact(row));
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

export async function createSow(input: SowInput): Promise<Sow> {
  const status = input.status ?? "Draft";
  let row: any;
  if (status === "Approved") {
    // Direct project create: the backend only approves via the status endpoint,
    // so create as Draft -> approve -> (optionally) set the description.
    const draft = await api.post("/sows", {
      clientId: input.clientId,
      title: input.title.trim(),
      docLink: input.docLink?.trim() || undefined,
    });
    row = await api.post(`/sows/${draft.id}/status`, { status: "Approved", workStatus: "Active" });
    if (input.description?.trim()) {
      row = await api.patch(`/projects/${draft.id}`, { description: input.description.trim() });
    }
  } else {
    row = await api.post("/sows", {
      clientId: input.clientId,
      title: input.title.trim(),
      status,
      docLink: input.docLink?.trim() || undefined,
    });
  }
  const sow = upsertSow(row);
  emit();
  return sow;
}

export async function updateSow(id: ID, patch: Partial<SowInput>): Promise<Sow> {
  const current = db.sows.find((s) => s.id === id);
  if (!current) throw new Error(`SoW ${id} not found`);
  let row: any;

  // Core fields (title, docLink, decisionNote) via PATCH.
  if (patch.title !== undefined || patch.docLink !== undefined || patch.decisionNote !== undefined) {
    row = await api.patch(`/sows/${id}`, {
      title: patch.title?.trim(),
      docLink: patch.docLink !== undefined ? patch.docLink.trim() || null : undefined,
      decisionNote: patch.decisionNote !== undefined ? patch.decisionNote.trim() || null : undefined,
    });
  }
  // Status transition via the status endpoint (owns the state machine).
  if (patch.status !== undefined && patch.status !== current.status) {
    row = await api.post(`/sows/${id}/status`, {
      status: patch.status,
      decisionNote: patch.decisionNote?.trim() || undefined,
    });
  }
  if (!row) row = await api.get(`/sows/${id}`);
  const sow = upsertSow(row);
  emit();
  return sow;
}

export async function deleteSow(id: ID): Promise<void> {
  await api.del(`/sows/${id}`);
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

export async function updateProject(id: ID, patch: ProjectInput): Promise<Sow> {
  const row = await api.patch(`/projects/${id}`, {
    workStatus: patch.workStatus,
    description: patch.description !== undefined ? patch.description.trim() || null : undefined,
    repoUrl: patch.repoUrl !== undefined ? patch.repoUrl.trim() || null : undefined,
    stagingUrl: patch.stagingUrl !== undefined ? patch.stagingUrl.trim() || null : undefined,
    links:
      patch.links !== undefined
        ? patch.links.filter((l) => l.label.trim() && l.url.trim())
        : undefined,
  });
  const sow = upsertSow(row);
  emit();
  return sow;
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

export async function addLogEntry(sowId: ID, input: LogEntryInput): Promise<ProjectLogEntry> {
  const row = await api.post(`/sows/${sowId}/logs`, {
    type: input.type,
    body: input.body,
    pinned: input.pinned ?? false,
  });
  const entry = upsertLog(row);
  emit();
  return entry;
}

export async function updateLogEntry(
  id: ID,
  patch: Partial<Pick<ProjectLogEntry, "type" | "body" | "pinned">>
): Promise<ProjectLogEntry> {
  const row = await api.patch(`/logs/${id}`, {
    type: patch.type,
    body: patch.body,
    pinned: patch.pinned,
  });
  const entry = upsertLog(row);
  emit();
  return entry;
}

export async function deleteLogEntry(id: ID): Promise<void> {
  await api.del(`/logs/${id}`);
  db.logEntries = db.logEntries.filter((e) => e.id !== id);
  emit();
}

export async function togglePinned(id: ID): Promise<void> {
  const entry = db.logEntries.find((e) => e.id === id);
  if (!entry) return;
  upsertLog(await api.patch(`/logs/${id}`, { pinned: !entry.pinned }));
  emit();
}

export async function toggleResolved(id: ID): Promise<void> {
  const entry = db.logEntries.find((e) => e.id === id);
  if (!entry) return;
  upsertLog(await api.patch(`/logs/${id}`, { resolved: !entry.resolved }));
  emit();
}

// ---------------------------------------------------------------------------
// Derived views (computed from the cache)
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
    if (!project || project.status !== "Approved" || project.workStatus === "Completed") continue;
    out.push({ entry: e, project, client: getClient(project.clientId) });
  }
  return out.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
}

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
    if (!project || project.workStatus === "Completed") continue;
    out.push({ entry: e, project, client: getClient(project.clientId) });
  }
  return out.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
}
