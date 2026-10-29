BEGIN;

-- Additive-only MFA tables. Existing users, roles, sessions and customer records are preserved.
CREATE TABLE IF NOT EXISTS user_mfa_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_mfa_recovery_codes_user_hash_key UNIQUE (user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_recovery_unused
  ON user_mfa_recovery_codes(user_id)
  WHERE used_at IS NULL;

INSERT INTO schema_migrations(filename)
VALUES ('20261029_001_mfa.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
