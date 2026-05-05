ALTER TABLE "instance_settings" ADD COLUMN IF NOT EXISTS "model_pool" jsonb DEFAULT '{}'::jsonb NOT NULL;
