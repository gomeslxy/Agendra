-- ============================================================
-- Migration 009: Billing Consistency
-- 
-- 1. Garante constraint CHECK na coluna plan_type
-- 2. Garante constraint CHECK na coluna subscription_status
-- 3. Adiciona índice para lookup de billing (getCompanyUsage)
-- 4. Remove coluna legada 'plan' se existir (era do schema.sql original)
-- ============================================================

-- 1. Adicionar CHECK em plan_type (com limpeza de dados prévia)
DO $$
BEGIN
  -- Primeiro, garante que não existam valores nulos ou inválidos que quebrem a constraint
  UPDATE public.companies 
  SET plan_type = 'trial' 
  WHERE plan_type IS NULL OR plan_type NOT IN ('trial', 'starter', 'pro', 'business');

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_plan_type_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_plan_type_check
      CHECK (plan_type IN ('trial', 'starter', 'pro', 'business'));
  END IF;
END $$;

-- 2. Adicionar CHECK em subscription_status (com limpeza de dados prévia)
DO $$
BEGIN
  -- Sanitização: se for nulo ou inválido, vira 'trial'
  UPDATE public.companies
  SET subscription_status = 'trial'
  WHERE subscription_status IS NULL OR subscription_status NOT IN ('trial', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired');

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_subscription_status_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_status_check
      CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired'));
  END IF;
END $$;

-- 3. Garantir colunas de ciclo do Stripe (necessárias para reset de leads)
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- 4. Índice para getCompanyUsage (lookup por id + campos de billing)
CREATE INDEX IF NOT EXISTS companies_billing_idx
  ON public.companies(id, plan_type, subscription_status, current_period_start, current_period_end);

-- 4. Remover coluna legada 'plan' se ainda existir
--    (era do schema.sql original, substituída por plan_type em 008)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'companies'
      AND column_name  = 'plan'
  ) THEN
    ALTER TABLE public.companies DROP COLUMN plan;
  END IF;
END $$;
