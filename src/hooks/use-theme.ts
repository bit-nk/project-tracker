/**
 * Light/dark theme, persisted to localStorage and applied as a `.dark` class on
 * <html> (Tailwind's `darkMode: "class"`). Defaults to light; dark is opt-in.
 * Backed by a small module store so every `useTheme()` consumer (e.g. multiple
 * sidebar instances) stays in sync. The pre-paint script in index.html applies
 * the initial class to avoid a flash.
 */
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "helm-theme";

function getInitial(): Theme {
  if (typeof window === "undefined") return "light";
  // Default to light; dark only when the user explicitly chose it.
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

let current: Theme = getInitial();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}
apply(current);

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setTheme(theme: Theme) {
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => current
  );
  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(current === "dark" ? "light" : "dark"),
  };
}
