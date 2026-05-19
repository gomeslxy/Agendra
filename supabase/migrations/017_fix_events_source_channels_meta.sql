-- Agendra Migration: 017_fix_events_source_channels_meta
-- Fixes two critical schema gaps found in 2026-05-19 audit:
--
--   1. events.source TEXT — distinguishes GCal-origin events ('gcal') from
--      Agendra-created events ('agendra'). sync.ts filters deletes by this column;
--      without it, cancelled GCal events could delete Agendra bookings.
--
--   2. events.gcal_sync_status TEXT — written by sync.ts on insert; was silently
--      ignored because column did not exist.
--
--   3. channels.last_error already exists (migration 011). client.ts was incorrectly
--      writing to a non-existent 'meta' JSONB column — fixed in code (client.ts),
--      no schema change needed here.

-- ─── 1. events.source ─────────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agendra'
    CHECK (source IN ('agendra', 'gcal'));

-- Backfill: events with a gcal_event_id but no lead_id are GCal-origin.
-- Events created by bookAppointment always have a lead_id.
UPDATE public.events
  SET source = 'gcal'
  WHERE gcal_event_id IS NOT NULL
    AND lead_id IS NULL
    AND source = 'agendra';

-- ─── 2. events.gcal_sync_status ───────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT;

-- ─── 3. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS events_source_idx
  ON public.events(source);

CREATE INDEX IF NOT EXISTS events_gcal_event_id_idx
  ON public.events(gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;
