ALTER TABLE project_approvals ADD COLUMN IF NOT EXISTS approval_token_hash text UNIQUE;
ALTER TABLE project_approvals ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_project_approvals_token_expiry ON project_approvals(token_expires_at) WHERE approval_token_hash IS NOT NULL;
