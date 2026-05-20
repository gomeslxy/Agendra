-- Migration 030: Add trace_id and rag_status to logging and observability tables
-- Add columns to ai_logs
ALTER TABLE public.ai_logs
  ADD COLUMN IF NOT EXISTS trace_id UUID,
  ADD COLUMN IF NOT EXISTS rag_status TEXT;

-- Add columns to ai_decision_logs
ALTER TABLE public.ai_decision_logs
  ADD COLUMN IF NOT EXISTS trace_id UUID;

-- Add columns to automation_events
ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS trace_id UUID;

-- Create indexes for fast correlation tracking
CREATE INDEX IF NOT EXISTS ai_logs_trace_id_idx ON public.ai_logs (trace_id);
CREATE INDEX IF NOT EXISTS ai_decision_logs_trace_id_idx ON public.ai_decision_logs (trace_id);
CREATE INDEX IF NOT EXISTS automation_events_trace_id_idx ON public.automation_events (trace_id);
