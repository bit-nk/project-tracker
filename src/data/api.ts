/**
 * Thin fetch client for the Helm API. Attaches the bearer token, refreshes it
 * once on a 401 then retries, and returns parsed JSON (throwing ApiError on
 * failure). Same-origin `/api` in production. The Vite dev proxy in dev.
 */
import { getAccessToken, refresh, clearTokens } from "./auth";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request(method: string, path: string, body?: unknown, retry = true): Promise<any> {
  const token = getAccessToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && token) {
    // Access token likely expired — refresh once, then retry the request.
    if (await refresh()) return request(method, path, body, false);
    clearTokens();
    throw new ApiError(401, "unauthorized");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json())?.error ?? msg;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body?: unknown) => request("POST", path, body),
  patch: (path: string, body?: unknown) => request("PATCH", path, body),
  del: (path: string) => request("DELETE", path),
};
