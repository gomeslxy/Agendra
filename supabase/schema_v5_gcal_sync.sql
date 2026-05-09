-- ============================================================
-- Agendra — Schema v5: Google Calendar Sync
-- Execute AFTER schema_v4_ai.sql in Supabase SQL Editor
-- ============================================================

-- Allow events without a lead (external GCal imports have no lead)
ALTER TABLE public.events ALTER COLUMN lead_id DROP NOT NULL;

-- Track whether event originated in Agendra or was imported from GCal
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agendra'
  CHECK (source IN ('agendra', 'gcal'));

-- Track GCal sync status for Agendra-origin events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT DEFAULT NULL
  CHECK (gcal_sync_status IN ('synced', 'pending', 'error'));

-- Incremental sync token from Google Calendar API
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS gcal_sync_token TEXT;

-- Timestamp of last successful sync
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Index for fast gcal_event_id lookups during sync upsert
CREATE INDEX IF NOT EXISTS events_gcal_event_id_idx
  ON public.events(gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;

-- Index for source filtering
CREATE INDEX IF NOT EXISTS events_source_idx
  ON public.events(company_id, source);
