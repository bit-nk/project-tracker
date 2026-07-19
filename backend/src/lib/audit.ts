import type { PoolClient } from "pg";
import type { AuthContext } from "../types.js";

type EntityType =
  | "client"
  | "client_contact"
  | "sow"
  | "project"
  | "project_log_entry"
  | "membership";

/**
 * Append an audit row. Must be called within a withTenant transaction (`c`) so
 * the org context satisfies the audit_log RLS WITH CHECK policy.
 */
export async function audit(
  c: PoolClient,
  auth: AuthContext,
  action: string,
  entityType: EntityType,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await c.query(
    `INSERT INTO audit_log (org_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [auth.orgId, auth.userId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}
