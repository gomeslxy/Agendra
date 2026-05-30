-- Migration 056: Remove cron duplicado agendra_cron_morning.
--
-- Context: /api/cron/morning está agendado em DOIS lugares:
--   1. vercel.json → "0 11 * * *"  (Vercel Cron, execução direta)
--   2. agendra_cron_morning         (pg_cron → pg_net HTTP → Vercel)
--
-- Para jobs 1×/dia, o Vercel Cron é mais direto (sem hop pg_net, sem
-- dependência de Vault secrets, sem conectividade Supabase→Vercel).
-- pg_cron tem valor exclusivo para frequências sub-diárias que o plano
-- Hobby da Vercel não suporta (reminders 5min, followup 1h, etc).
--
-- Regra permanente (ver obsidian/02 - ARQUITETURA/cron-jobs.md):
--   Sub-diário → pg_cron   |   Diário → vercel.json

DO $$ BEGIN
  PERFORM cron.unschedule('agendra_cron_morning');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job pode não existir em environments de dev/teste
END $$;
