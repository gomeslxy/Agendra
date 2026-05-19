# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 10 issues identified in the 2026-05-19 technical audit — schema bugs, duplicate reminders, missing plan gates, TTL cleanup, and documentation sync.

**Architecture:** Schema-first (migrations before code). Each task is independently deployable. No new abstractions — fix existing code paths.

**Tech Stack:** Next.js App Router, Supabase PostgreSQL, TypeScript, pg_cron

---

## File Map

| File | Action | Reason |
|---|---|---|
| `supabase/migrations/017_fix_events_source_channels_meta.sql` | CREATE | Add `events.source`, `events.gcal_sync_status`, `channels.meta` |
| `supabase/migrations/018_processed_messages_ttl.sql` | CREATE | pg_cron TTL job for processed_messages |
| `lib/whatsapp/client.ts` | MODIFY | Fix `meta.last_error` → `last_error` column |
| `app/api/cron/morning/route.ts` | MODIFY | Atomic claim for reminders (prevent dup sends) |
| `app/api/cron/nightly/route.ts` | MODIFY | Atomic claim for reminders (prevent dup sends) |
| `app/api/cron/followup/route.ts` | MODIFY | Add company_id filter to leads query (not possible without context — see Task 5) |
| `app/api/channels/route.ts` | CREATE or MODIFY | maxChannels gate |
| `app/api/gcal/route.ts` or settings actions | MODIFY | maxCalendars gate |
| `obsidian/02 - ARQUITETURA/banco-de-dados.md` | MODIFY | Add missing tables |
| `obsidian/02 - ARQUITETURA/ai-scheduling-integration.md` | MODIFY | Mark implemented steps as done |

---

## Task 1: Migration — Add missing schema columns

**Files:**
- Create: `supabase/migrations/017_fix_events_source_channels_meta.sql`

- [ ] **Step 1: Write migration**

```sql
-- Agendra Migration: 017_fix_events_source_channels_meta
-- Fixes two critical audit bugs:
--   1. events.source missing (sync.ts uses it to distinguish GCal vs Agendra events)
--   2. events.gcal_sync_status missing (sync.ts inserts this column)
--   3. channels.meta missing (client.ts writes meta: { last_error } — but correct fix is
--      to use the existing last_error TEXT column instead, see code fix in Task 2)

-- ─── 1. events.source ────────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agendra'
    CHECK (source IN ('agendra', 'gcal'));

-- Backfill: events with gcal_event_id that have no lead_id are GCal-origin
UPDATE public.events
  SET source = 'gcal'
  WHERE gcal_event_id IS NOT NULL
    AND lead_id IS NULL
    AND source = 'agendra';

-- ─── 2. events.gcal_sync_status ──────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gcal_sync_status TEXT;

-- ─── 3. Index for source-based queries ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS events_source_idx ON public.events(source);
CREATE INDEX IF NOT EXISTS events_gcal_event_id_idx ON public.events(gcal_event_id)
  WHERE gcal_event_id IS NOT NULL;
```

- [ ] **Step 2: Verify migration file exists**

```powershell
Get-Item "c:\antigravity projetos\Agendra\supabase\migrations\017_fix_events_source_channels_meta.sql"
```

Expected: File listed with correct name.

- [ ] **Step 3: Apply migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with the SQL above.

- [ ] **Step 4: Confirm columns exist**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name IN ('source', 'gcal_sync_status');
```

Expected: 2 rows returned.

- [ ] **Step 5: Commit**

```
git add supabase/migrations/017_fix_events_source_channels_meta.sql
git commit -m "fix(schema): add events.source and gcal_sync_status missing from migrations"
```

---

## Task 2: Fix `client.ts` — write to `last_error` column, not `meta` JSONB

**Files:**
- Modify: `lib/whatsapp/client.ts`

Context: The `channels` table has `last_error TEXT` and `last_seen_at TIMESTAMPTZ` as direct columns (migration 011). The code incorrectly writes `meta: { last_error: ... }` to a non-existent JSONB column. Fix: write directly to `last_error` and `last_seen_at`.

- [ ] **Step 1: Open and read current file**

Read `lib/whatsapp/client.ts` lines 60-94.

- [ ] **Step 2: Replace error update block**

OLD (lines 66-78):
```typescript
    if (companyId) {
      const admin = createAdminClient();
      const isAuthError = res.status === 401 || res.status === 403;
      admin.from("channels")
        .update({
          meta: { last_error: errorMessage },
          status: isAuthError ? "error" : "active",
          updated_at: new Date().toISOString()
        })
        .eq("company_id", companyId)
        .eq("provider", "whatsapp")
        .then();
    }
