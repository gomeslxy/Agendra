-- Migration 047: Explicit deny-all RLS policies for service-role-only tables
-- message_buffer and dedup_keys have RLS enabled but zero policies,
-- which happens to deny authenticated access (safe-by-accident).
-- These explicit policies document intent and prevent accidental policy additions
-- from granting broader access.

-- message_buffer: only service_role reads/writes (via nightly cron flush)
CREATE POLICY "deny_all_authenticated"
  ON public.message_buffer
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- dedup_keys: only service_role reads/writes (via webhook dedup logic)
CREATE POLICY "deny_all_authenticated"
  ON public.dedup_keys
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
