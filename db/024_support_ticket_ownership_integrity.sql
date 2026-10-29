-- Enforce tenant/customer ownership for support tickets and their optional projects.
-- Existing inconsistent rows stop the migration; no silent ownership repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM support_tickets t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE (t.customer_id IS NOT NULL AND (c.id IS NULL OR c.organization_id <> t.organization_id))
       OR (t.project_id IS NOT NULL AND (
          p.id IS NULL
          OR p.organization_id <> t.organization_id
          OR t.customer_id IS NULL
          OR p.customer_id <> t.customer_id
       ))
  ) THEN
    RAISE EXCEPTION 'Cannot add support ticket ownership constraints: cross-organization or customer/project mismatch exists';
  END IF;
END $$;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_ticket_project_requires_customer
  CHECK (project_id IS NULL OR customer_id IS NOT NULL);

ALTER TABLE support_tickets
  ADD CONSTRAINT support_ticket_customer_org_fk
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES customers (id, organization_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_ticket_project_owner_fk
  FOREIGN KEY (project_id, organization_id, customer_id)
  REFERENCES projects (id, organization_id, customer_id)
  ON UPDATE RESTRICT ON DELETE SET NULL (project_id);
