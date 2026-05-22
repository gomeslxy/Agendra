# Wave 7 — Audit + Provider Dashboard + Takeover Fix

**Date:** 2026-05-22  
**Status:** Approved

---

## Scope

Three workstreams in priority order:

1. **Audit & Bug Fixes** — review Waves 0-6 code, fix discovered issues
2. **Takeover Wiring Fix** — critical: connect inbox "Assumir" to `activateTakeover()` 
3. **Provider Health Dashboard** — new section in `/reports`

---

## 1. Audit & Bug Fixes

### Known suspects

| Item | File | Risk |
|---|---|---|
| `takeOverLead` not calling `activateTakeover()` | `app/(app)/inbox/actions.ts` | Critical — engine guard fails |
| `maxDuration: 300` missing | `app/api/whatsapp/route.ts` | High — cold start kills debounce 4s |
| `extendTakeoverOnHumanMessage` never called | `app/api/whatsapp/route.ts` | Medium — takeover expires while human replies |
| Audit all Wave 0-6 modified files | all | Low–High |

### Audit targets (in order)

1. `app/(app)/inbox/actions.ts` — takeOverLead, automatizeLead
2. `app/api/whatsapp/route.ts` — maxDuration, extendTakeover call
3. `lib/ai/debounce.ts` — claimMessage fallback path
4. `lib/ai/providers/router.ts` — chain definitions, timeouts
5. `lib/ai/providers/cerebras-adapter.ts` — tool loop
6. `lib/ai/providers/sambanova-adapter.ts` — fetch body, thinking flag
7. `lib/ai/transcribe.ts` — Whisper fallback
8. `lib/ai/media-router.ts` — routeMedia coverage
9. `lib/infra/redis.ts` — sentinel return values

---

## 2. Takeover Wiring Fix

### Problem

`inbox-client.tsx` calls `takeOverLead(leadId)` server action.  
`lib/ai/takeover.ts:activateTakeover()` sets `human_takeover_until`.  
Engine guard: `isUnderHumanTakeover(lead)` → checks `human_takeover_until > now`.

If `takeOverLead` action only sets `is_paused=true + control_mode='manual'` but NOT `human_takeover_until`, the engine guard PASSES and AI keeps responding.

### Fix

`actions.ts:takeOverLead` must call `activateTakeover({ companyId, leadId, userId, durationHours: 2 })`.  
`actions.ts:automatizeLead` must call `deactivateTakeover({ companyId, leadId })`.

### Extension

`app/api/whatsapp/route.ts` — when human message arrives and lead is in takeover:  
call `extendTakeoverOnHumanMessage(leadId, companyId)` to push `human_takeover_until` forward.

---

## 3. Provider Health Dashboard

### Location

New section in `app/(app)/reports/reports-client.tsx`, after the Realtime Sales card.  
Server data fetched in `app/(app)/reports/page.tsx`.

### Data model

```sql
-- Query in page.tsx (last 24h + last 7d)
SELECT 
  provider,
  count(*) as requests,
  count(*) FILTER (WHERE error IS NULL) as successes,
  avg(latency_ms) as avg_latency_ms,
  sum(cost) as total_cost,
  avg(tokens_input + tokens_output) as avg_tokens
FROM ai_logs
WHERE company_id = $1
  AND created_at > NOW() - INTERVAL '7 days'
  AND provider IS NOT NULL
GROUP BY provider
```

### UI Components

**ProviderHealthSection** (inside reports-client.tsx):
- Section header: "Saúde dos Providers IA"
- 4 glass cards (Cerebras / Groq / SambaNova / Gemini)
  - Provider name + icon
  - Requests (24h) with trend vs 7d avg
  - Success rate badge: ≥95% green, 80-94% yellow, <80% red
  - Avg latency (ms)
  - Cost accumulated (R$) — calculated from `sum(cost)`
  - "Não usado" state if provider has 0 requests

**ChainKindBar** (inside same section):
- Horizontal stacked bar: conv / tools / bg proportions
- Color: blue (conv), purple (tools), gray (bg)
- Shows "Roteamento de Chain" label

### Design constraints

- Liquid Glass (`.glass` class)
- Framer Motion fade-in per card
- Gated: only show section if user has Pro/Business plan (`usage.limits.hasAnalytics`)
- Server component passes `providerStats: ProviderStat[]` prop

### TypeScript types

```ts
interface ProviderStat {
  provider: 'cerebras' | 'groq' | 'sambanova' | 'gemini';
  requests_24h: number;
  requests_7d: number;
  success_rate: number; // 0–1
  avg_latency_ms: number;
  total_cost_7d: number;
  avg_tokens: number;
}

interface ChainStat {
  chain_kind: 'conv' | 'tools' | 'bg';
  count: number;
}
```

---

## Architecture

No new routes, no new tables.  
Data flows: `ai_logs` → `page.tsx` server query → `reports-client.tsx` props → UI.  
Takeover flows: `inbox actions.ts` → `lib/ai/takeover.ts` → Supabase.

---

## Definition of Done

- [ ] Audit complete, all findings documented
- [ ] `takeOverLead` calls `activateTakeover()` with `human_takeover_until`
- [ ] `automatizeLead` calls `deactivateTakeover()`
- [ ] `extendTakeoverOnHumanMessage` called in webhook route when human sends in takeover
- [ ] `maxDuration: 300` set in webhook route
- [ ] ProviderHealthSection renders in `/reports` with real data
- [ ] Glass cards with success rate badges
- [ ] ChainKindBar shows conv/tools/bg split
- [ ] Gated by `hasAnalytics`
- [ ] `pnpm tsc --noEmit` → exit 0
- [ ] Commit `feat(wave7): provider health dashboard + takeover wiring + audit fixes`
