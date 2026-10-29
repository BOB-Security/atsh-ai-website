-- Enforce organization/customer ownership for projects and hosting inventory.
-- Fail closed if existing records are inconsistent; never silently rewrite ownership.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM projects p
    JOIN customers c ON c.id = p.customer_id
    WHERE p.organization_id <> c.organization_id
  ) THEN
    RAISE EXCEPTION 'Cannot add project customer ownership constraints: cross-organization project customers exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM hosting_assets h
    JOIN customers c ON c.id = h.customer_id
    WHERE h.organization_id <> c.organization_id
  ) THEN
    RAISE EXCEPTION 'Cannot add hosting asset ownership constraints: cross-organization customers exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM hosting_assets h
    JOIN projects p ON p.id = h.project_id
    WHERE h.organization_id <> p.organization_id
       OR h.customer_id <> p.customer_id
  ) THEN
    RAISE EXCEPTION 'Cannot add hosting asset ownership constraints: project/customer ownership mismatch exists';
  END IF;
END $$;

ALTER TABLE customers
  ADD CONSTRAINT customers_id_org_unique UNIQUE (id, organization_id);

ALTER TABLE projects
  ADD CONSTRAINT projects_customer_org_fk
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES customers (id, organization_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE hosting_assets
  ADD CONSTRAINT hosting_assets_customer_org_fk
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES customers (id, organization_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE hosting_assets
  ADD CONSTRAINT hosting_assets_project_owner_fk
  FOREIGN KEY (project_id, organization_id, customer_id)
  REFERENCES projects (id, organization_id, customer_id)
  ON UPDATE RESTRICT ON DELETE SET NULL (project_id);
