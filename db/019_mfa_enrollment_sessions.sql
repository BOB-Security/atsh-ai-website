ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS mfa_enrollment_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_mfa_enrollment_only
  ON auth_sessions(user_id, expires_at)
  WHERE mfa_enrollment_only = true;
