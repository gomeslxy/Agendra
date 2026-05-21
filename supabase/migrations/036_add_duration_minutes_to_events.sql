CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add duration_minutes to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Populate existing rows with calculated duration (in minutes)
UPDATE public.events
  SET duration_minutes = ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
  WHERE duration_minutes IS NULL;

-- Index for fast lookup (optional)
CREATE INDEX IF NOT EXISTS idx_events_duration ON public.events (company_id, duration_minutes);
