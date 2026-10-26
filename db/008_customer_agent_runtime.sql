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
