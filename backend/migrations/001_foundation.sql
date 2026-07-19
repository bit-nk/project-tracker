-- Foundational: identity, tenancy, auth, infra. RLS + grants applied in 003.
-- Run as the admin/owner role. Tables are owned by that role; the app connects
-- as the non-superuser role `helm_app`, so RLS (003) is enforced against it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- log body search

CREATE TABLE org (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash      text NOT NULL,
  email_verified_at  timestamptz,
  failed_login_count int  NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until       timestamptz,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive unique login.
CREATE UNIQUE INDEX app_user_email_ci_uk ON app_user (lower(email));

CREATE TABLE membership (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','admin','member')),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
-- Exactly one owner per org.
CREATE UNIQUE INDEX membership_one_owner_uk ON membership (org_id) WHERE role = 'owner';
CREATE INDEX membership_user_ix ON membership (user_id);

CREATE TABLE session (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  refresh_token_hash  text NOT NULL UNIQUE,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz,
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz,
  rotated_to          uuid REFERENCES session(id) ON DELETE SET NULL,
  ip                  inet,
  user_agent          text,
  CHECK (absolute_expires_at > issued_at)
);
-- One forward link in a rotation chain.
CREATE UNIQUE INDEX session_rotated_to_uk ON session (rotated_to) WHERE rotated_to IS NOT NULL;
CREATE INDEX session_user_active_ix ON session (user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_token (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_type text NOT NULL CHECK (token_type IN ('email_verification','password_reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_token_user_ix ON auth_token (user_id, token_type) WHERE consumed_at IS NULL;

CREATE TABLE idempotency_key (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  idempotency_key     text NOT NULL,
  request_fingerprint text NOT NULL,
  response_status     int,
  response_body       jsonb CHECK (response_body IS NULL OR jsonb_typeof(response_body) = 'object'),
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  UNIQUE (org_id, user_id, idempotency_key)
);

CREATE TABLE audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  action         text NOT NULL CHECK (char_length(action) <= 100),
  entity_type    text NOT NULL CHECK (entity_type IN ('client','client_contact','sow','project','project_log_entry','membership')),
  entity_id      uuid,
  correlation_id uuid,
  metadata       jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_time_ix ON audit_log (org_id, created_at DESC, id);
