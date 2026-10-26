ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
CREATE TABLE IF NOT EXISTS support_ticket_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 sender_type text NOT NULL CHECK (sender_type IN ('customer','staff','system')),
 sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 body text NOT NULL,
 attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_thread ON support_ticket_messages(ticket_id,created_at);
