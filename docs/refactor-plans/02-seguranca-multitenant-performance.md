# Plano de Refatoração 02 — Segurança, Isolamento Multi-Tenant, RLS e Performance

> **Escopo:** Hardening completo de PostgreSQL/Supabase RLS e Vault (migrations até `081`), controle de acesso (`middleware.ts`, OAuth, OTP/Auth, `createAdminClient`), resolução determinística de tenant (`memberships?.[0]`), unificação e blindagem de webhooks/crons, rate limit atômico em Redis e eliminação de N+1.
> **Stack Alvo:** Next.js `16.2.6`, Supabase (`@supabase/supabase-js@2.105.3`, `@supabase/ssr@0.5.2`), Upstash Redis (`ioredis@5.11.0` + REST), Stripe `22.1.1`, `zod` (pré-requisito: `pnpm add zod`).

---

## 1. Diagnóstico Objetivo

### Tabela Resumo de Achados

| ID | Severidade | Evidência no Código | Sintoma / Causa Raiz | Impacto em Produção |
| :--- | :--- | :--- | :--- | :--- |
| `P0-SEC-01` | **P0 Crítico** | `supabase/migrations/072_admin_rate_limit_and_extra_capacity.sql:5-10` | Tabela `public.admin_login_attempts` criada **sem `ENABLE ROW LEVEL SECURITY`** | Qualquer usuário com `anon` key lê IPs dos admins, apaga registros para burlar brute-force ou injeta falhas (DoS) |
| `P0-SEC-02` | **P0 Crítico** | `supabase/migrations/067_restore_channel_set_access_token.sql:8-36` | `REVOKE EXECUTE ... FROM PUBLIC` sem revogar de `anon, authenticated` após o lockdown `062` | Qualquer cliente `anon`/`authenticated` pode chamar `/rest/v1/rpc/channel_set_access_token` e **sobrescrever tokens Vault de qualquer tenant** |
| `P0-SEC-03` | **P0 Crítico** | `app/api/auth/google/route.ts:48-49, 81-115`, `lib/calendar/google.ts:492`, `app/api/auth/instagram/callback/route.ts:15-16` | `state = companyId` em plaintext sem HMAC, sem cookie nonce e callback **sem validar sessão/role** | **OAuth Account-Linking CSRF**: atacante vincula seu Google Calendar ou Instagram a qualquer `companyId` conhecido |
| `P0-SEC-04` | **P0 Crítico** | `app/api/auth/{reset-password,verify-otp,signup,send-otp}/route.ts` | `X-Forwarded-For` spoofável, OTP em plaintext sem contador de tentativas e `listUsers()` paginado (50 users) | **Account Takeover** via força bruta distribuída de OTP 6 dígitos e reenvio indevido após 50 usuários |
| `P0-SEC-05` | **P0 Crítico** | 71 ocorrências de `memberships?.[0]` em 20 arquivos + `supabase/migrations/071:6-44` + `app/(app)/settings/actions.ts:893` + `app/api/stripe/{checkout,sync}/route.ts` | Índice `[0]` hardcoded, `handle_new_user()` cria empresa fantasma para convidados, e rotas/actions sem validar `companyId` vs `role` | **Isolamento multi-tenant quebrado**: convidado preso em empresa vazia, IDOR de role em `saveCompanyReminderSettings`, checkout sem checar `admin`/`owner` |
| `P0-SEC-06` | **P0 Crítico** | `app/api/cron/morning/route.ts:180-215` | Stage `Channel Health` valida canais `instagram` usando `validateWhatsAppToken()` | **Derrubada diária (08:00 BRT)** de todos os canais Instagram ativos, marcando `status = 'error'` |
| `P1-SEC-01` | **P1 Alto** | `app/(app)/settings/page.tsx:149` → `settings-shell.tsx:164` | Query RSC seleciona `webhook_subscriptions.secret` e envia ao browser | Exposição de segredo HMAC de assinatura de webhooks para qualquer membro e no payload RSC |
| `P1-SEC-02` | **P1 Alto** | `middleware.ts:37-45, 73-77, 225-227` | `/notifications` ausente de `PROTECTED_PREFIXES`; `catch` **fail-open** (`return response`); `safeNext` aceita `//evil.com` | Acesso sem redirecionamento em falha de rede no Supabase e open-redirect via `//` |
| `P1-SEC-03` | **P1 Alto** | `app/api/meta/webhook/route.ts:44-55` vs `app/api/webhooks/instagram/route.ts:44-55, 126-135, 203-206` | Endpoints divergentes; `Buffer.from(..., 'hex')` lança `RangeError` (`500`) em assinatura malformada; Instagram usa `after()` antes de persistir buffer e descarta em `isLimitReached` | Risco de perda de DMs do Instagram e erro 500 em webhooks inválidos |
| `P1-SEC-04` | **P1 Alto** | `lib/rate-limit.ts:31-37` | `redis.incr` + `redis.expire` separados (não-atômico) | Falha intermediária deixa chave `rl:*` sem TTL (`TTL = -1`), causando **bloqueio permanente** |
| `P1-SEC-05` | **P1 Alto** | `migrations/019:90-155`, `079:55-89`, `url-guard.ts`, `dispatcher.ts:99`, `media-router.ts:79`, `whatsapp/test/route.ts:31` | RLS `019` permite `member` editar prompts/RAG; `079` sem `InitPlan` e `REVOKE`; SSRF via redirect/DNS rebinding e `fetch(mediaId)` sem allowlist; `/api/whatsapp/test` lê token plaintext | Escalonamento de privilégio intra-tenant, SSRF via HTTP 302 e falha em 100% do botão "Testar WhatsApp" |
| `P1-SEC-06` | **P1 Alto** | `inbox/page.tsx:43-66`, `reports/page.tsx:164`, `inbox/actions.ts:192`, `invitations/actions.ts:322`, `meta/webhook/route.ts:63-90`, `knowledge/route.ts`, crons, `leads/actions.ts:35` | `createAdminClient` em UI; N+1 `createSignedUrl`; falta cache Redis de canal; GCal Free/Busy sem invalidação pós-agendamento; 200 embeddings unitários sem `AbortController` nem check `hasRAG`; PostgREST `.or()` sem escape e CSV Injection | Latência alta no Inbox e webhooks, double-booking na janela de 90s do cache GCal, DoS em `/api/knowledge` |
| `P2-SEC-01` | **P2 Médio** | `lib/ai/tools.ts:663, 715, 832` | `void dispatchWebhook(...)` sem `after()` | Webhooks abortados quando o container serverless congela |
| `P2-SEC-02` | **P2 Médio** | Schema de `messages`, `leads`, `events`, `ai_logs` | Índices compostos faltantes para ordenação/filtro por `company_id` | Scans crescentes no Inbox, Reports e Crons |

