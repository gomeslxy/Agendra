-- Migration 028: contador de follow-ups por lead
-- Habilita respeito ao limite configurável em persona_config.followup_max_retries.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS followup_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN leads.followup_count IS
  'Quantos follow-ups automáticos o lead já recebeu. Reset opcional via action de produto.';
