ALTER TABLE user_mfa
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_mfa_pending_expiry
  ON user_mfa(pending_expires_at)
  WHERE enabled = false AND pending_expires_at IS NOT NULL;
