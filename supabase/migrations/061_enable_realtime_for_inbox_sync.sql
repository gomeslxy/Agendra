-- Migration 061: Enable Supabase Realtime for critical inbox sync tables (leads, messages, events)
--
-- This guarantees that the realtime channel receives all events (INSERT, UPDATE, DELETE)
-- for these tables, enabling perfect live sync on the frontend.

DO $$
BEGIN
  -- Enable realtime for public.leads
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.leads';
  END IF;

  -- Enable realtime for public.messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  -- Enable realtime for public.events
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.events';
  END IF;
END $$;
