-- Migration 071: Fix signup check constraint violation by correcting plan_type default and updating the handle_new_user trigger
-- 1. Ensure the default value for plan_type on companies is 'trial' (remote database has it incorrectly set to 'free')
ALTER TABLE public.companies ALTER COLUMN plan_type SET DEFAULT 'trial';

-- 2. Update the handle_new_user trigger function to explicitly set plan_type = 'trial' and subscription_status = 'trial' during company auto-provisioning
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id  uuid;
  v_company_name text;
  v_full_name   text;
BEGIN
  -- Resolve company name from signup metadata, fallback to email domain
  v_company_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'company_name'), ''),
    split_part(new.email, '@', 2)
  );

  -- Resolve full name
  v_full_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Create the company (tenant) with explicit plan_type and subscription_status
  INSERT INTO public.companies (name, plan_type, subscription_status)
  VALUES (v_company_name, 'trial', 'trial')
  RETURNING id INTO v_company_id;

  -- Create the user profile
  INSERT INTO public.users (id, email, full_name, company_id)
  VALUES (new.id, new.email, v_full_name, v_company_id);

  -- Create membership as owner
  INSERT INTO public.memberships (user_id, company_id, role)
  VALUES (new.id, v_company_id, 'owner');

  RETURN new;
END;
$$;
