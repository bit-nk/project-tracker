import type { FastifyInstance } from "fastify";
import { withTenant } from "../db.js";

export function registerDashboardRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/dashboard", auth, async (req) => {
    return withTenant(req.auth.orgId, req.auth.userId, async (c) => {
      const [sowCounts, projectCounts, reminders, focus] = await Promise.all([
        c.query("SELECT status, count(*)::int AS n FROM sow GROUP BY status"),
        c.query(
          "SELECT work_status, count(*)::int AS n FROM sow WHERE status = 'Approved' GROUP BY work_status"
        ),
        c.query(
          `SELECT l.*, s.title AS sow_title
           FROM project_log_entry l JOIN sow s ON s.id = l.sow_id
           WHERE l.type = 'Reminder' AND l.resolved = false
           ORDER BY l.created_at DESC, l.id`
        ),
        c.query(
          `SELECT l.*, s.title AS sow_title
           FROM project_log_entry l JOIN sow s ON s.id = l.sow_id
           WHERE l.pinned = true AND l.type <> 'Reminder'
           ORDER BY l.created_at DESC, l.id`
        ),
      ]);

      const byStatus = Object.fromEntries(sowCounts.rows.map((r) => [r.status, r.n]));
      const byWorkStatus = Object.fromEntries(projectCounts.rows.map((r) => [r.work_status, r.n]));
      return {
        sowCounts: byStatus,
        projectCounts: byWorkStatus,
        reminders: reminders.rows,
        focus: focus.rows,
      };
    });
  });
}