---

### Detalhamento Técnico das Causas Raízes

#### P0 Crítico

1. **`[P0-SEC-01]` Exposição da tabela `admin_login_attempts` sem RLS (`072_admin_rate_limit_and_extra_capacity.sql:5-10`)**
   - A tabela registra `ip_address`, `attempted_at` e `success`, mas nunca executa `ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY`. Como `app/admin/actions.ts:45-80` a consulta exclusivamente via `createAdminClient()`, é obrigatório habilitar RLS com policy explícita de negação (`FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)`).

2. **`[P0-SEC-02]` Auditoria completa das `SECURITY DEFINER` RPCs pós-`062`**
   - **Verificação por migration:**
     - `065_restore_channel_get_access_token.sql:37-38`: **Seguro** (`REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`, `SET search_path = public, vault`).
     - `067_restore_channel_set_access_token.sql:35-36`: **VULNERÁVEL (P0)** — executa `REVOKE EXECUTE ON FUNCTION public.channel_set_access_token(UUID, TEXT) FROM PUBLIC;` mas **não revoga de `anon, authenticated`** (no Supabase, `ALTER DEFAULT PRIVILEGES` concede `EXECUTE` diretamente às roles `anon` e `authenticated`, então revogar apenas `PUBLIC` não remove os grants explícitos!).
     - `073_admin_dashboard_aggregations.sql:118-119`, `074_admin_migrations_rpc.sql:22-23`, `075_admin_cron_health_rpc.sql:41-42`, `077_reschedule_appointment_atomic.sql:64-65`: **Seguras** (todas com `SET search_path` explícito + `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`).
     - `079_notifications_evolution.sql:77-89`: Função trigger `handle_new_membership_notification_settings()` tem `SET search_path = public`, mas não possui `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.

3. **`[P0-SEC-03]` OAuth CSRF & Account Hijacking (`app/api/auth/google/route.ts`, `app/api/auth/instagram/callback/route.ts`)**
   - Em `lib/calendar/google.ts:492`, `state: companyId` é enviado sem assinatura. No callback (`app/api/auth/google/route.ts:48-49, 81-115`), `callbackState` é usado direto como `companyId` em `createAdminClient().from('companies').update({ google_refresh_token })` sem verificar sessão ou permissão do usuário. O mesmo ocorre em `app/api/auth/instagram/callback/route.ts:16, 36-38`. Além disso, `google_refresh_token` é persistido em texto plano na tabela `companies`, diferente de `channels` que usa Supabase Vault.

4. **`[P0-SEC-04]` Vulnerabilidades no fluxo Auth/OTP (`app/api/auth/*`)**
   - `signup/route.ts:15`, `send-otp/route.ts:13`, `verify-otp/route.ts:8` e `reset-password/route.ts:7` extraem o IP do cabeçalho spoofável `x-forwarded-for` (esquerda), ignorando `x-vercel-forwarded-for`.
   - `otp_codes` (`003_otp_codes.sql`) guarda `code` em texto plano, `verify-otp` (`linha 53`) e `reset-password` (`linha 58`) não usam comparação constante nem contabilizam tentativas erradas antes de queimar o código.
   - `signup/route.ts:57` chama `admin.auth.admin.listUsers()` sem paginação (padrão 50 registros), falhando em detectar usuários já existentes em bases maiores.

5. **`[P0-SEC-05]` Multi-tenant `memberships?.[0]` (71 ocorrências) e Empresa Fantasma de Convidados**
   - Mapeamento completo confirmado: **71 ocorrências** em `agenda/actions.ts` (4), `agenda/page.tsx` (1), `inbox/actions.ts` (10), `inbox/page.tsx` (1), `leads/actions.ts` (2), `leads/page.tsx` (1), `notifications/page.tsx` (2), `reports/actions.ts` (1), `reports/page.tsx` (1), `settings/invitations/actions.ts` (4), `settings/services/actions.ts` (8), `settings/actions.ts` (17), `settings/page.tsx` (2), `app/(app)/layout.tsx` (1), `admin/actions.ts` (3), `api/knowledge/route.ts` (3), `api/whatsapp/test/route.ts` (1), `onboarding/actions.ts` (1), `onboarding/layout.tsx` (1), `components/app/sidebar.tsx` (1), `lib/security/audit.ts` (1), além dos fallbacks de `lib/supabase/server.ts:112, 127`.
   - Agravante: `handle_new_user()` (`071_fix_signup_plan_type_default.sql:30-40`) cria uma empresa nova para usuários convidados via `inviteUserByEmail` (`settings/actions.ts:634`), colocando a empresa fantasma em `memberships[0]` e a empresa convidada em `memberships[1]`.
   - Em `settings/actions.ts:836` e `893`, `saveUserNotificationSettings(companyId, ...)` e `saveCompanyReminderSettings(companyId, ...)` usam o `companyId` do parâmetro da Action, mas `saveCompanyReminderSettings` valida `role` em `profile.memberships?.[0]?.role` (`linha 904`) e nenhuma das duas verifica se `companyId` pertence ao usuário antes da escrita.
   - Em `app/api/stripe/checkout/route.ts:63-84`, busca `users.company_id` via `createAdminClient()` sem validar `role IN ('owner', 'admin')` e usa fallback perigoso `planFromPriceId(priceId) ?? 'pro'` (`linhas 106, 150`) se `priceId` for adulterado. `app/api/stripe/sync/route.ts:46-50` usa `.single()` em `memberships`, quebrando para usuários com 2+ empresas.

6. **`[P0-SEC-06]` Cron `morning` derruba canais Instagram (`app/api/cron/morning/route.ts:180-215`)**
   - A query `channels` (`linhas 180-190`) não seleciona `provider` nem filtra `eq('provider', 'whatsapp')`. Ao executar `validateWhatsAppToken(ch.provider_id, token)` (`linha 208`) para contas Instagram, a Meta API rejeita e o cron grava `status: 'error'` (`linha 210`).

#### P1 Alto

- **`[P1-SEC-01]` Segredo de Webhook no RSC:** `app/(app)/settings/page.tsx:149` envia `webhook_subscriptions.secret` em texto claro para `SettingsShell` (`settings-shell.tsx:164`).
- **`[P1-SEC-02]` Gaps no `middleware.ts`:** `/notifications` ausente de `PROTECTED_PREFIXES` (`linhas 37-45`); `catch` retorna `response` em erros não-AuthApiError (`linhas 225-227`); `safeNext` (`linhas 73-77`) aceita `//evil.com`.
- **`[P1-SEC-03]` Webhooks Meta vs Instagram e `timingSafeEqual`:** `Buffer.from(actualSignature, 'hex')` com string não-hex de 64 chars produz buffer `< 32` bytes e causa `RangeError` (`500`). `/api/webhooks/instagram` processa dentro de `after()` (`linha 126`) antes de gravar no `message_buffer`, descarta mensagens em `isLimitReached` (`linha 204`) e roda `routeMedia` síncrono.
- **`[P1-SEC-04]` Rate limit não-atômico (`lib/rate-limit.ts:31-36`):** `incr` + `expire` em duas chamadas separadas deixa chaves permanentes sem TTL se o segundo comando falhar.
- **`[P1-SEC-05]` RLS `019`/`079`, SSRF e `whatsapp/test`:**
  - `019`: `prompt_versions`, `prompt_experiments` e `company_knowledge` permitem escrita por `role = 'member'` e usam `auth.uid()` direto.
  - `079`: `user_notification_settings` usa `auth.uid()` sem InitPlan e não checa vínculo com `company_id`.
  - `url-guard.ts` / `dispatcher.ts:99`: sem `dns.lookup` pós-resolução, sem bloqueio CGNAT `100.64.0.0/10` e sem `redirect: 'error'` (bypass via HTTP 302). `media-router.ts:79` e `transcribe.ts:24` fazem `fetch(mediaId)` sem validar domínio Meta.
  - `app/api/whatsapp/test/route.ts:31, 43`: lê coluna `access_token` (nula após Vault `068`) em vez de chamar `channel_get_access_token`.
- **`[P1-SEC-06]` `createAdminClient()` excessivo + N+1 + Cache:**
  - `inbox/page.tsx:43-66` faz N+1 de `createSignedUrl` com `createAdminClient()` em vez de `createSignedUrls` em lote via `createClient()` (pós-policy Storage por tenant).
  - `reports/page.tsx:164`, `inbox/actions.ts:192`, `invitations/actions.ts:322` usam `createAdminClient()` sem necessidade.
  - `meta/webhook/route.ts:63-90, 187-191` faz 3 round-trips DB/Vault por webhook sem cache Redis.
  - `lib/calendar/google.ts:152` cacheia `gcal:freebusy:*` por 90s, mas `bookAppointment`, `cancelAppointment`, `rescheduleAppointment` e `agenda/actions.ts` nunca invalidam esse cache.
  - `app/api/knowledge/route.ts`: sem checagem de `role` admin ou `limits.hasRAG`, cria `GoogleGenerativeAI` por chunk (`linha 123`), `Promise.race` sem `clearTimeout` (`linha 128`), 200 chamadas unitárias em vez de `batchEmbedContents`.
  - Crons `morning`, `nightly`, `reminders` sem `maxDuration = 300` e com loops sequenciais; `check-channels/route.ts:83` passa `access_token` na URL; `admin/actions.ts:1351` e `agenda/actions.ts:240` interpolam input no `.or(...)` PostgREST sem escape; `leads/actions.ts:35` sem proteção contra CSV formula injection (`=`, `+`, `-`, `@`).

---

## 2. Lista Exata de Arquivos

### 2.1 Criar

| Caminho | Responsabilidade Única |
| :--- | :--- |
| `lib/tenant/context.ts` | `requireTenantContext()` (lê cookie `agendra_active_company` validado contra `memberships` do usuário; prioriza empresa com onboarding completo sobre empresa fantasma; valida `role` por tenant) + `switchActiveCompany()` |
| `lib/security/crypto-compare.ts` | `safeTimingEqualHex`, `safeTimingEqualText`, `verifyBearerSecret` (sem `RangeError`) |
| `lib/security/client-ip.ts` | `getTrustedClientIp(headers)` usando `x-vercel-forwarded-for` / `x-real-ip` |
| `lib/security/oauth-state.ts` | `createSignedOAuthState` e `verifySignedOAuthState` (HMAC-SHA256 + nonce cookie `httpOnly`) |
| `lib/security/csv.ts` | `sanitizeCsvCell` (proteção formula injection) + `escapePostgrestLike` para filtros `.or()` |
| `lib/channels/webhook-ingress.ts` | Pipeline unificado Meta (WhatsApp + Instagram): validação HMAC multi-app secret, cache de canal, flood guard atômico, dedup e enfileiramento durável |
| `lib/channels/channel-cache.ts` | Cache Redis de metadados do canal + status de assinatura (`120s` TTL) com cifragem AES-256-GCM em memória/cache para token e invalidação em mutações |
| `supabase/migrations/083_security_rls_vault_and_indexes_hardening.sql` | Migration consolidada de RLS, lockdown `SECURITY DEFINER`, OTP atômico com hash + tentativas, `handle_new_user` para convites, Vault GCal, `storage.objects` RLS e índices compostos |

### 2.2 Modificar

| Caminho | Mudança Exata |
| :--- | :--- |
| `middleware.ts` | Adicionar `"/notifications"` a `PROTECTED_PREFIXES`; tornar `catch` **fail-closed** para `PROTECTED_PREFIXES` e `ADMIN_PREFIX`; bloquear `//` e `\` em `safeNext` |
| `lib/infra/redis.ts` & `lib/rate-limit.ts` | Implementar Lua script `rateLimitIncr` (`INCR` + `PEXPIRE` atômico com auto-healing `PTTL == -1`) |
| `lib/supabase/server.ts` | Atualizar `getActiveCompanyId` / `getActiveMembership` para ler cookie ativo e remover preferência cega ao índice `0` |
| Todos os **20 arquivos com `memberships?.[0]`** (`app/(app)/layout.tsx`, `inbox/{page,actions}.ts*`, `agenda/{page,actions}.ts*`, `leads/{page,actions}.ts*`, `reports/{page,actions}.ts*`, `notifications/page.tsx`, `settings/{page,actions}.ts*`, `settings/invitations/actions.ts`, `settings/services/actions.ts`, `onboarding/{layout,actions}.ts*`, `api/knowledge/route.ts`, `api/whatsapp/test/route.ts`, `components/app/sidebar.tsx`, `lib/security/audit.ts`, `app/admin/actions.ts`) | Substituir `memberships?.[0]` por `requireTenantContext()` ou `getActiveCompanyId(profile, targetCompanyId)` |
| `app/api/auth/google/route.ts` & `lib/calendar/google.ts` | Exigir sessão `owner`/`admin`; usar `oauth-state.ts`; migrar leitura/escrita de `google_refresh_token` para Vault (`company_get_gcal_token` / `company_set_gcal_token`); adicionar version key `gcal:fbver:{companyId}` para invalidar `gcal:freebusy` em O(1) |
| `app/api/auth/instagram/route.ts` & `app/api/auth/instagram/callback/route.ts` | Exigir sessão `owner`/`admin` no callback e validar `state` via `oauth-state.ts` |
| `app/api/auth/{signup,send-otp,verify-otp,send-reset,reset-password}/route.ts` | Usar `getTrustedClientIp`, hash SHA-256 de OTP, RPC `verify_otp_atomic` (máx. 5 erros), e consulta em `public.users` em `signup` (sem `listUsers()`) |
| `app/api/meta/webhook/route.ts` & `app/api/webhooks/instagram/route.ts` | Delegar ambos ao `webhook-ingress.ts` (sem `after()` pré-buffer; billing limit tratado no engine ou fallback consistente) |
| `app/api/whatsapp/test/route.ts` | Exigir `owner`/`admin` via `requireTenantContext({ requireAdmin: true })` e ler token via `channel_get_access_token` |
| `app/(app)/settings/page.tsx` & `app/(app)/settings/actions.ts` | Remover `secret` do `SELECT` de `webhook_subscriptions` no RSC; retornar secret uma única vez na criação |
| `app/(app)/inbox/page.tsx`, `app/(app)/reports/page.tsx`, `app/(app)/inbox/actions.ts`, `app/(app)/settings/invitations/actions.ts` | Substituir `createAdminClient()` por `createClient()` com RLS; em `inbox/page.tsx`, trocar loop `createSignedUrl` por `supabase.storage.from('inbox-media').createSignedUrls(paths, 86400)` |
| `app/api/knowledge/route.ts` | Exigir `owner`/`admin` + `limits.hasRAG`, usar `batchEmbedContents` (lotes de 50) com `AbortController` + `clearTimeout` e singleton `GoogleGenerativeAI` |
| `app/api/cron/{morning,nightly,check-channels,followup,reminders,gcal-sync,flush-buffer}/route.ts` | Usar `verifyBearerSecret`, definir `maxDuration = 300`, corrigir `morning` para diferenciar `whatsapp` vs `instagram`, mover token Instagram do `check-channels` para header `Authorization: Bearer`, e limitar concorrência com pool de 5 promises + time budget |
| `app/api/stripe/{checkout,portal,sync,webhook}/route.ts` | Validar `role IN ('owner', 'admin')` e `requireTenantContext()`; rejeitar `priceId` inválido com HTTP `400` |
| `lib/security/url-guard.ts`, `lib/webhooks/dispatcher.ts`, `lib/ai/media-router.ts`, `lib/ai/transcribe.ts`, `lib/ai/tools.ts` | Bloquear `100.64.0.0/10`, validar `dns.lookup` em `url-guard`, `redirect: 'error'` em `dispatcher.ts`, allowlist de hosts Meta em `media-router.ts`/`transcribe.ts`, `after(() => dispatchWebhook(...))` em `tools.ts` |
| `app/(app)/leads/actions.ts`, `app/(app)/agenda/actions.ts`, `app/admin/actions.ts` | Usar `sanitizeCsvCell` e `escapePostgrestLike` |

### 2.3 Remover / Depreciar

| Caminho / Coluna | Estratégia sem Downtime |
| :--- | :--- |
| `public.channels.access_token` & `public.companies.google_refresh_token` | Manter fallback de leitura durante a Fase 2; após backfill para Vault na migration `083` e validação de 30 dias, remover colunas em migration posterior |
| Código duplicado em `app/api/webhooks/instagram/route.ts` | Reduzir a wrapper de ~25 linhas chamando `handleMetaWebhookRequest(req, { providerOverride: 'instagram' })` preservando o endpoint para o Meta App |

---

## 3. Contratos, Interfaces e Schemas Principais

### 3.1 Contexto Multi-Tenant Canônico (`lib/tenant/context.ts`)

```typescript
import { z } from 'zod';

export type MembershipRole = 'owner' | 'admin' | 'member' | 'user';

export interface TenantContext {
  userId: string;
  userEmail: string;
  companyId: string;
  role: MembershipRole;
  isAdmin: boolean;
  memberships: Array<{ company_id: string; role: MembershipRole }>;
}

export const ACTIVE_COMPANY_COOKIE = 'agendra_active_company';

export const SwitchCompanySchema = z.object({
  companyId: z.string().uuid(),
});
```

### 3.2 Lua Script Atômico de Rate Limit (`lib/infra/redis.ts` / `lib/rate-limit.ts`)

```lua
-- rateLimitIncr(KEYS[1] = "rl:" .. key, ARGV[1] = windowMs)
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
elseif redis.call('PTTL', KEYS[1]) == -1 then
  -- Auto-healing de chaves órfãs criadas antes desta correção
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
```

### 3.3 Mapa de Chaves Redis e TTLs

| Chave | Valor | TTL | Invalidação |
| :--- | :--- | :--- | :--- |
| `rl:{scope}:{identifier}` | Contador inteiro | `windowMs` (via `PEXPIRE`) | Expiração automática |
| `cache:ch:route:{provider}:{providerId}` | `{ id, companyId, status, subscriptionStatus, encToken }` (AES-256-GCM) | `120s` | `saveWhatsAppChannel`, `disconnectChannel`, `toggleCompanyAI`, `stripe/webhook`, OAuth Instagram |
| `cache:usage:{companyId}` | `CompanyUsage` JSON | `45s` | `invalidateUsageCache(companyId)` em `stripe/webhook`, `stripe/sync`, `admin/actions` |
| `gcal:token:{companyId}` | `access_token` cifrado | `3000s` | `disconnectGCal` / `invalid_grant` |
| `gcal:fbver:{companyId}` | Contador monotonic `INCR` | `86400s` | `bookAppointment`, `cancelAppointment`, `rescheduleAppointment`, `agenda/actions.ts`, `/api/sync/gcal` |
| `gcal:freebusy:{companyId}:{calendarId}:{ver}:{min}:{max}` | `BusySlot[]` JSON | `90s` (`backup` `4h`) | Invalidação O(1) ao incrementar `gcal:fbver:{companyId}` |

### 3.4 Migration `supabase/migrations/083_security_rls_vault_and_indexes_hardening.sql`

```sql
-- 1. RLS obrigatório em admin_login_attempts (corrige P0-SEC-01)
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_login_attempts: deny all" ON public.admin_login_attempts;
CREATE POLICY "admin_login_attempts: deny all"
  ON public.admin_login_attempts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 2. Lockdown de SECURITY DEFINER pós-062 (corrige P0-SEC-02 e trigger 079)
REVOKE ALL ON FUNCTION public.channel_set_access_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.channel_set_access_token(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_membership_notification_settings() FROM PUBLIC, anon, authenticated;

-- 3. Vault para Google Calendar refresh token (corrige P0-SEC-03)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS google_refresh_token_secret_id UUID;

CREATE OR REPLACE FUNCTION public.company_set_gcal_token(p_company_id UUID, p_refresh_token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_old UUID; v_new UUID;
BEGIN
  SELECT google_refresh_token_secret_id INTO v_old FROM public.companies WHERE id = p_company_id;
  v_new := vault.create_secret(p_refresh_token, 'gcal_' || p_company_id::text);
  UPDATE public.companies SET google_refresh_token_secret_id = v_new, google_refresh_token = NULL WHERE id = p_company_id;
  IF v_old IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_old; END IF;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.company_set_gcal_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_set_gcal_token(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.company_get_gcal_token(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_secret UUID; v_token TEXT;
BEGIN
  SELECT google_refresh_token_secret_id, google_refresh_token INTO v_secret, v_token FROM public.companies WHERE id = p_company_id;
  IF v_secret IS NULL THEN RETURN v_token; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE id = v_secret;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.company_get_gcal_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_get_gcal_token(UUID) TO service_role;

-- 4. OTP com hash + contagem atômica de tentativas (corrige P0-SEC-04)
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.verify_otp_atomic(
  p_email TEXT,
  p_purpose TEXT,
  p_code_hash TEXT,
  p_max_attempts INT DEFAULT 5
) RETURNS TABLE (valid BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.otp_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.otp_codes
  WHERE email = p_email AND purpose = p_purpose AND used = false
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'; RETURN; END IF;
  IF v_row.expires_at < now() THEN
    UPDATE public.otp_codes SET used = true WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'expired'; RETURN;
  END IF;
  IF v_row.attempts >= p_max_attempts THEN
    UPDATE public.otp_codes SET used = true WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'max_attempts'; RETURN;
  END IF;
  IF COALESCE(v_row.code_hash, '') <> p_code_hash THEN
    UPDATE public.otp_codes
    SET attempts = attempts + 1, used = (attempts + 1 >= p_max_attempts)
    WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'mismatch'; RETURN;
  END IF;

  UPDATE public.otp_codes SET used = true WHERE id = v_row.id;
  RETURN QUERY SELECT true, 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.verify_otp_atomic(TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp_atomic(TEXT, TEXT, TEXT, INT) TO service_role;

-- 5. Evita empresa fantasma para usuários convidados via inviteUserByEmail (corrige P0-SEC-05)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id UUID; v_company_name TEXT; v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  IF NULLIF(TRIM(new.raw_user_meta_data->>'invited_company_id'), '') IS NOT NULL THEN
    INSERT INTO public.users (id, email, full_name, company_id)
    VALUES (new.id, new.email, v_full_name, NULL)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
  END IF;

  v_company_name := COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'company_name'), ''), split_part(new.email, '@', 2));
  INSERT INTO public.companies (name, plan_type, subscription_status) VALUES (v_company_name, 'trial', 'trial') RETURNING id INTO v_company_id;
  INSERT INTO public.users (id, email, full_name, company_id) VALUES (new.id, new.email, v_full_name, v_company_id);
  INSERT INTO public.memberships (user_id, company_id, role) VALUES (new.id, v_company_id, 'owner');
  RETURN new;
END;
$$;

-- 6. Hardening RLS em 019 (is_company_admin + InitPlan) e 079 (InitPlan + membership check)
DROP POLICY IF EXISTS "prompt_versions: insert own company" ON public.prompt_versions;
DROP POLICY IF EXISTS "prompt_versions: update own company" ON public.prompt_versions;
CREATE POLICY "prompt_versions: admin write" ON public.prompt_versions FOR ALL
  USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "company_knowledge: insert own company" ON public.company_knowledge;
DROP POLICY IF EXISTS "company_knowledge: update own company" ON public.company_knowledge;
DROP POLICY IF EXISTS "company_knowledge: delete own company" ON public.company_knowledge;
CREATE POLICY "company_knowledge: admin write" ON public.company_knowledge FOR ALL
  USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

DROP POLICY IF EXISTS "user_notification_settings: select own" ON public.user_notification_settings;
DROP POLICY IF EXISTS "user_notification_settings: update own" ON public.user_notification_settings;
DROP POLICY IF EXISTS "user_notification_settings: insert own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings: select own" ON public.user_notification_settings FOR SELECT
  USING (user_id = (SELECT auth.uid()) AND company_id IN (SELECT public.get_my_company_ids()));
CREATE POLICY "user_notification_settings: write own" ON public.user_notification_settings FOR ALL
  USING (user_id = (SELECT auth.uid()) AND company_id IN (SELECT public.get_my_company_ids()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND company_id IN (SELECT public.get_my_company_ids()));

-- 7. Storage RLS para bucket privado inbox-media (permite assinar URLs com createClient() sem admin)
DROP POLICY IF EXISTS "inbox_media: select own company" ON storage.objects;
CREATE POLICY "inbox_media: select own company" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inbox-media' AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_company_ids()));

DROP POLICY IF EXISTS "inbox_media: insert own company" ON storage.objects;
CREATE POLICY "inbox_media: insert own company" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inbox-media' AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_company_ids()));

-- 8. Índices compostos de alta frequência (corrige P2-SEC-02)
CREATE INDEX IF NOT EXISTS messages_company_lead_created_idx ON public.messages (company_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_company_last_msg_idx ON public.leads (company_id, last_message_at DESC NULLS LAST, updated_at DESC);
CREATE INDEX IF NOT EXISTS events_company_active_window_idx ON public.events (company_id, start_time, end_time) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ai_logs_company_created_idx ON public.ai_logs (company_id, created_at DESC);
```

---

## 4. Ordem Segura de Execução (Fases e Rollout)

1. **Fase 1 — Contenção P0 Imediata (Sem quebra de contrato)**
   - Aplicar a migration `083` (após confirmação do usuário) para fechar `admin_login_attempts`, `channel_set_access_token` e `verify_otp_atomic`.
   - Publicar patch de `middleware.ts` (fail-closed + `/notifications` + `safeNext`), `morning/route.ts` (filtro `whatsapp` vs `instagram`), `oauth-state.ts` (Google + Instagram), `verify-otp`/`reset-password`/`signup` e Lua `rateLimitIncr`.
   - **Rollback:** Revert do deploy Next.js; objetos SQL da migration `083` são retrocompatíveis (mantêm fallback enquanto `google_refresh_token` existir).

2. **Fase 2 — Isolamento Multi-Tenant e Proteção de Segredos**
   - Implantar `lib/tenant/context.ts` e migrar todos os 20 arquivos com `memberships?.[0]`.
   - Passar `invited_company_id` em `inviteUserByEmail` (`team.actions.ts`) alinhado com o novo `handle_new_user()`.
   - Remover `webhook_subscriptions.secret` de `app/(app)/settings/page.tsx`, corrigir `app/api/whatsapp/test/route.ts` (Vault RPC) e endurecer `app/api/stripe/{checkout,sync}/route.ts`.
   - **Rollback:** Cookie `agendra_active_company` é opcional (fallback determinístico para primeira membership não-fantasma).

3. **Fase 3 — Unificação de Webhooks e Remoção de `createAdminClient()` em UI**
   - Implantar `lib/channels/webhook-ingress.ts` compartilhado entre `/api/meta/webhook` e `/api/webhooks/instagram`.
   - Migrar `inbox/page.tsx` para `createSignedUrls` em batch via `createClient()` (usando a nova policy `inbox-media: select own company`) e remover `createAdminClient()` de `reports/page.tsx`, `inbox/actions.ts` e `invitations/actions.ts`.
   - **Rollback:** Feature toggle por endpoint apontando de volta para o parser antigo em caso de anomalia no Meta App Instagram.

4. **Fase 4 — Performance, Cache Distribuído e Crons Concorrentes**
   - Ativar `channel-cache.ts`, versionamento `gcal:fbver:{companyId}` para Free/Busy, `batchEmbedContents` em `/api/knowledge` e pool limitado (`pLimit(5)`) nos crons.
   - **Rollback:** Desabilitar `channel-cache` via env `DISABLE_CHANNEL_CACHE=true` para ler direto do Postgres/Vault.

---

## 5. Critérios de Validação e Aceite

- **Testes Vitest (`pnpm test`):**
  - `lib/tenant/__tests__/context.test.ts`: usuário com 2 empresas (incluindo empresa fantasma) sempre resolve o tenant ativo correto e rejeita acesso `admin` quando o papel no tenant selecionado é `member`.
  - `lib/security/__tests__/oauth-state.test.ts`: rejeição de `state` sem assinatura, expirado, adulterado ou com cookie mismatch.
  - `lib/security/__tests__/url-guard-ssrf.test.ts`: bloqueio de `100.64.0.1`, `169.254.169.254`, `127.0.0.1`, DNS apontando para IP privado e redirects HTTP 302.
  - `lib/infra/__tests__/rate-limit-atomic.test.ts`: execução do Lua `rateLimitIncr` garantindo TTL sempre positivo (`> 0`).
  - `lib/auth/__tests__/otp-bruteforce.test.ts`: bloqueio na 6ª tentativa errada em `verify_otp_atomic` e comparação com `code_hash`.
  - `app/api/meta/__tests__/webhook-ingress.test.ts`: assinatura hex malformada retornando `401` (nunca `500`), deduplicação unificada WhatsApp/Instagram.
- **Verificações de Segurança no Banco & Código:**
  - Query SQL confirmando `0` tabelas no schema `public` com `relrowsecurity = false`.
  - Query SQL confirmando que `channel_set_access_token`, `company_set_gcal_token`, `company_get_gcal_token` e `verify_otp_atomic` possuem `EXECUTE` apenas para `service_role`.
  - Busca global (`Select-String` / `rg`) retornando `0` ocorrências de `memberships?.[0]` ou `memberships[0]` fora de testes.
  - Inspeção do payload HTML/RSC de `/settings?tab=automation` garantindo ausência da propriedade `secret`.
- **Pipeline Obrigatório:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` sem falhas.

---

## Ajustes da Auditoria Cruzada

Verificação direta no código-fonte antes da execução identificou os seguintes ajustes práticos sobre o plano original:

1. **`zod` e `082` já existentes:** `zod` (`^4.6.7`) já consta em `package.json` e `supabase/migrations/082_atomic_turn_lock_and_buffer_claim.sql` já existe; a migration consolidada de hardening será a `083_security_rls_vault_and_indexes_hardening.sql`.
2. **Modularização prévia de Actions e Tools:** `app/(app)/settings/actions.ts` e `app/admin/actions.ts` já foram extraídos em `app/(app)/settings/actions/*.ts` e `app/admin/actions/*.ts`; os dispatches de webhook estão em `lib/ai/tools/scheduling-tools.ts`.
3. **Convites (`handle_new_user`):** `app/(app)/settings/actions/team.actions.ts` envia `data: { company_id, invited_role }` em `inviteUserByEmail`; passará a enviar também `invited_company_id` e `handle_new_user()` aceitará ambos (`invited_company_id` e `company_id`) para manter compatibilidade com convites já emitidos.
4. **Schema de `otp_codes`:** A coluna `code` possui `NOT NULL` em `003`; a migration `083` executará `ALTER TABLE public.otp_codes ALTER COLUMN code DROP NOT NULL` para permitir gravar apenas `code_hash`.
5. **Storage RLS (`inbox-media`):** Comparar `(storage.foldername(name))[1]` como `TEXT` contra `id::text` de `public.get_my_company_ids()` para evitar erros de cast `::uuid` em paths não-UUID.
6. **Hardening completo da `019`:** Além de `prompt_versions` e `company_knowledge`, incluir restrição `is_company_admin(company_id)` para escrita em `prompt_experiments` e `InitPlan` nas policies `SELECT` das três tabelas.
7. **Vault do Google Calendar:** Atualizar todos os leitores/verificadores de `google_refresh_token` (`agenda/page.tsx`, `agenda/actions.ts`, `api/auth/google/route.ts`, `api/cron/gcal-sync/route.ts`, `api/cron/morning/route.ts`, `lib/billing/gate.ts`, `lib/calendar/sync.ts`) para considerar `google_refresh_token_secret_id` e usar `company_get_gcal_token` com fallback.
8. **Queries `.single()` em `memberships`:** `api/auth/google/route.ts`, `api/auth/instagram/route.ts`, `api/stripe/portal/route.ts` e `api/stripe/sync/route.ts` quebram para usuários com 2+ empresas por usarem `.single()`; todos migrarão para `requireTenantContext`.
9. **Webhooks Meta/Instagram:** `lib/channels/webhook-ingress.ts` receberá `appSecretEnv` e `verifyTokenEnv` distintos por endpoint (`WHATSAPP_*` vs `INSTAGRAM_*`) preservando ambos os Meta Apps em produção.
