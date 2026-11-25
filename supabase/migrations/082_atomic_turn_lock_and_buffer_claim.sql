-- Migration 082: Atomic lead turn lock + SKIP LOCKED message_buffer batch claim
-- Addresses P0-ENG-04 (concurrent lead creation lock race) and P0-ENG-05 (cron/QStash drain collision).

-- 1. Aquisição atômica ou criação idempotente de lead com lock de turno
CREATE OR REPLACE FUNCTION public.acquire_or_create_lead_turn_lock(
  p_company_id UUID,
  p_phone TEXT,
  p_name TEXT,
  p_channel TEXT DEFAULT 'whatsapp',
  p_channel_id UUID DEFAULT NULL,
  p_stale_after_ms INT DEFAULT 300000
)
RETURNS TABLE (
  acquired BOOLEAN,
  lead_row JSONB,
  previous_last_message_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_prev_last_message_at TIMESTAMPTZ;
BEGIN
  -- Garante existência do lead sem race condition (usa índice parcial leads_company_phone_unique)
  INSERT INTO public.leads (
    company_id, name, phone, channel, channel_id,
    lead_memory, is_processing, processing_started_at, followup_count
  )
  VALUES (
    p_company_id,
    COALESCE(NULLIF(TRIM(p_name), ''), p_phone),
    p_phone,
    p_channel,
    p_channel_id,
    '{"timeline":[],"objections_raised":[],"services_mentioned":[],"score_history":[],"last_intent_signal":"","qualification_answers":{}}'::jsonb,
    false,
    NULL,
    0
  )
  ON CONFLICT (company_id, phone) WHERE phone IS NOT NULL DO NOTHING;

  -- Captura last_message_at anterior para preservar detecção de sessão expirada (>12h)
  SELECT l.last_message_at INTO v_prev_last_message_at
  FROM public.leads l
  WHERE l.company_id = p_company_id AND l.phone = p_phone
  LIMIT 1;

  -- Tenta adquirir lock livre OU reclamar lock expirado atomicamente
  UPDATE public.leads
  SET is_processing = true,
      processing_started_at = now(),
      last_message_at = now(),
      followup_count = CASE WHEN control_mode <> 'shadow' THEN 0 ELSE followup_count END
  WHERE company_id = p_company_id
    AND phone = p_phone
    AND (
      is_processing = false
      OR processing_started_at IS NULL
      OR processing_started_at < now() - (p_stale_after_ms * INTERVAL '1 millisecond')
    )
  RETURNING * INTO v_lead;

  IF FOUND THEN
    RETURN QUERY SELECT true, to_jsonb(v_lead), v_prev_last_message_at;
    RETURN;
  END IF;

  -- Lock ocupado por outro worker saudável → retorna lead atual para inspeção de takeover/requeue
  SELECT * INTO v_lead
  FROM public.leads
  WHERE company_id = p_company_id AND phone = p_phone
  LIMIT 1;

  RETURN QUERY SELECT false, to_jsonb(v_lead), v_prev_last_message_at;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_or_create_lead_turn_lock(UUID, TEXT, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_or_create_lead_turn_lock(UUID, TEXT, TEXT, TEXT, UUID, INT) TO service_role;

-- 2. Claim atômico de lote do message_buffer (evita colisão entre pg_cron e QStash)
CREATE OR REPLACE FUNCTION public.claim_message_buffer_batch(
  p_row_limit INT DEFAULT 30,
  p_lease_seconds INT DEFAULT 300
)
RETURNS SETOF public.message_buffer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT provider_message_id
    FROM public.message_buffer
    WHERE flushed = false
      AND flush_after <= now()
    ORDER BY created_at ASC
    LIMIT p_row_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.message_buffer mb
  SET flush_after = now() + (p_lease_seconds * INTERVAL '1 second')
  FROM eligible e
  WHERE mb.provider_message_id = e.provider_message_id
  RETURNING mb.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_buffer_batch(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_buffer_batch(INT, INT) TO service_role;
