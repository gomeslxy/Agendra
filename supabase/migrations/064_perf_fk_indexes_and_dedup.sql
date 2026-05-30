-- Migration 064: Performance hygiene — cover unindexed foreign keys + drop duplicate indexes.
-- Advisors 0001 (unindexed_foreign_keys) and 0009 (duplicate_index). Pure perf; no behavior change.

-- ── Drop duplicate indexes (verified non-constraint, identical pairs) ─────────
DROP INDEX IF EXISTS public.channels_provider_id_unique;     -- keep channels_provider_provider_id_unique
DROP INDEX IF EXISTS public.idx_memberships_user_id;         -- keep memberships_user_id_idx

-- ── Covering indexes for foreign keys (speeds JOINs + parent delete/update) ───
CREATE INDEX IF NOT EXISTS ai_decision_logs_lead_id_idx     ON public.ai_decision_logs (lead_id);
CREATE INDEX IF NOT EXISTS ai_decision_logs_message_id_idx  ON public.ai_decision_logs (message_id);
CREATE INDEX IF NOT EXISTS ai_logs_message_id_idx           ON public.ai_logs (message_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx           ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS invitations_invited_by_idx       ON public.invitations (invited_by);
CREATE INDEX IF NOT EXISTS invitations_notification_id_idx  ON public.invitations (notification_id);
CREATE INDEX IF NOT EXISTS leads_human_takeover_by_idx      ON public.leads (human_takeover_by);
CREATE INDEX IF NOT EXISTS processed_messages_lead_id_idx   ON public.processed_messages (lead_id);
CREATE INDEX IF NOT EXISTS reminders_lead_id_idx            ON public.reminders (lead_id);
CREATE INDEX IF NOT EXISTS transactions_lead_id_idx         ON public.transactions (lead_id);

-- prompt_experiments / prompt_versions (A/B prompt tooling) — guard in case absent
DO $$ BEGIN
  IF to_regclass('public.prompt_experiments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS prompt_experiments_version_a_id_idx ON public.prompt_experiments (version_a_id);
    CREATE INDEX IF NOT EXISTS prompt_experiments_version_b_id_idx ON public.prompt_experiments (version_b_id);
  END IF;
  IF to_regclass('public.prompt_versions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS prompt_versions_created_by_idx ON public.prompt_versions (created_by);
  END IF;
END $$;
