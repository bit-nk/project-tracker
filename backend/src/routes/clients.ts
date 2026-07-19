import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { HttpError } from "../lib/http.js";
import { audit } from "../lib/audit.js";

const uuid = z.string().uuid();
const clientCreate = z.object({
  name: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(120).optional(),
  notes: z.string().max(10000).optional(),
});
const clientPatch = clientCreate.partial();
const contactCreate = z.object({
  name: z.string().trim().min(1).max(200),
  contact: z.string().trim().max(320).optional(),
  role: z.string().trim().max(120).optional(),
});
const contactPatch = contactCreate.partial();

export function registerClientRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/clients", auth, async (req) => {
    const search = (req.query as { search?: string }).search?.trim() ?? "";
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `SELECT c.*, count(cc.id)::int AS contact_count
         FROM client c LEFT JOIN client_contact cc ON cc.client_id = c.id
         WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%')
         GROUP BY c.id
         ORDER BY lower(c.name)`,
        [search]
      );
      return r.rows;
    });
  });

  app.post("/clients", auth, async (req, reply) => {
    const body = clientCreate.parse(req.body);
    const row = await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `INSERT INTO client (org_id, name, industry, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.auth.orgId, body.name, body.industry ?? null, body.notes ?? null]
      );
      await audit(c, req.auth, "client.create", "client", r.rows[0].id);
      return r.rows[0];
    });
    return reply.status(201).send(row);
  });

  app.get("/clients/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const client = await c.query("SELECT * FROM client WHERE id = $1", [id]);
      if (client.rows.length === 0) throw new HttpError(404, "not_found");
      const contacts = await c.query(
        "SELECT * FROM client_contact WHERE client_id = $1 ORDER BY created_at",
        [id]
      );
      return { ...client.rows[0], contacts: contacts.rows };
    });
  });

  app.patch("/clients/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = clientPatch.parse(req.body);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `UPDATE client SET
           name = COALESCE($2, name),
           industry = COALESCE($3, industry),
           notes = COALESCE($4, notes),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, body.name ?? null, body.industry ?? null, body.notes ?? null]
      );
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      await audit(c, req.auth, "client.update", "client", id);
      return r.rows[0];
    });
  });

  // Contacts (sub-resource of a client).
  app.post("/clients/:id/contacts", auth, async (req, reply) => {
    const clientId = uuid.parse((req.params as { id: string }).id);
    const body = contactCreate.parse(req.body);
    const row = await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `INSERT INTO client_contact (org_id, client_id, name, contact, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.auth.orgId, clientId, body.name, body.contact ?? null, body.role ?? null]
      );
      await audit(c, req.auth, "client_contact.create", "client_contact", r.rows[0].id, { clientId });
      return r.rows[0];
    });
    return reply.status(201).send(row);
  });

  app.patch("/contacts/:id", auth, async (req) => {
    const id = uuid.parse((req.params as { id: string }).id);
    const body = contactPatch.parse(req.body);
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query(
        `UPDATE client_contact SET
           name = COALESCE($2, name),
           contact = COALESCE($3, contact),
           role = COALESCE($4, role),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, body.name ?? null, body.contact ?? null, body.role ?? null]
      );
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      await audit(c, req.auth, "client_contact.update", "client_contact", id);
      return r.rows[0];
    });
  });

  app.delete("/contacts/:id", auth, async (req, reply) => {
    const id = uuid.parse((req.params as { id: string }).id);
    await withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const r = await c.query("DELETE FROM client_contact WHERE id = $1 RETURNING id", [id]);
      if (r.rows.length === 0) throw new HttpError(404, "not_found");
      await audit(c, req.auth, "client_contact.delete", "client_contact", id);
    });
    return reply.status(204).send();
  });
}
