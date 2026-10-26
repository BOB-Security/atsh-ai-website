ALTER TABLE quotes ADD COLUMN IF NOT EXISTS response_token_hash text UNIQUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS response_token_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_quotes_response_token ON quotes(response_token_expires_at) WHERE response_token_hash IS NOT NULL;
