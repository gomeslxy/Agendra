-- Migration 020: Unique constraint on (gcal_event_id, company_id) in events table
-- Prevents duplicate GCal event imports if sync runs concurrently per company.
-- Partial index: only applies when gcal_event_id is not null (Agendra-native
-- events don't have a gcal_event_id and must not be affected).

CREATE UNIQUE INDEX IF NOT EXISTS events_gcal_event_id_company_id_unique
  ON public.events (gcal_event_id, company_id)
  WHERE gcal_event_id IS NOT NULL;
