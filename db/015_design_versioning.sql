CREATE TABLE IF NOT EXISTS design_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 version_number integer NOT NULL CHECK(version_number>0),
 scope text NOT NULL DEFAULT 'public' CHECK(scope IN ('public','portal','admin','all')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','rolled_back','archived')),
 settings jsonb NOT NULL,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 published_by uuid REFERENCES users(id) ON DELETE SET NULL,
 published_at timestamptz,
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_design_versions_history ON design_versions(organization_id,created_at DESC);
