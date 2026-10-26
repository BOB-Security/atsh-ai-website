-- ATSH AI unified operations schema. PostgreSQL 15+
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  email text NOT NULL,
  full_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  locale text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  legal_name text,
  email text,
  phone text,
  preferred_locale text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar','en')),
  status text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','active','inactive','blocked')),
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  setup_amount_minor bigint NOT NULL DEFAULT 0 CHECK (setup_amount_minor >= 0),
  monthly_amount_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_amount_minor >= 0),
  annual_amount_minor bigint NOT NULL DEFAULT 0 CHECK (annual_amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EGP',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS service_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  setup_amount_minor bigint NOT NULL DEFAULT 0 CHECK (setup_amount_minor >= 0),
  monthly_amount_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_amount_minor >= 0),
  annual_amount_minor bigint NOT NULL DEFAULT 0 CHECK (annual_amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EGP',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','qualified','scoped','quoted','won','lost','spam')),
  source text NOT NULL DEFAULT 'website',
  project_goal text,
  solution_type text,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  name text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'discovery' CHECK (status IN ('discovery','scoped','approved','in_progress','blocked','review','changes_requested','client_approved','deploying','delivered','cancelled')),
  preview_url text,
  target_date date,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  client_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','blocked','review','approved','done')),
  sort_order integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','blocked','review','done')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','accepted','rejected','expired','cancelled')),
  currency char(3) NOT NULL DEFAULT 'EGP',
  snapshot jsonb NOT NULL,
  setup_total_minor bigint NOT NULL DEFAULT 0 CHECK (setup_total_minor >= 0),
  monthly_total_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_total_minor >= 0),
  annual_total_minor bigint NOT NULL DEFAULT 0 CHECK (annual_total_minor >= 0),
  valid_until date,
  issued_at timestamptz,
  accepted_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('plan','addon','custom')),
  catalog_item_id uuid,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  setup_amount_minor bigint NOT NULL DEFAULT 0 CHECK (setup_amount_minor >= 0),
  monthly_amount_minor bigint NOT NULL DEFAULT 0 CHECK (monthly_amount_minor >= 0),
  annual_amount_minor bigint NOT NULL DEFAULT 0 CHECK (annual_amount_minor >= 0),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','paused','cancelled','expired')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly','annual','custom')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EGP',
  starts_at date,
  renews_at date,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hosting_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('domain','hosting','ssl','dns','cloudflare','storage','database','other')),
  provider text NOT NULL,
  external_resource_ref text,
  domain_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','warning','expired','suspended','retired')),
  expires_at date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  hosting_asset_id uuid REFERENCES hosting_assets(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','restore_tested')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  retention_until date,
  artifact_ref text,
  restore_tested_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  provider text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','error','retired')),
  monthly_limit_minor bigint CHECK (monthly_limit_minor >= 0),
  usage_minor bigint NOT NULL DEFAULT 0 CHECK (usage_minor >= 0),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('text','file','url','faq','integration')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed','disabled')),
  content_ref text,
  checksum text,
  last_indexed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'website',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_human','resolved','closed')),
  escalated_to uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('visitor','customer','assistant','staff','system')),
  body text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  subject text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_org_status ON customers(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_status_created ON leads(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due ON tasks(organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_quotes_org_status_created ON quotes(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_status_renewal ON subscriptions(organization_id, status, renews_at);
CREATE INDEX IF NOT EXISTS idx_hosting_assets_org_expiry ON hosting_assets(organization_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_backup_runs_org_created ON backup_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_org_status ON conversations(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_org_status ON support_tickets(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at DESC);


-- Applied in migrations 002 through 008; included here for full-schema reference.

-- db/002_auth_and_content.sql
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS site_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title_ar text NOT NULL,
  title_en text NOT NULL DEFAULT '',
  body_ar jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_en jsonb NOT NULL DEFAULT '[]'::jsonb,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE TABLE IF NOT EXISTS project_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  approval_type text NOT NULL CHECK (approval_type IN ('scope','quote','preview','final_release')),
  status text NOT NULL CHECK (status IN ('requested','approved','rejected','withdrawn')),
  approver_name text NOT NULL,
  approver_email text NOT NULL,
  evidence_ref text,
  note text NOT NULL DEFAULT '',
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_approvals_project ON project_approvals(project_id, created_at DESC);


-- db/003_knowledge_and_integrations.sql
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  title_en text NOT NULL DEFAULT '',
  body_ar text NOT NULL,
  body_en text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  source_ref text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_status ON knowledge_articles(organization_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('unconfigured','configured','active','paused','error','revoked')),
  secret_ref text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrations_org_status ON integration_connections(organization_id,status);


-- db/004_team_invitations.sql
CREATE TABLE IF NOT EXISTS team_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 email text NOT NULL,
 full_name text NOT NULL,
 role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_invites_org_email ON team_invitations(organization_id,email);
CREATE INDEX IF NOT EXISTS idx_team_invites_expiry ON team_invitations(expires_at);


-- db/005_explicit_client_approvals.sql
ALTER TABLE project_approvals ADD COLUMN IF NOT EXISTS approval_token_hash text UNIQUE;
ALTER TABLE project_approvals ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_project_approvals_token_expiry ON project_approvals(token_expires_at) WHERE approval_token_hash IS NOT NULL;


-- db/006_quote_approval_tokens.sql
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS response_token_hash text UNIQUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS response_token_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_quotes_response_token ON quotes(response_token_expires_at) WHERE response_token_hash IS NOT NULL;


-- db/007_assistant_sessions.sql
CREATE TABLE IF NOT EXISTS assistant_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_expiry ON assistant_sessions(expires_at);


-- db/008_customer_agent_runtime.sql
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS monthly_token_limit bigint CHECK (monthly_token_limit >= 0);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS usage_tokens bigint NOT NULL DEFAULT 0 CHECK (usage_tokens >= 0);
CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
 title text NOT NULL,
 body text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
 source_ref text,
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_status ON agent_knowledge_documents(agent_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS ai_agent_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
 model text NOT NULL,
 prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
 completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
 total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
 cost_minor bigint CHECK (cost_minor >= 0),
 status text NOT NULL CHECK (status IN ('succeeded','failed','limited')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_usage_month ON ai_agent_usage_events(agent_id,created_at DESC);


-- db/009_bilingual_service_features.sql
ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS features_en jsonb NOT NULL DEFAULT '[]'::jsonb;

-- db/010_support_ticket_threads.sql
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
CREATE TABLE IF NOT EXISTS support_ticket_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 sender_type text NOT NULL CHECK (sender_type IN ('customer','staff','system')),
 sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 body text NOT NULL,
 attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_thread ON support_ticket_messages(ticket_id,created_at);
