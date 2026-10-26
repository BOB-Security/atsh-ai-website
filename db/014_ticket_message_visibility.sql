ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('customer','internal'));
UPDATE support_ticket_messages SET visibility='customer' WHERE sender_type IN ('customer','system');
