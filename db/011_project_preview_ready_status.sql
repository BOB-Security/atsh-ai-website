ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('discovery','scoped','approved','in_progress','blocked','review','preview_ready','changes_requested','client_approved','deploying','delivered','cancelled'));
