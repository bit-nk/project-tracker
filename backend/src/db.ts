import { Pool, type PoolClient } from "pg";
import { env } from "./env.js";

// The app connects as the restricted, RLS-enforced role.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  statement_timeout: 15_000, // abort any single query wedged past 15s
  idleTimeoutMillis: 30_000,
});

// A pooled client can lose its backend connection while idle (db restart, TCP
// reset, OOM). node-postgres emits 'error' on the pool; with no listener Node
// treats it as an unhandled 'error' event and exits the process. The pool has
// already discarded the broken client, so logging is all that is needed.
pool.on("error", (err) => console.error("idle pg client error:", err.message));

// Direct query — for auth tables that are not under RLS (org, app_user, session).
export const query = pool.query.bind(pool);

/**
 * Run `fn` inside a transaction with the tenant context set, so RLS policies
 * (`org_id = current_setting('app.current_org_id')`) apply to every statement.
 * is_local = true scopes the settings to this transaction only.
 */
export async function withTenant<T>(
  orgId: string,
  userId: string,
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true)",
      [orgId, userId]
    );
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Set only the user context (no org). Used at login to read a user's own
 * memberships before an org is chosen.
 */
export async function withUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
