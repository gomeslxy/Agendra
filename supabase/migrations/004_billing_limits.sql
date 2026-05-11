-- Migration for Billing Usage Limits
ALTER TABLE "public"."companies"
ADD COLUMN IF NOT EXISTS "current_period_start" timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS "current_period_end" timestamptz DEFAULT (now() + interval '30 days');

-- Update any existing companies to have a valid period
UPDATE "public"."companies"
SET 
  "current_period_start" = created_at,
  "current_period_end" = created_at + interval '30 days'
WHERE "current_period_start" IS NULL;
