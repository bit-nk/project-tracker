import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { HttpError } from "../lib/http.js";
import type { AuthContext } from "../types.js";

const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_IDLE_DAYS = 14;
export const REFRESH_ABSOLUTE_DAYS = 90;

interface AccessClaims {
  sub: string;
  org: string;
  role: AuthContext["role"];
}

export function signAccessToken(auth: AuthContext): string {
  const claims: AccessClaims = { sub: auth.userId, org: auth.orgId, role: auth.role };
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessClaims;
    return { userId: decoded.sub, orgId: decoded.org, role: decoded.role };
  } catch {
    throw new HttpError(401, "invalid_token");
  }
}

/** Opaque refresh token: return the plaintext to the client, store only its hash. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
