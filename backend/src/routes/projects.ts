import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";

const uuid = z.string().uuid();
const WORK = ["Active", "On Hold", "Completed"] as const;
const httpUrl = z.string().trim().regex(/^https?:\/\//, "must start with http:// or https://").max(2000);
const projectLink = z.object({ label: z.string().trim().min(1).max(120), url: httpUrl });

const projectPatch = z.object({
  workStatus: z.enum(WORK).optional(),
  description: z.string().max(10000).nullable().optional(),
  repoUrl: httpUrl.nullable().optional(),
  stagingUrl: httpUrl.nullable().optional(),
  links: z.array(projectLink).max(50).optional(),
});

export function registerProjectRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  // Projects are the Approved SoWs.
  app.get("/projects", auth, async (req) => {
    const q = req.query as { workStatus?: string };
    const workStatus = WORK.includes(q.workStatus as (typeof WORK)[number]) ? q.workStatus : null;
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `SELECT s.*, cl.name AS client_name
         FROM sow s JOIN client cl ON cl.id = s.client_id
         WHERE s.status = 'Approved'
           AND ($1::text IS NULL OR s.work_status = $1)
         ORDER BY s.updated_at DESC, s.id`,
        [workStatus]
      );
      return r.rows;
    });
  });

  app.patch("/projects/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = projectPatch.parse(req.body);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const cur = await c.query<{ status: string; work_status: string; completed_at: Date | null }>(
        "SELECT status, work_status, completed_at FROM sow WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (cur.rows.length === 0) throw new HttpError(404, "not_found");
      if (cur.rows[0].status !== "Approved") throw new HttpError(409, "not_a_project");

      const workStatus = body.workStatus ?? cur.rows[0].work_status;
      const completedAt =
        workStatus === "Completed" ? cur.rows[0].completed_at ?? new Date() : null;

      const r = await c.query(
        `UPDATE sow SET
           work_status = $2,
           completed_at = $3,
           description = CASE WHEN $4::boolean THEN $5 ELSE description END,
           repo_url = CASE WHEN $6::boolean THEN $7 ELSE repo_url END,
           staging_url = CASE WHEN $8::boolean THEN $9 ELSE staging_url END,
           links = CASE WHEN $10::boolean THEN $11::jsonb ELSE links END,
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [
          id,
          workStatus,
          completedAt,
          body.description !== undefined, body.description ?? null,
          body.repoUrl !== undefined, body.repoUrl ?? null,
          body.stagingUrl !== undefined, body.stagingUrl ?? null,
          body.links !== undefined, JSON.stringify(body.links ?? []),
        ]
      );
      await audit(c, req.auth, "project.update", "project", id, { workStatus });
      return r.rows[0];
    });
  });
}
