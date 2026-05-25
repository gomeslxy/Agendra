-- 1. Expandir check constraint de channels.provider
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_provider_check;
ALTER TABLE public.channels ADD CONSTRAINT channels_provider_check 
  CHECK (provider IN ('whatsapp','instagram','telegram','messenger','webchat','email','discord'));

-- 2. Adicionar colunas multi-channel em channels
ALTER TABLE public.channels 
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ, -- Instagram long-lived tokens
  ADD COLUMN IF NOT EXISTS token_refreshed_at TIMESTAMPTZ;

-- 3. Expandir leads.channel para suportar todos os providers
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_channel_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_channel_check 
  CHECK (channel IN ('whatsapp','instagram','telegram','messenger','webchat','email','discord'));

-- 4. Adicionar channel_id em leads para vínculo direto
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_channel_id_idx ON public.leads(channel_id);

-- 5. Adicionar channel_id em messages para rastreabilidade
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL;

-- 6. Tabela de limites por canal (plan_channel_allowances)
CREATE TABLE IF NOT EXISTS public.plan_channel_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_provider TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb, -- configurações específicas por canal
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, channel_provider)
);

ALTER TABLE public.plan_channel_config ENABLE ROW LEVEL SECURITY;

-- Evitar erros de política duplicada com DROP POLICY IF EXISTS antes da criação
DROP POLICY IF EXISTS "plan_channel_config: select own company" ON public.plan_channel_config;
CREATE POLICY "plan_channel_config: select own company" ON public.plan_channel_config
  FOR SELECT USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "plan_channel_config: modify own company" ON public.plan_channel_config;
CREATE POLICY "plan_channel_config: modify own company" ON public.plan_channel_config
  FOR ALL USING (company_id IN (SELECT company_id FROM public.memberships WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_channel_config TO authenticated;
GRANT ALL ON public.plan_channel_config TO service_role;

-- 7. Índices de performance
CREATE INDEX IF NOT EXISTS channels_provider_status_idx ON public.channels(provider, status);
CREATE INDEX IF NOT EXISTS messages_channel_id_idx ON public.messages(channel_id);
