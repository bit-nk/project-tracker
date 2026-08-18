/**
 * Auth: token storage, the /auth/* calls, and a small pub/sub of auth state.
 * Uses raw fetch (not the api client) so api.ts can depend on this for the
 * bearer token and refresh without an import cycle.
 */
const BASE = import.meta.env.VITE_API_URL ?? "/api";
const ACCESS_KEY = "helm_access";
const REFRESH_KEY = "helm_refresh";

let accessToken: string | null = localStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function subscribeAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function isAuthed(): boolean {
  return accessToken !== null;
}
export function getAccessToken(): string | null {
  return accessToken;
}

function setTokens(access: string, refreshTok: string) {
  accessToken = access;
  refreshToken = refreshTok;
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refreshTok);
  emit();
}
export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  emit();
}

async function authPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data;
}

export async function signup(orgName: string, email: string, password: string): Promise<void> {
  const d = await authPost("/auth/signup", { orgName, email, password });
  setTokens(d.accessToken, d.refreshToken);
}
export async function login(email: string, password: string): Promise<void> {
  const d = await authPost("/auth/login", { email, password });
  setTokens(d.accessToken, d.refreshToken);
}
/** Try one refresh. Returns true on success, false if the session is dead. */
export async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const d = await authPost("/auth/refresh", { refreshToken });
    setTokens(d.accessToken, d.refreshToken);
    return true;
  } catch {
    return false;
  }
}
export async function logout(): Promise<void> {
  const tok = refreshToken;
  clearTokens();
  if (tok) {
    try {
      await authPost("/auth/logout", { refreshToken: tok });
    } catch {
      /* best effort */
    }
  }
}
