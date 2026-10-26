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
