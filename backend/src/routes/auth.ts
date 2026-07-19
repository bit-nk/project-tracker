import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, query, withUser } from "../db.js";
import { HttpError } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  signAccessToken,
  newRefreshToken,
  hashRefreshToken,
  REFRESH_IDLE_DAYS,
  REFRESH_ABSOLUTE_DAYS,
} from "../auth/tokens.js";
import type { AuthContext } from "../types.js";

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

// Precomputed hash so login always runs exactly one argon2 verify, even for an
// unknown email — equalizes response timing so latency can't reveal existence.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

const signupBody = z.object({
  orgName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(200),
});
const loginBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});
const refreshBody = z.object({ refreshToken: z.string().min(1) });

async function createSession(userId: string, ip: string | null, ua: string | null) {
  const { token, hash } = newRefreshToken();
  await query(
    `INSERT INTO session (user_id, refresh_token_hash, idle_expires_at, absolute_expires_at, ip, user_agent)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, now() + ($4 || ' days')::interval, $5, $6)`,
    [userId, hash, String(REFRESH_IDLE_DAYS), String(REFRESH_ABSOLUTE_DAYS), ip, ua]
  );
  return token;
}

async function orgForUser(userId: string): Promise<{ orgId: string; role: AuthContext["role"] }> {
  const m = await withUser(userId, (c) =>
    c.query<{ org_id: string; role: AuthContext["role"] }>(
      "SELECT org_id, role FROM membership WHERE user_id = $1 AND status = 'active' ORDER BY created_at LIMIT 1",
      [userId]
    )
  );
  if (m.rows.length === 0) throw new HttpError(403, "no_active_membership");
  return { orgId: m.rows[0].org_id, role: m.rows[0].role };
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/signup", async (req, reply) => {
    const { orgName, email, password } = signupBody.parse(req.body);
    const passwordHash = await hashPassword(password);

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const org = await c.query<{ id: string }>("INSERT INTO org (name) VALUES ($1) RETURNING id", [orgName]);
      const orgId = org.rows[0].id;
      const user = await c.query<{ id: string }>(
        "INSERT INTO app_user (email, password_hash) VALUES ($1, $2) RETURNING id",
        [email, passwordHash]
      );
      const userId = user.rows[0].id;
      await c.query(
        "SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true)",
        [orgId, userId]
      );
      await c.query("INSERT INTO membership (org_id, user_id, role) VALUES ($1, $2, 'owner')", [orgId, userId]);
      await c.query("COMMIT");

      const auth: AuthContext = { userId, orgId, role: "owner" };
      const refreshToken = await createSession(userId, req.ip, req.headers["user-agent"] ?? null);
      return reply.status(201).send({ accessToken: signAccessToken(auth), refreshToken });
    } catch (e) {
      await c.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505") throw new HttpError(409, "email_taken");
      throw e;
    } finally {
      c.release();
    }
  });

  app.post("/auth/login", async (req) => {
    const { email, password } = loginBody.parse(req.body);
    const found = await query<{
      id: string;
      password_hash: string;
      status: string;
      locked_until: Date | null;
      failed_login_count: number;
    }>(
      "SELECT id, password_hash, status, locked_until, failed_login_count FROM app_user WHERE lower(email) = lower($1)",
      [email]
    );

    const user = found.rows[0];
    const invalid = new HttpError(401, "invalid_credentials");
    // Always run a verify (real hash or the dummy) BEFORE the existence/status
    // checks so response timing does not leak whether the email is registered.
    const ok = await verifyPassword(user?.password_hash ?? DUMMY_HASH, password);
    if (!user || user.status !== "active") throw invalid;
    if (user.locked_until && user.locked_until > new Date()) throw new HttpError(423, "account_locked");

    if (!ok) {
      // Atomic (race-safe) increment done in SQL — concurrent wrong attempts
      // can't each read the same stale count and collectively advance it by 1.
      // An expired lock resets the window (count -> 1) so a legitimate user
      // regains a full budget instead of being re-locked by a single typo.
      await query(
        `UPDATE app_user SET
           failed_login_count = CASE
             WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
             ELSE failed_login_count + 1 END,
           locked_until = CASE
             WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
                        ELSE failed_login_count + 1 END) >= $2
               THEN now() + ($3 || ' minutes')::interval
             WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL
             ELSE locked_until END,
           updated_at = now()
         WHERE id = $1`,
        [user.id, MAX_FAILED_LOGINS, String(LOCK_MINUTES)]
      );
      throw invalid;
    }

    await query(
      "UPDATE app_user SET failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1",
      [user.id]
    );
    const { orgId, role } = await orgForUser(user.id);
    const auth: AuthContext = { userId: user.id, orgId, role };
    const refreshToken = await createSession(user.id, req.ip, req.headers["user-agent"] ?? null);
    return { accessToken: signAccessToken(auth), refreshToken };
  });

  app.post("/auth/refresh", async (req) => {
    const { refreshToken } = refreshBody.parse(req.body);
    const hash = hashRefreshToken(refreshToken);

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const s = await c.query<{ id: string; user_id: string; revoked_at: Date | null }>(
        `SELECT id, user_id, revoked_at FROM session
         WHERE refresh_token_hash = $1 AND revoked_at IS NULL
           AND idle_expires_at > now() AND absolute_expires_at > now()
         FOR UPDATE`,
        [hash]
      );
      const session = s.rows[0];
      if (!session) {
        // Reuse detection: a token that was already rotated away and is replayed
        // >30s later is a theft signal — revoke the whole session family. The 30s
        // grace avoids nuking a benign double-submit (two tabs refreshing the
        // same token near-simultaneously).
        const reused = await c.query<{ user_id: string }>(
          `SELECT user_id FROM session
           WHERE refresh_token_hash = $1 AND rotated_to IS NOT NULL
             AND revoked_at < now() - interval '30 seconds'`,
          [hash]
        );
        if (reused.rows.length > 0) {
          await c.query("UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
            reused.rows[0].user_id,
          ]);
          await c.query("COMMIT");
        } else {
          await c.query("ROLLBACK");
        }
        throw new HttpError(401, "invalid_refresh_token");
      }

      const { token: newToken, hash: newHash } = newRefreshToken();
      const created = await c.query<{ id: string }>(
        `INSERT INTO session (user_id, refresh_token_hash, idle_expires_at, absolute_expires_at, ip, user_agent)
         VALUES ($1, $2, now() + ($3 || ' days')::interval, now() + ($4 || ' days')::interval, $5, $6)
         RETURNING id`,
        [
          session.user_id,
          newHash,
          String(REFRESH_IDLE_DAYS),
          String(REFRESH_ABSOLUTE_DAYS),
          req.ip,
          req.headers["user-agent"] ?? null,
        ]
      );
      await c.query("UPDATE session SET revoked_at = now(), rotated_to = $2, last_used_at = now() WHERE id = $1", [
        session.id,
        created.rows[0].id,
      ]);
      await c.query("COMMIT");

      const { orgId, role } = await orgForUser(session.user_id);
      const auth: AuthContext = { userId: session.user_id, orgId, role };
      return { accessToken: signAccessToken(auth), refreshToken: newToken };
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  });

  app.post("/auth/logout", async (req) => {
    const { refreshToken } = refreshBody.parse(req.body);
    await query("UPDATE session SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL", [
      hashRefreshToken(refreshToken),
    ]);
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    const r = await query<{ id: string; email: string }>("SELECT id, email FROM app_user WHERE id = $1", [
      req.auth.userId,
    ]);
    if (r.rows.length === 0) throw new HttpError(404, "not_found");
    return { id: r.rows[0].id, email: r.rows[0].email, orgId: req.auth.orgId, role: req.auth.role };
  });
}
