-- Agendra Migration: 012_ai_scheduling_services
-- Adds public.services table and extends public.events

-- 1. Create Services Table
CREATE TABLE IF NOT EXISTS public.services (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  duration      INT NOT NULL, -- Minutos
  price         DECIMAL(10, 2),
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Extend Events Table
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed' 
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rescheduled')),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Row Level Security
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- services: company members can select
DROP POLICY IF EXISTS "services: select own company" ON public.services;
CREATE POLICY "services: select own company"
  ON public.services FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- services: company members can insert
DROP POLICY IF EXISTS "services: insert own company" ON public.services;
CREATE POLICY "services: insert own company"
  ON public.services FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- services: company members can update
DROP POLICY IF EXISTS "services: update own company" ON public.services;
CREATE POLICY "services: update own company"
  ON public.services FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- 4. Triggers
DROP TRIGGER IF EXISTS services_updated_at ON public.services;
CREATE TRIGGER services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Indexes
CREATE INDEX IF NOT EXISTS services_company_id_idx ON public.services(company_id);
CREATE INDEX IF NOT EXISTS events_service_id_idx ON public.events(service_id);

-- 6. Grants
GRANT SELECT, INSERT, UPDATE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
