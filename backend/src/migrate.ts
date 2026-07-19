import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";
import { env } from "./env.js";

// Runs numbered .sql migrations as the admin/owner role, once each.
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

async function main() {
  const admin = new Client({ connectionString: env.DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    // Ensure the restricted app role exists with the configured password.
    // ponytail: password is interpolated (CREATE ROLE can't be parameterized),
    // but it comes from our own trusted env, and single quotes are escaped.
    const pw = env.APP_DB_PASSWORD.replace(/'/g, "''");
    await admin.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'helm_app') THEN
          CREATE ROLE helm_app LOGIN PASSWORD '${pw}';
        END IF;
      END $$;
    `);
    await admin.query(`ALTER ROLE helm_app WITH LOGIN PASSWORD '${pw}'`);
    await admin.query(`DO $$ BEGIN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO helm_app', current_database());
    END $$;`);

    await admin.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set(
      (await admin.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
    );

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file}`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`apply ${file}`);
      await admin.query("BEGIN");
      try {
        await admin.query(sql);
        await admin.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await admin.query("COMMIT");
      } catch (e) {
        await admin.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${(e as Error).message}`);
      }
    }
    console.log("migrations up to date");
  } finally {
    await admin.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
