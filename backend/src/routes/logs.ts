import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";

const uuid = z.string().uuid();
const TYPES = ["Working On", "Pending", "Reminder", "Backlog", "Meeting Note", "Note"] as const;

const logCreate = z.object({
  type: z.enum(TYPES),
  body: z.string().trim().min(1).max(20000),
  pinned: z.boolean().optional(),
});
const logPatch = z.object({
  type: z.enum(TYPES).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  pinned: z.boolean().optional(),
  resolved: z.boolean().optional(),
});

export function registerLogRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/sows/:id/logs", auth, async (req) => {
    const sowId = uuid.parse((req.params as { id: string }).id);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        "SELECT * FROM project_log_entry WHERE sow_id = $1 ORDER BY created_at DESC, id",
        [sowId]
      );
      return r.rows;
    });
  });

  app.post("/sows/:id/logs", auth, async (req, reply) => {
    const sowId = uuid.parse((req.params as { id: string }).id);
    const body = logCreate.parse(req.body);
    const row = await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `INSERT INTO project_log_entry (org_id, sow_id, type, body, pinned)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.auth.orgId, sowId, body.type, body.body, body.pinned ?? false]
      );
      await audit(c, req.auth, "log.create", "project_log_entry", r.rows[0].id, { sowId, type: body.type });
      return r.rows[0];
    });
    return reply.status(201).send(row);
  });

  app.patch("/logs/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = logPatch.parse(req.body);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const cur = await c.query<{ type: string; resolved: boolean }>(
        "SELECT type, resolved FROM project_log_entry WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (cur.rows.length === 0) throw new HttpError(404, "not_found");
      const effectiveType = body.type ?? cur.rows[0].type;
      const effectiveResolved = body.resolved ?? cur.rows[0].resolved;
      if (effectiveResolved && effectiveType !== "Reminder") {
        throw new HttpError(400, "only_reminders_can_be_resolved");
      }
      const r = await c.query(
        `UPDATE project_log_entry SET
           type = COALESCE($2, type),
           body = COALESCE($3, body),
           pinned = COALESCE($4, pinned),
           resolved = COALESCE($5, resolved),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, body.type ?? null, body.body ?? null, body.pinned ?? null, body.resolved ?? null]
      );
      await audit(c, req.auth, "log.update", "project_log_entry", id);
      return r.rows[0];
    });
  });

  app.delete("/logs/:id", auth, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query("DELETE FROM project_log_entry WHERE id = $1 RETURNING id", [id]);
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      await audit(c, req.auth, "log.delete", "project_log_entry", id);
    });
    return reply.status(204).send();
  });
}
