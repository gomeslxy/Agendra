-- Migration to add Stripe columns to companies table
ALTER TABLE "public"."companies" 
ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT,
ADD COLUMN IF NOT EXISTS "subscription_status" TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS "plan_type" TEXT DEFAULT 'trial';

-- Update existing records to have a plan_type if they have the old 'plan' column
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='plan') THEN
        UPDATE "public"."companies" SET "plan_type" = "plan" WHERE "plan_type" = 'trial';
    END IF;
END $$;