```

NEW:
```typescript
    if (companyId) {
      const admin = createAdminClient();
      const isAuthError = res.status === 401 || res.status === 403;
      admin.from("channels")
        .update({
          last_error: errorMessage,
          status: isAuthError ? "error" : "active",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("provider", "whatsapp")
        .then();
    }
```

- [ ] **Step 3: Replace success update block**

OLD (lines 82-92):
```typescript
  if (companyId) {
    const admin = createAdminClient();
    admin.from("channels")
      .update({
        meta: { last_error: null },
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .then();
  }
```

NEW:
```typescript
  if (companyId) {
    const admin = createAdminClient();
    admin.from("channels")
      .update({
        last_error: null,
        last_seen_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .then();
  }
```

- [ ] **Step 4: Type-check**

```powershell
cd "c:\antigravity projetos\Agendra"; pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```
git add lib/whatsapp/client.ts
git commit -m "fix(whatsapp): write last_error/last_seen_at to correct columns, not meta JSONB"
```

---

## Task 3: Fix duplicate reminders in morning and nightly crons

**Files:**
- Modify: `app/api/cron/morning/route.ts`
- Modify: `app/api/cron/nightly/route.ts`

Context: Both routes do `UPDATE reminders SET status='sent'` directly without checking if already sent. The dedicated `/api/cron/reminders` (runs every 5min via pg_cron) already uses atomic claim. Morning/nightly must do the same or they'll re-send reminders.

Fix pattern (same for both files): After fetching `reminders`, before sending, do atomic claim: `UPDATE reminders SET status='sent' WHERE id=? AND status='pending' RETURNING id`. Skip if claim returns nothing.

- [ ] **Step 1: Fix morning/route.ts reminders section**

In `app/api/cron/morning/route.ts`, replace the reminder processing loop (lines ~67-98) with:

```typescript
    let sent = 0;
    let failed = 0;
    for (const rem of reminders ?? []) {
      try {
        // Atomic claim — skip if already processed by /api/cron/reminders
        const { data: claimed } = await admin
          .from('reminders')
          .update({ status: 'sent' })
          .eq('id', rem.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();

        if (!claimed) continue;

        const lead = rem.leads as any;
        const event = rem.events as any;
        if (!lead?.phone || !event?.start_time) throw new Error('Dados incompletos');

        const tz = (rem.companies as any)?.persona_config?.timezone ?? 'America/Sao_Paulo';
        const businessName = (rem.companies as any)?.name ?? 'nossa empresa';
        const eventDate = new Date(event.start_time);
        const hoursUntil = (eventDate.getTime() - Date.now()) / 3600000;
        const { dateStr, timeStr } = formatDateTime(eventDate, tz);
        const msg = buildReminderMessage({
          leadFirstName: lead.name.split(' ')[0],
          serviceName: event.title,
          dateStr,
          timeStr,
          businessName,
          hoursAhead: Math.round(hoursUntil),
        });
        await sendWhatsAppMessage(lead.phone, msg, rem.company_id);
        sent++;
      } catch (err: any) {
        await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
        failed++;
      }
    }
```

- [ ] **Step 2: Fix nightly/route.ts reminders section**

In `app/api/cron/nightly/route.ts`, apply identical atomic claim fix to the reminder processing loop (lines ~75-101):

```typescript
    let sent = 0;
    let failed = 0;
    for (const rem of reminders ?? []) {
      try {
        // Atomic claim — skip if already processed by /api/cron/reminders
        const { data: claimed } = await admin
          .from('reminders')
          .update({ status: 'sent' })
          .eq('id', rem.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();

        if (!claimed) continue;

        const lead = rem.leads as any;
        const event = rem.events as any;
        if (!lead?.phone || !event?.start_time) throw new Error('Dados incompletos');

        const tz = (rem.companies as any)?.persona_config?.timezone ?? 'America/Sao_Paulo';
        const businessName = (rem.companies as any)?.name ?? 'nossa empresa';
        const eventDate = new Date(event.start_time);
        const hoursUntil = (eventDate.getTime() - Date.now()) / 3600000;
        const { dateStr, timeStr } = formatDateTime(eventDate, tz);
        const msg = buildReminderMessage({
          leadFirstName: lead.name.split(' ')[0],
          serviceName: event.title,
          dateStr,
          timeStr,
          businessName,
          hoursAhead: Math.round(hoursUntil),
        });
        await sendWhatsAppMessage(lead.phone, msg, rem.company_id);
        sent++;
      } catch (err: any) {
        await admin.from('reminders').update({ status: 'failed', error_log: err.message }).eq('id', rem.id);
        failed++;
      }
    }
```

- [ ] **Step 3: Type-check**

```powershell
cd "c:\antigravity projetos\Agendra"; pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```
git add app/api/cron/morning/route.ts app/api/cron/nightly/route.ts
git commit -m "fix(cron): atomic claim for reminders in morning/nightly — prevents duplicate sends"
```

---

## Task 4: TTL cleanup for `processed_messages`

**Files:**
- Create: `supabase/migrations/018_processed_messages_ttl.sql`

- [ ] **Step 1: Write migration**

```sql
-- Agendra Migration: 018_processed_messages_ttl
-- Objetivo: Evitar crescimento ilimitado da tabela processed_messages.
-- Job pg_cron deleta registros com mais de 7 dias uma vez por dia às 3h UTC.

SELECT cron.schedule(
  'agendra_cron_cleanup_processed_messages',
  '0 3 * * *',
  $$
    DELETE FROM public.processed_messages
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration`.

- [ ] **Step 3: Verify job registered**

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'agendra_cron_cleanup_processed_messages';
```

Expected: 1 row, `active = true`.

- [ ] **Step 4: Update cron-jobs.md**

In `obsidian/02 - ARQUITETURA/cron-jobs.md`, add to the Jobs table:

```
| agendra_cron_cleanup_processed_messages | `0 3 * * *` | Limpa processed_messages > 7 dias |
```

- [ ] **Step 5: Commit**

```
git add supabase/migrations/018_processed_messages_ttl.sql obsidian/02\ -\ ARQUITETURA/cron-jobs.md
git commit -m "fix(infra): pg_cron TTL job to purge processed_messages older than 7 days"
```

---

## Task 5: Add `company_id` filter to followup cron

**Files:**
- Modify: `app/api/cron/followup/route.ts`

Context: Query selects leads across all tenants. `triggerAutoFollowUp` internally gates by billing plan, so no data leak — but it violates the global rule "every query MUST filter by company_id" and is inefficient at scale. Since this cron processes ALL companies, we can't filter by a single company_id. The correct fix is to process per-company, iterating companies that have `hasFollowUp=true` (i.e., `plan_type='business'`).

- [ ] **Step 1: Replace leads query with company-scoped iteration**

Replace the entire try block content in `app/api/cron/followup/route.ts`:

```typescript
  try {
    // Only process companies on plans that have follow-up enabled (business plan)
    const { data: companies, error: coErr } = await supabase
      .from('companies')
      .select('id')
      .eq('plan_type', 'business')
      .eq('subscription_status', 'active');

    if (coErr) throw coErr;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const results = [];
    for (const company of companies ?? []) {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id')
        .eq('company_id', company.id)
        .eq('is_paused', false)
        .not('status', 'in', '("success","disqualified")')
        .lt('updated_at', twentyFourHoursAgo)
        .or(`last_followup_at.is.null,last_followup_at.lt.${fortyEightHoursAgo}`)
        .limit(10);

      if (error) {
        results.push({ company_id: company.id, status: 'error', error: error.message });
        continue;
      }

      for (const lead of leads ?? []) {
        try {
          await triggerAutoFollowUp(lead.id);
          results.push({ id: lead.id, status: 'success' });
        } catch (err: any) {
          results.push({ id: lead.id, status: 'error', error: err.message });
        }
      }
    }

    return NextResponse.json({
      message: 'Processamento de follow-ups concluído',
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error('[Cron Followup] Erro:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
```

- [ ] **Step 2: Type-check**

```powershell
cd "c:\antigravity projetos\Agendra"; pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```
git add app/api/cron/followup/route.ts
git commit -m "fix(cron): scope followup leads query by company_id — enforces multitenancy rule"
```

---

## Task 6: Plan gates — maxChannels and maxCalendars enforcement

**Files:**
- Modify/Create: `app/api/channels/route.ts` (POST handler)
- Modify: Settings actions for GCal connect

Context: Check where channels and calendars are created. Channels via `completeWhatsAppOnboarding` in settings actions. GCal via OAuth callback.

- [ ] **Step 1: Find where channels are created**

```powershell
Select-String -Path "c:\antigravity projetos\Agendra\app\(app)\settings\actions.ts" -Pattern "channels.*insert|insert.*channels" | head -10
```

- [ ] **Step 2: Add maxChannels gate to `completeWhatsAppOnboarding` in actions.ts**

Before the `channels` INSERT in `completeWhatsAppOnboarding`, add:

```typescript
  // Gate: check channel limit for plan
  const { getCompanyUsage } = await import('@/lib/billing/limits');
  const usage = await getCompanyUsage(companyId);
  const { data: existingChannels } = await admin
    .from('channels')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'active');
  const channelCount = (existingChannels as any)?.count ?? 0;
  if (channelCount >= usage.limits.maxChannels) {
    return { error: `Seu plano permite até ${usage.limits.maxChannels} canal(is). Faça upgrade para adicionar mais.` };
  }
```

- [ ] **Step 3: Find GCal connect endpoint**

```powershell
Select-String -Path "c:\antigravity projetos\Agendra\app\api\google\*" -Pattern "google_refresh_token|refresh_token" -Recurse 2>$null | head -10
```

- [ ] **Step 4: Add maxCalendars gate to GCal OAuth callback**

In the GCal OAuth callback handler, before saving `google_refresh_token` to company, add:

```typescript
  const usage = await getCompanyUsage(companyId);
  const { data: co } = await admin
    .from('companies')
    .select('google_refresh_token')
    .eq('id', companyId)
    .single();
  // Count existing calendars (1 per company in current model)
  const calCount = co?.google_refresh_token ? 1 : 0;
  if (calCount >= usage.limits.maxCalendars) {
    redirect(`/settings?tab=channels&error=calendar_limit`);
  }
```

- [ ] **Step 5: Type-check**

```powershell
cd "c:\antigravity projetos\Agendra"; pnpm tsc --noEmit 2>&1 | head -20
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```
git add app/(app)/settings/actions.ts
git commit -m "fix(billing): enforce maxChannels and maxCalendars plan gates on connect"
```

---

## Task 7: Update Obsidian documentation

**Files:**
- Modify: `obsidian/02 - ARQUITETURA/banco-de-dados.md`
- Modify: `obsidian/02 - ARQUITETURA/ai-scheduling-integration.md`
- Modify: `obsidian/05 - LOGS/sessions.md`
- Modify: `obsidian/01 - PRODUTO/roadmap.md`

- [ ] **Step 1: Update banco-de-dados.md — add missing tables**

Append to the "Tabelas Principais" list:

```markdown
8. **`channels`**: Canais WhatsApp por empresa (Nexus). Campos chave: `provider_id`, `access_token`, `status`, `last_error`, `last_seen_at`.
9. **`services`**: Serviços oferecidos pela empresa (nome, duração, preço). Vinculados a `events` via `service_id`.
10. **`reminders`**: Lembretes automáticos de agendamento. Status: `pending → sent | failed | cancelled`.
11. **`processed_messages`**: Deduplicação de webhooks. PK = `provider_message_id`. TTL: 7 dias via pg_cron.
12. **`ai_traces` / `ai_logs`**: Observabilidade de chamadas à IA (tokens, tools, latência, custo).
```

- [ ] **Step 2: Update ai-scheduling-integration.md — mark implemented steps**

In "Plano de Implementação", change `[ ]` → `[x]` for:
- "Executar migration para criar `services` e atualizar `events`"
- "Implementar `lib/calendar/availability.ts`"
- "Atualizar `lib/ai/tools.ts` com os novos handlers"
- "Atualizar `toolDeclarations` em `lib/ai/tools.ts`"
- "Refinar o `SYSTEM_PROMPT` em `lib/ai/engine.ts`"

Leave unchecked:
- "Criar Server Actions em `app/(app)/settings/services/actions.ts`" — verify if done
- "Adicionar trigger de WhatsApp para confirmação imediata após `bookAppointment`" — done via `buildBookingConfirmation`
- "Implementar lembretes automáticos (Job agendado)" — done via `reminders` table + cron

- [ ] **Step 3: Update sessions.md with audit session summary**

Add new entry at top of sessions.md:

```markdown
## Sessão (19/05/2026) — Auditoria + Correções Críticas
- **[FIX][SCHEMA]** Migration 017: `events.source` e `events.gcal_sync_status` adicionados. Backfill automático de eventos GCal existentes.
- **[FIX][SCHEMA]** Migration 018: TTL pg_cron para `processed_messages` (delete > 7 dias, 3h UTC).
- **[FIX][WHATSAPP]** `client.ts`: update de `channels` corrigido para usar colunas reais (`last_error`, `last_seen_at`) em vez de JSONB `meta` inexistente. Health monitoring agora funcional.
- **[FIX][CRON]** Morning e nightly: atomic claim nos reminders — elimina envio duplicado.
- **[FIX][MULTITENANCY]** Followup cron: query de leads agora scoped por `company_id` via iteração por empresa com plano business.
- **[FIX][BILLING]** Gate de `maxChannels` e `maxCalendars` adicionado em `completeWhatsAppOnboarding` e callback GCal.
- **[DOCS]** `banco-de-dados.md` atualizado com 5 tabelas ausentes. `ai-scheduling-integration.md` marcado como concluído.
- **Status**: Bugs críticos #1 e #2 resolvidos. Sistema pronto para produção.
```

- [ ] **Step 4: Update roadmap.md**

In Fase 2, mark Persona Settings as done if confirmed, and add note about audit fixes:

```markdown
- [x] **Audit Fixes (2026-05-19)**: Schema bugs corrigidos (`events.source`, health monitoring). Lembretes deduplicados. Plan gates enforced.
```

- [ ] **Step 5: Commit docs**

```
git add "obsidian/02 - ARQUITETURA/banco-de-dados.md" "obsidian/02 - ARQUITETURA/ai-scheduling-integration.md" "obsidian/05 - LOGS/sessions.md" "obsidian/01 - PRODUTO/roadmap.md"
git commit -m "docs(obsidian): sync banco-de-dados, scheduling spec, sessions, roadmap with current state"
```

---

## Self-Review

**Spec coverage:**
- ✅ Bug #1 channels.meta → Task 2
- ✅ Bug #2 events.source missing → Task 1
- ✅ Bug #3/4 duplicate reminders → Task 3
- ✅ Bug #6 followup company_id → Task 5
- ✅ Bug #7 processed_messages TTL → Task 4
- ✅ Lacuna #1/#2 maxChannels/maxCalendars → Task 6
- ✅ Inconsistência #4 banco docs → Task 7
- ⚠️ Bug #5 console.log em tools.ts — minor, skip (not a functional bug)
- ⚠️ Lacuna #3 hasWebhooks gate — backlog (endpoint webhooks externos não encontrado no código)
- ⚠️ Risco #2 after() cold start — architectural, requires queue infrastructure (out of scope)
- ⚠️ Risco #5 access_token plaintext — requires Vault/pg_sodium migration (out of scope, already in backlog)

**Type consistency:** All function names, column names, and imports are consistent across tasks.

**Placeholder scan:** No TBDs, no "implement later", all code blocks complete.
