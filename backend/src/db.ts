import { Pool, type PoolClient } from "pg";
import { env } from "./env.js";

// The app connects as the restricted, RLS-enforced role.
export const pool = new Pool({ connectionString: env.DATABASE_URL });

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
