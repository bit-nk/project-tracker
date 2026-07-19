-- Core domain: clients, contacts, SoWs (= projects when Approved), log entries.

CREATE TABLE client (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  industry   text CHECK (industry IS NULL OR char_length(industry) <= 120),
  notes      text CHECK (notes IS NULL OR char_length(notes) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Enables composite (id, org_id) FKs from children so a child can never
  -- reference a client in another tenant.
  UNIQUE (id, org_id)
);
CREATE INDEX client_org_name_ix ON client (org_id, lower(name));

CREATE TABLE client_contact (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  contact    text CHECK (contact IS NULL OR char_length(contact) <= 320),
  role       text CHECK (role IS NULL OR char_length(role) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, org_id) REFERENCES client (id, org_id) ON DELETE CASCADE
);
CREATE INDEX client_contact_ix ON client_contact (org_id, client_id, created_at);

CREATE TABLE sow (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  status        text NOT NULL CHECK (status IN ('Draft','Sent','Approved','Rejected')),
  doc_link      text CHECK (doc_link IS NULL OR doc_link ~ '^https?://'),
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 10000),
  -- Project fields — present exactly when status = 'Approved'.
  work_status   text CHECK (work_status IS NULL OR work_status IN ('Active','On Hold','Completed')),
  description   text CHECK (description IS NULL OR char_length(description) <= 10000),
  repo_url      text CHECK (repo_url IS NULL OR repo_url ~ '^https?://'),
  staging_url   text CHECK (staging_url IS NULL OR staging_url ~ '^https?://'),
  links         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(links) = 'array'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  decided_at    timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  UNIQUE (id, org_id),
  FOREIGN KEY (client_id, org_id) REFERENCES client (id, org_id) ON DELETE CASCADE,
  -- State machine: a project IS an approved SoW.
  CONSTRAINT sow_project_fields_ck CHECK ((status = 'Approved') = (work_status IS NOT NULL)),
  CONSTRAINT sow_started_ck        CHECK (status <> 'Approved' OR started_at IS NOT NULL),
  CONSTRAINT sow_completed_ck      CHECK (completed_at IS NULL OR work_status = 'Completed'),
  CONSTRAINT sow_sent_ck           CHECK (status = 'Draft' OR sent_at IS NOT NULL),
  CONSTRAINT sow_decided_ck        CHECK ((status IN ('Approved','Rejected')) = (decided_at IS NOT NULL))
);
CREATE INDEX sow_org_updated_ix ON sow (org_id, updated_at DESC, id);
CREATE INDEX sow_org_created_ix ON sow (org_id, created_at DESC, id);
CREATE INDEX sow_org_title_ix   ON sow (org_id, lower(title));
CREATE INDEX sow_org_client_ix  ON sow (org_id, client_id, updated_at DESC);
CREATE INDEX sow_org_status_ix  ON sow (org_id, status);
CREATE INDEX sow_org_project_ix ON sow (org_id, work_status, updated_at DESC, id) WHERE status = 'Approved';

CREATE TABLE project_log_entry (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  sow_id     uuid NOT NULL,
  type       text NOT NULL CHECK (type IN ('Working On','Pending','Reminder','Backlog','Meeting Note','Note')),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  pinned     boolean NOT NULL DEFAULT false,
  resolved   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sow_id, org_id) REFERENCES sow (id, org_id) ON DELETE CASCADE,
  CONSTRAINT log_resolved_reminder_ck CHECK (resolved = false OR type = 'Reminder')
);
CREATE INDEX log_sow_time_ix   ON project_log_entry (org_id, sow_id, created_at DESC, id);
CREATE INDEX log_reminders_ix  ON project_log_entry (org_id, created_at DESC, id) WHERE type = 'Reminder' AND resolved = false;
CREATE INDEX log_focus_ix      ON project_log_entry (org_id, created_at DESC, id) WHERE pinned = true AND type <> 'Reminder';
CREATE INDEX log_body_trgm_ix  ON project_log_entry USING gin (body gin_trgm_ops);
