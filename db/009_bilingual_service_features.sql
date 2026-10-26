ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS features_en jsonb NOT NULL DEFAULT '[]'::jsonb;
