-- Migration 045: Atomic booking function to prevent race conditions
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
) RETURNS JSONB AS $$
DECLARE
  v_collision_id UUID;
  v_future_count INT;
  v_same_day_id UUID;
  v_inserted_event RECORD;
  v_buffered_start TIMESTAMPTZ;
  v_buffered_end TIMESTAMPTZ;
BEGIN
  -- Bloqueio pessimista da linha da empresa para serialização de transações no tenant
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;

  -- 1. Check colisão geral com buffer
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

  -- 2. Limite de 3 agendamentos futuros por lead
  SELECT count(*) INTO v_future_count
  FROM public.events
  WHERE lead_id = p_lead_id
    AND company_id = p_company_id
    AND status != 'cancelled'
    AND start_time >= NOW();

  IF v_future_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você já possui 3 agendamentos futuros. Cancele ou conclua algum antes de marcar mais.');
  END IF;

  -- 3. Mesmo serviço no mesmo dia
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

  -- 4. Inserção atômica
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
