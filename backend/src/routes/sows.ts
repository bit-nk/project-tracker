import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { STATUS, WORK, transition, type SowState } from "../lib/sow-state.js";
import { likeEscape } from "../lib/sql.js";

const uuid = z.string().uuid();
const httpUrl = z.string().trim().regex(/^https?:\/\//, "must start with http:// or https://").max(2000);

const sowCreate = z.object({
  clientId: uuid,
  title: z.string().trim().min(1).max(300),
  status: z.enum(["Draft", "Sent"]).default("Draft"),
  docLink: httpUrl.optional(),
});
const sowPatch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  docLink: httpUrl.nullable().optional(),
});
const statusBody = z.object({
  status: z.enum(STATUS),
  decisionNote: z.string().max(10000).optional(),
  workStatus: z.enum(WORK).optional(),
});

export function registerSowRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/sows", auth, async (req) => {
    const q = req.query as { search?: string; status?: string };
    const search = likeEscape(q.search?.trim() ?? "");
    const status = STATUS.includes(q.status as (typeof STATUS)[number]) ? q.status : null;
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `SELECT s.*, cl.name AS client_name
         FROM sow s JOIN client cl ON cl.id = s.client_id
         WHERE ($1 = '' OR s.title ILIKE '%' || $1 || '%')
           AND ($2::text IS NULL OR s.status = $2)
         ORDER BY s.updated_at DESC, s.id`,
        [search, status]
      );
      return r.rows;
    });
  });

  app.post("/sows", auth, async (req, reply) => {
    const body = sowCreate.parse(req.body);
    const row = await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `INSERT INTO sow (org_id, client_id, title, status, doc_link, sent_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'Sent' THEN now() ELSE NULL END)
         RETURNING *`,
        [req.auth.orgId, body.clientId, body.title, body.status, body.docLink ?? null]
      );
      await audit(c, req.auth, "sow.create", "sow", r.rows[0].id, { status: body.status });
      return r.rows[0];
    });
    return reply.status(201).send(row);
  });

  app.get("/sows/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `SELECT s.*, cl.name AS client_name
         FROM sow s JOIN client cl ON cl.id = s.client_id WHERE s.id = $1`,
        [id]
      );
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      return r.rows[0];
    });
  });

  app.patch("/sows/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = sowPatch.parse(req.body);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `UPDATE sow SET
           title = COALESCE($2, title),
           doc_link = CASE WHEN $3::boolean THEN $4 ELSE doc_link END,
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, body.title ?? null, body.docLink !== undefined, body.docLink ?? null]
      );
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      await audit(c, req.auth, "sow.update", "sow", id);
      return r.rows[0];
    });
  });

  app.post("/sows/:id/status", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = statusBody.parse(req.body);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const cur = await c.query<SowState>("SELECT * FROM sow WHERE id = $1 FOR UPDATE", [id]);
      if (cur.rows.length === 0) throw new HttpError(404, "not_found");
      const next = transition(cur.rows[0], body.status, body.decisionNote, body.workStatus);
      const r = await c.query(
        `UPDATE sow SET
           status = $2, sent_at = $3, decided_at = $4, started_at = $5,
           completed_at = $6, work_status = $7, decision_note = $8, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, next.status, next.sent_at, next.decided_at, next.started_at, next.completed_at, next.work_status, next.decision_note]
      );
      await audit(c, req.auth, "sow.status", "sow", id, { to: body.status });
      return r.rows[0];
    });
  });

  app.delete("/sows/:id", auth, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query("DELETE FROM sow WHERE id = $1 RETURNING id", [id]);
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      await audit(c, req.auth, "sow.delete", "sow", id);
    });
    return reply.status(204).send();
  });
}
