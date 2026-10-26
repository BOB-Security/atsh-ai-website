CREATE OR REPLACE FUNCTION atsh_ai_support_ticket_sla() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := now() + CASE NEW.priority
      WHEN 'urgent' THEN interval '4 hours'
      WHEN 'high' THEN interval '8 hours'
      WHEN 'normal' THEN interval '24 hours'
      ELSE interval '72 hours'
    END;
  END IF;
  IF NEW.status IN ('resolved','closed') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  ELSIF TG_OP = 'UPDATE' AND OLD.status IN ('resolved','closed') AND NEW.status NOT IN ('resolved','closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_support_ticket_sla ON support_tickets;
CREATE TRIGGER trg_support_ticket_sla
BEFORE INSERT OR UPDATE OF priority,status,sla_due_at ON support_tickets
FOR EACH ROW EXECUTE FUNCTION atsh_ai_support_ticket_sla();
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_open
ON support_tickets(organization_id,sla_due_at)
WHERE status NOT IN ('resolved','closed');
