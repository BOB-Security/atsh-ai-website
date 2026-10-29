BEGIN;

-- Idempotency ledger for public inquiry submissions. This is additive and does not alter existing customer or lead rows.
CREATE TABLE IF NOT EXISTS public_request_idempotency (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 20 AND 120),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, request_key),
  UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_public_request_idempotency_created_at
  ON public_request_idempotency(created_at);

INSERT INTO schema_migrations(filename)
VALUES ('20261029_002_public_request_idempotency.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
