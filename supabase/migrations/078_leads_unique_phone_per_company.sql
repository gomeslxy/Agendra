-- Migration 078: One lead per (company_id, phone).
--
-- Lead creation in the engine is SELECT-then-INSERT with no unique constraint:
-- two concurrent flushes for a brand-new lead (Redis debounce path racing the
-- SQL message_buffer drain, or overlapping crons) each see "no lead" and both
-- insert → duplicate leads, split conversation history, broken AI context and
-- inflated billing counts.
--
-- 1) Merge existing duplicates: keep the OLDEST lead (original conversation),
--    repoint every FK that references leads(id) to the kept row, delete dups.
-- 2) Add a partial unique index so the race becomes a 23505 the engine now
--    handles by re-selecting the winner.

DO $$
DECLARE
  dup RECORD;
  fk RECORD;
BEGIN
  FOR dup IN
    SELECT
      company_id,
      phone,
      (array_agg(id ORDER BY created_at ASC, id ASC))[1] AS keep_id,
      array_remove(
        array_agg(id ORDER BY created_at ASC, id ASC),
        (array_agg(id ORDER BY created_at ASC, id ASC))[1]
      ) AS dup_ids
    FROM public.leads
    WHERE phone IS NOT NULL
    GROUP BY company_id, phone
    HAVING count(*) > 1
  LOOP
    -- Repoint every FK column in public.* that references public.leads(id)
    FOR fk IN
      SELECT tc.table_schema, tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = 'leads'
        AND ccu.column_name = 'id'
    LOOP
      EXECUTE format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = ANY($2)',
        fk.table_schema, fk.table_name, fk.column_name, fk.column_name
      ) USING dup.keep_id, dup.dup_ids;
    END LOOP;

    DELETE FROM public.leads WHERE id = ANY(dup.dup_ids);
    RAISE NOTICE 'Merged % duplicate lead(s) for company=% phone=%', array_length(dup.dup_ids, 1), dup.company_id, dup.phone;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_phone_unique
  ON public.leads (company_id, phone)
  WHERE phone IS NOT NULL;
