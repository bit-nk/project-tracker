-- Row-Level Security + grants for the application role `helm_app`.
-- The migration runner (src/migrate.ts) ensures the role exists before this runs.
--
-- Tenant isolation model:
--   * Org-scoped tables get RLS keyed on app.current_org_id, set per request.
--   * FORCE ROW LEVEL SECURITY so even the table owner obeys the policy.
--   * helm_app is a non-superuser, so it cannot bypass RLS.
--   * membership also allows a user to see their own rows (needed at login,
--     before an org context exists) via app.current_user_id.
--
-- ponytail: auth tables (org, app_user, session, auth_token) are NOT under RLS.
-- Ceiling: they rely on application-layer access control (only the auth routes
-- touch them). This is deliberate for a single-tenant-per-user deployment —
-- login must look up users/sessions before any tenant context exists. Upgrade
-- path if the app grows: move those lookups into SECURITY DEFINER functions and
-- enable per-user RLS on these tables.

GRANT USAGE ON SCHEMA public TO helm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO helm_app;
-- audit_log is append-only.
REVOKE UPDATE, DELETE ON audit_log FROM helm_app;

-- Helper: standard org-scoped policy.
--   USING      -> which existing rows are visible
--   WITH CHECK -> which new/updated rows are allowed
-- NULLIF(..., '') is load-bearing: a custom GUC reverts to '' (not NULL) after a
-- local set_config, so a reused pooled connection can present '' here. Casting
-- ''::uuid raises 22P02; NULLIF turns it into NULL (matches no row) instead.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client','client_contact','sow','project_log_entry','idempotency_key','audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY %1$s_org ON %1$I
      USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
    $f$, t);
  END LOOP;
END $$;

-- membership: visible by current org OR by the owning user (login bootstrap).
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_access ON membership
  USING (
    org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
