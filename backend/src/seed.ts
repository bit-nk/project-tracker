/**
 * TEMPORARY seed (remove before real production).
 *
 * Creates ONE shared workspace + login so people can sign in and all see the
 * same data (there is no signup UI right now). Idempotent: does nothing if the
 * user already exists. Run with: `npm run seed`.
 */
import { pool, query } from "./db.js";
import { hashPassword } from "./auth/password.js";

const EMAIL = "test@helm.local";
const PASSWORD = "helmtest123";
const ORG_NAME = "Helm";

async function main() {
  const existing = await query<{ id: string }>(
    "SELECT id FROM app_user WHERE lower(email) = lower($1)",
    [EMAIL]
  );
  if (existing.rows.length > 0) {
    console.log(`seed: ${EMAIL} already exists — nothing to do`);
    await pool.end();
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const org = await c.query<{ id: string }>("INSERT INTO org (name) VALUES ($1) RETURNING id", [ORG_NAME]);
    const user = await c.query<{ id: string }>(
      "INSERT INTO app_user (email, password_hash, email_verified_at) VALUES ($1, $2, now()) RETURNING id",
      [EMAIL, passwordHash]
    );
    const orgId = org.rows[0].id;
    const userId = user.rows[0].id;
    // membership is RLS-scoped — set the tenant context before inserting.
    await c.query(
      "SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true)",
      [orgId, userId]
    );
    await c.query("INSERT INTO membership (org_id, user_id, role) VALUES ($1, $2, 'owner')", [orgId, userId]);
    await c.query("COMMIT");
    console.log(`seed: created shared workspace "${ORG_NAME}" — login ${EMAIL} / ${PASSWORD}`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
