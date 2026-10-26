CREATE TABLE IF NOT EXISTS project_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 reference text NOT NULL UNIQUE,
 title text NOT NULL,
 description text NOT NULL,
 requested_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','quoted','approved','rejected','implemented','cancelled')),
 setup_delta_minor bigint CHECK(setup_delta_minor IS NULL OR setup_delta_minor>=0),
 monthly_delta_minor bigint CHECK(monthly_delta_minor IS NULL OR monthly_delta_minor>=0),
 annual_delta_minor bigint CHECK(annual_delta_minor IS NULL OR annual_delta_minor>=0),
 currency char(3) NOT NULL DEFAULT 'EGP',
 estimate_notes text NOT NULL DEFAULT '',
 customer_decision_at timestamptz,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_change_requests_queue ON project_change_requests(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_change_requests_customer ON project_change_requests(customer_id,created_at DESC);
