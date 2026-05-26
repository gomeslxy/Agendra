-- 050_ai_decision_logs_realtime.sql
-- Mente da IA: enable Supabase Realtime on ai_decision_logs so the /settings?tab=logs
-- UI receives INSERTs live (Business tier). RLS already enforces company_id isolation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='ai_decision_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_decision_logs';
  END IF;
END $$;
