import { useSyncExternalStore } from "react";
import { subscribeAuth, isAuthed } from "@/data/auth";

/** True once the user holds a valid session (access token present). */
export function useIsAuthed(): boolean {
  return useSyncExternalStore(subscribeAuth, isAuthed, isAuthed);
}
