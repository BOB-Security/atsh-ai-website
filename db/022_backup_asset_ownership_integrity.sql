-- Prevent backup records from referencing a hosting asset owned by another organization.
-- Stop rather than silently modifying inconsistent existing records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM backup_runs b
    JOIN hosting_assets h ON h.id = b.hosting_asset_id
    WHERE b.organization_id <> h.organization_id
  ) THEN
    RAISE EXCEPTION 'Cannot add backup ownership constraint: cross-organization backup asset links exist';
  END IF;
END $$;

ALTER TABLE hosting_assets
  ADD CONSTRAINT hosting_assets_id_org_unique UNIQUE (id, organization_id);

ALTER TABLE backup_runs
  ADD CONSTRAINT backup_runs_hosting_asset_org_fk
  FOREIGN KEY (hosting_asset_id, organization_id)
  REFERENCES hosting_assets (id, organization_id)
  ON UPDATE RESTRICT ON DELETE NO ACTION;
