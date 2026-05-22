-- Tabela 1: buffer fallback p/ debounce sem Redis
CREATE TABLE IF NOT EXISTS public.message_buffer (
  provider_message_id TEXT PRIMARY KEY,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_phone          TEXT NOT NULL,
  lead_name           TEXT,
  body                TEXT NOT NULL,
  msg_type            TEXT NOT NULL DEFAULT 'text',
  metadata            JSONB DEFAULT '{}'::jsonb,
  flush_after         TIMESTAMPTZ NOT NULL,
  flushed             BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_buffer_flush
  ON public.message_buffer (flush_after) WHERE flushed = false;
CREATE INDEX IF NOT EXISTS idx_message_buffer_lookup
  ON public.message_buffer (company_id, lead_phone, flushed);
ALTER TABLE public.message_buffer ENABLE ROW LEVEL SECURITY;

-- Tabela 2: dedup_keys (fallback de claimMessage quando Redis off — ver B4)
CREATE TABLE IF NOT EXISTS public.dedup_keys (
  provider_message_id TEXT PRIMARY KEY,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dedup_keys_claimed ON public.dedup_keys (claimed_at);
ALTER TABLE public.dedup_keys ENABLE ROW LEVEL SECURITY;

-- TTL crons
SELECT cron.schedule('message-buffer-ttl', '20 3 * * *',
  $$ DELETE FROM public.message_buffer WHERE created_at < NOW() - INTERVAL '1 day'; $$);
SELECT cron.schedule('dedup-keys-ttl', '*/10 * * * *',
  $$ DELETE FROM public.dedup_keys WHERE claimed_at < NOW() - INTERVAL '10 minutes'; $$);
