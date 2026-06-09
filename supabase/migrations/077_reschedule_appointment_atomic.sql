-- Migration 077: Atomic reschedule function.
--
-- handleRescheduleAppointment previously did a non-atomic SELECT (collision
-- check) followed by an UPDATE. Between the two statements another booking
-- could take the same slot (TOCTOU) → double-booking. It also ignored the
-- company's buffer_minutes, unlike book_appointment_atomic.
--
-- This mirrors book_appointment_atomic: pessimistic lock on the company row
-- serializes all booking/reschedule transactions per tenant, then a buffered
-- collision check + UPDATE run inside the same transaction.

CREATE OR REPLACE FUNCTION public.reschedule_appointment_atomic(
  p_event_id UUID,
  p_company_id UUID,
  p_lead_id UUID,
  p_new_start_time TIMESTAMPTZ,
  p_new_end_time TIMESTAMPTZ,
  p_buffer_minutes INT DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
  v_collision_id UUID;
  v_buffered_start TIMESTAMPTZ;
  v_buffered_end TIMESTAMPTZ;
  v_updated public.events%ROWTYPE;
BEGIN
  -- Serialize with book_appointment_atomic on the same tenant
  PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;

  v_buffered_start := p_new_start_time - (p_buffer_minutes * INTERVAL '1 minute');
  v_buffered_end   := p_new_end_time   + (p_buffer_minutes * INTERVAL '1 minute');

  SELECT id INTO v_collision_id
  FROM public.events
  WHERE company_id = p_company_id
    AND id <> p_event_id
    AND status != 'cancelled'
    AND start_time < v_buffered_end
    AND end_time > v_buffered_start
  LIMIT 1;

  IF v_collision_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Infelizmente este novo horário já está ocupado.');
  END IF;

  UPDATE public.events
  SET start_time = p_new_start_time,
      end_time   = p_new_end_time,
      status     = 'rescheduled'
  WHERE id = p_event_id
    AND company_id = p_company_id
    AND lead_id = p_lead_id
    AND status != 'cancelled'
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agendamento não encontrado.');
  END IF;

  RETURN jsonb_build_object('success', true, 'event', row_to_json(v_updated)::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Server-side only (service_role), same lockdown as book_appointment_atomic (migration 062)
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment_atomic(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_atomic(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;
