CREATE TABLE IF NOT EXISTS customer_portal_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 email text NOT NULL,
 password_hash text,
 status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
 invitation_token_hash text,
 invitation_expires_at timestamptz,
 activated_at timestamptz,
 last_login_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,customer_id),
 UNIQUE(organization_id,email)
);
CREATE TABLE IF NOT EXISTS customer_portal_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES customer_portal_accounts(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_expiry ON customer_portal_sessions(expires_at);
CREATE TABLE IF NOT EXISTS customer_project_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 visibility text NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer','internal')),
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_project_updates_project ON customer_project_updates(project_id,created_at DESC);
