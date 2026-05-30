-- Migration 060: Restore engine columns missing from production (schema drift).
--
-- Production `leads`/`messages` were missing columns the AI engine writes on every turn:
--   • leads.channel_id, messages.channel_id  → declared in migration 044 (never landed here)
--   • leads.lead_memory (jsonb)              → declared in schema_v6 (the "Mente da IA" store)
--
-- Effect of the drift (root causes, proven against production):
--   1. messages INSERT included `channel_id` (nonexistent) → PostgREST rejected the row →
--      the error was swallowed → neither the lead's incoming message nor the AI reply ever
--      reached the inbox (ai_logs row at 11:06 had message_id = NULL).
--   2. New-lead INSERT included `channel_id` + `lead_memory` (nonexistent) → row rejected →
--      brand-new leads were never created and got no AI response.
--   3. lead_memory writes silently failed → long-term memory / "thinking" never persisted.
--
-- Fix: re-apply the intended schema. Idempotent (IF NOT EXISTS), safe to run anywhere.

-- ── leads.channel_id (multi-channel link, migration 044) ─────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_channel_id_idx ON public.leads(channel_id);

-- ── messages.channel_id (traceability, migration 044) ────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_channel_id_idx ON public.messages(channel_id);

-- ── leads.lead_memory (Mente da IA strategic memory, schema_v6) ──────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_memory JSONB
  DEFAULT '{"timeline":[],"objections_raised":[],"services_mentioned":[],"score_history":[],"last_intent_signal":"","qualification_answers":{}}'::jsonb;

-- Backfill any pre-existing rows that came in as NULL before the default existed.
UPDATE public.leads
   SET lead_memory = '{"timeline":[],"objections_raised":[],"services_mentioned":[],"score_history":[],"last_intent_signal":"","qualification_answers":{}}'::jsonb
 WHERE lead_memory IS NULL;
