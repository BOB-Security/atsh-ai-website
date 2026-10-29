-- Persistent, organization-scoped website content and visual identity settings.
-- Apply through the approved database migration process before enabling the admin editor.
CREATE TABLE IF NOT EXISTS site_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
