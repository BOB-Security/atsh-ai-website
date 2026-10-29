-- Enforce that a project change request belongs to the same organization and customer as its project.
-- Fail migration rather than silently repairing potentially inconsistent existing records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM project_change_requests cr
    JOIN projects p ON p.id = cr.project_id
    WHERE cr.organization_id <> p.organization_id
       OR cr.customer_id <> p.customer_id
  ) THEN
    RAISE EXCEPTION 'Cannot add project change request ownership constraints: inconsistent organization/customer links exist';
  END IF;
END $$;

ALTER TABLE projects
  ADD CONSTRAINT projects_id_org_customer_unique
  UNIQUE (id, organization_id, customer_id);

ALTER TABLE project_change_requests
  ADD CONSTRAINT project_change_requests_project_owner_fk
  FOREIGN KEY (project_id, organization_id, customer_id)
  REFERENCES projects (id, organization_id, customer_id)
  ON UPDATE RESTRICT ON DELETE CASCADE;
