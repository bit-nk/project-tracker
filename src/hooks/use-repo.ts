/**
 * React binding for the data-access seam.
 *
 * Components import reads (and mutations) from HERE, never from `@/data/repo`.
 * Reads subscribe to the store via `useSyncExternalStore`; mutations are
 * re-exported as-is. When the backend goes async, loading/error state lands here
 * and components keep calling `useSows()` etc. unchanged.
 */
import { useMemo, useSyncExternalStore } from "react";
import * as repo from "@/data/repo";
import type { ID, SowStatus, WorkStatus } from "@/types";

function useVersion(): number {
  return useSyncExternalStore(repo.subscribe, repo.getVersion, repo.getVersion);
}

// ---- Clients ----
export function useClients() {
  const v = useVersion();
  return useMemo(() => repo.listClients(), [v]);
}
export function useClient(id: ID | undefined) {
  const v = useVersion();
  return useMemo(() => (id ? repo.getClient(id) : undefined), [v, id]);
}
/** A client plus their full SoW + Project history. */
export function useClientHistory(id: ID | undefined) {
  const v = useVersion();
  return useMemo(() => {
    if (!id) return undefined;
    const client = repo.getClient(id);
    if (!client) return undefined;
    return {
      client,
      sows: repo.listSows({ clientId: id }),
      projects: repo.listProjects({ clientId: id }),
    };
  }, [v, id]);
}

// ---- SoWs ----
export function useSows(filter?: { status?: SowStatus; clientId?: ID }) {
  const v = useVersion();
  return useMemo(() => repo.listSows(filter), [v, filter?.status, filter?.clientId]);
}
export function useSow(id: ID | undefined) {
  const v = useVersion();
  return useMemo(() => (id ? repo.getSow(id) : undefined), [v, id]);
}

// ---- Projects (Approved SoWs) ----
export function useProjects(filter?: { workStatus?: WorkStatus; clientId?: ID }) {
  const v = useVersion();
  return useMemo(() => repo.listProjects(filter), [v, filter?.workStatus, filter?.clientId]);
}
export function useProject(id: ID | undefined) {
  const v = useVersion();
  return useMemo(() => (id ? repo.getProject(id) : undefined), [v, id]);
}

// ---- Log entries ----
export function useLogEntries(sowId: ID | undefined) {
  const v = useVersion();
  return useMemo(() => (sowId ? repo.listLogEntries(sowId) : []), [v, sowId]);
}
export function useSearchLogEntries(sowId: ID | undefined, query: string) {
  const v = useVersion();
  return useMemo(
    () => (sowId ? repo.searchLogEntries(sowId, query) : []),
    [v, sowId, query]
  );
}
export function usePinnedEntries(sowId: ID | undefined) {
  const v = useVersion();
  return useMemo(() => (sowId ? repo.getPinnedEntries(sowId) : []), [v, sowId]);
}

// ---- Derived views ----
export function useStats() {
  const v = useVersion();
  return useMemo(() => repo.getStats(), [v]);
}
export function useFocusItems() {
  const v = useVersion();
  return useMemo(() => repo.getFocusItems(), [v]);
}
export function useReminders() {
  const v = useVersion();
  return useMemo(() => repo.getReminders(), [v]);
}

// ---- Mutations (imperative; call from handlers) ----
export const {
  createClient,
  updateClient,
  addClientContact,
  createSow,
  updateSow,
  deleteSow,
  updateProject,
  addLogEntry,
  updateLogEntry,
  deleteLogEntry,
  togglePinned,
  toggleResolved,
  sortSows,
  sowComparator,
  resetDemo,
} = repo;

export type {
  ClientInput,
  SowInput,
  ProjectInput,
  LogEntryInput,
  DashboardStats,
  FocusItem,
  ReminderItem,
  SortOption,
} from "@/data/repo";
