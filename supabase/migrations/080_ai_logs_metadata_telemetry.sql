-- Migration 080: Add metadata JSONB column to ai_logs for timing/telemetry tracking
ALTER TABLE public.ai_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
