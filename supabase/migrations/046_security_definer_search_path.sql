-- Migration 046: Add SET search_path to SECURITY DEFINER functions that were missing it
-- Risk: without SET search_path, a malicious user with CREATE SCHEMA privilege could
-- create a shadow schema with a poisoned table/function and hijack privileged execution.

-- 1. match_knowledge: fix privilege escalation via schema injection
CREATE OR REPLACE FUNCTION public.match_knowledge(
  p_company_id UUID,
  p_embedding VECTOR(1536),
  p_match_threshold FLOAT,
  p_match_count INT
) RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.content,
    1 - (k.embedding <=> p_embedding) AS similarity
  FROM public.company_knowledge k
  WHERE k.company_id = p_company_id
    AND 1 - (k.embedding <=> p_embedding) > p_match_threshold
  ORDER BY k.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_knowledge(UUID, VECTOR, FLOAT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_knowledge(UUID, VECTOR, FLOAT, INT) TO service_role;

-- 2. book_appointment_atomic: same fix
CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_lead_id UUID,
  p_company_id UUID,
  p_service_id UUID,
  p_title TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_gcal_event_id TEXT,
  p_notes TEXT,
  p_duration_minutes INT,
  p_buffer_minutes INT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_collision_id UUID;
  v_future_count INT;
  v_same_day_id UUID;
  v_inserted_event RECORD;
  v_buffered_start TIMESTAMPTZ;
  v_buffered_end TIMESTAMPTZ;
BEGIN
  -- Pessimistic row lock on company to serialize concurrent bookings per tenant
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;

  -- 1. Collision check with buffer
  v_buffered_start := p_start_time - (p_buffer_minutes * INTERVAL '1 minute');
  v_buffered_end := p_end_time + (p_buffer_minutes * INTERVAL '1 minute');

  SELECT id INTO v_collision_id
  FROM public.events
  WHERE company_id = p_company_id
    AND status != 'cancelled'
    AND start_time < v_buffered_end
    AND end_time > v_buffered_start
  LIMIT 1;

  IF v_collision_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este horário acabou de ser ocupado. Por favor, escolha outro.');
  END IF;

  -- 2. Max 3 future bookings per lead
  SELECT count(*) INTO v_future_count
  FROM public.events
  WHERE lead_id = p_lead_id
    AND company_id = p_company_id
    AND status != 'cancelled'
    AND start_time >= NOW();

  IF v_future_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você já possui 3 agendamentos futuros. Cancele ou conclua algum antes de marcar mais.');
  END IF;

  -- 3. Same service same day
  SELECT id INTO v_same_day_id
  FROM public.events
  WHERE lead_id = p_lead_id
    AND company_id = p_company_id
    AND service_id = p_service_id
    AND status != 'cancelled'
    AND start_time::date = p_start_time::date
  LIMIT 1;

  IF v_same_day_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você já tem este mesmo serviço agendado neste dia. Quer reagendar o existente?');
  END IF;

  -- 4. Atomic insert
  INSERT INTO public.events (
    lead_id, company_id, service_id, title, start_time, end_time,
    gcal_event_id, gcal_sync_status, notes, duration_minutes, status
  ) VALUES (
    p_lead_id, p_company_id, p_service_id, p_title, p_start_time, p_end_time,
    p_gcal_event_id, CASE WHEN p_gcal_event_id IS NULL THEN NULL ELSE 'synced'::TEXT END,
    p_notes, p_duration_minutes, 'confirmed'
  ) RETURNING * INTO v_inserted_event;

  RETURN jsonb_build_object(
    'success', true,
    'event', row_to_json(v_inserted_event)::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_appointment_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic TO service_role;
