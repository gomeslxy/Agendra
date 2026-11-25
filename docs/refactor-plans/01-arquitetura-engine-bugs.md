# Plano de Refatoração 01 — Arquitetura da Engine de IA, Concorrência e Correção de Bugs Críticos

> **Escopo:** Motor agêntico (`lib/ai/*`), coordenação de debounce/fila (`debounce.ts`, `buffer-flush.ts`, Redis, QStash), rotas de flush, adapters multi-provider, sanitização e decomposição dos monólitos de Server Actions (`app/admin/actions.ts`, `app/(app)/settings/actions.ts`).
> **Stack Alvo:** Next.js `16.2.6` (App Router), React `19.0.0`, TypeScript `5.7.2` (`strict: true`), `@supabase/supabase-js@2.105.3`, `ioredis@5.11.0`, `@upstash/qstash@2.11.0`, `@google/generative-ai@^0.24.1`, `openai@6.38.0`, `vitest@4.1.5`, `pnpm@11.1.3`.
> **Dependência Obrigatória a Instalar:** `zod` (`pnpm add zod`) — **atualmente ausente no `package.json`**.

---

## 1. Diagnóstico Objetivo

### Tabela Resumo de Achados

| ID | Severidade | Evidência no Código | Sintoma / Causa Raiz | Impacto em Produção |
| :--- | :--- | :--- | :--- | :--- |
| `P0-ENG-01` | **P0 Crítico** | `lib/ai/debounce.ts:293-313` vs `lib/ai/engine.ts:876-926` | `flushBuffer` ignora retorno `'requeued'` de `handleIncomingMessage` e marca `flushed = true` na linha recém-reagendada | **Perda permanente de mensagens** do lead em lock contention |
| `P0-ENG-02` | **P0 Crítico** | `lib/ai/engine.ts:899-908` vs `app/api/cron/flush-buffer/route.ts:24` | QStash fast-requeue envia `POST` para rota que exporta apenas `GET` | **HTTP 405** em 100% dos fast-requeues |
| `P0-ENG-03` | **P0 Crítico** | `lib/ai/engine.ts:798-819` vs `821-838` | Rate limit de 1s checa `leads.last_message_at` (atualizado pelo Worker 1 no lock) **antes** do lock/requeue | **Descarte silencioso** de mensagens enviadas `<1s` após início de outro turno |
| `P0-ENG-04` | **P0 Crítico** | `lib/ai/engine.ts:943-986` | Fallback de `INSERT` concorrente em `leads` faz re-`SELECT` sem adquirir lock `is_processing` | **Dupla execução** paralela no mesmo lead recém-criado e corrupção de memória |
| `P0-ENG-05` | **P0 Crítico** | `lib/ai/debounce.ts:174, 281-282, 298` vs `lib/ai/buffer-flush.ts:103` & `lib/infra/redis.ts:152` | Desalinhamento `lastItem` vs `items[0]` + `redis.get` não-atômico + `pre_ids` drenado antes do turno + áudio/imagem pré-salvo vazio | **Respostas duplicadas** entre QStash e `pg_cron`, duplicação de histórico no retry, bolhas vazias de mídia |
| `P0-ENG-06` | **P0 Crítico** | `lib/ai/tools.ts:896`, `app/admin/actions.ts:816, 833, 982` | `handleRequestHumanAgent` grava `status: 'manual'` inválido; `inspectLeadByPhone` e `getCompanyChannelDetails` consultam colunas inexistentes | Falha em constraints/filtros de CRM e **quebra de 100%** dos diagnósticos Admin |
| `P1-ENG-01` | **P1 Alto** | `lib/channels/send.ts:179`, `lib/ai/sanitizer.ts:91, 95, 98-116`, `lib/ai/tools.ts:920-941` | `sanitizeClientResponse` roda em mensagens humanas e apaga blocos ```` ```...``` ```` do Pix Copia e Cola; `handleGeneratePixCharge` usa mock | **Corrupção de URLs/UUIDs** enviados por humanos e **apagamento total** do código Pix |
| `P1-ENG-02` | **P1 Alto** | `lib/ai/engine.ts:111-313, 484-553`, `lib/ai/memory.ts:130-145`, `lib/ai/media-router.ts:126` | Parsing morto/frágil de `---JSON---` / `lastIndexOf('{')` e `JSON.parse` sem Zod | `heat_score`/`summary` estagnados no turno; exceções em JSON malformado |
| `P1-ENG-03` | **P1 Alto** | `lib/ai/tools.ts:47-226`, `lib/ai/tool-schemas.ts:1-188`, adapters, `router.ts:47-94`, `engine.ts:463-507` | Schemas duplicados, zero validação Zod de args e reexecução de tools mutáveis em fallback/retry | **Agendamentos duplicados** no GCal/DB em retries ou auto-correção |
| `P1-ENG-04` | **P1 Alto** | `lib/ai/engine.ts:380-383, 581-586, 1009, 1056-1068` | Histórico buscado 10/15 mas truncado fixo em `.slice(-5)`; mutação in-place de `persona`; regex de 3 frases | **Amnésia conversacional** e truncamento de valores (`R$ 1.200.00`), abreviações (`Dr.`) e URLs |
| `P1-ENG-05` | **P1 Alto** | `lib/ai/engine.ts:435-441, 1436, 1456-1458`, `lib/ai/observability.ts:4-15`, adapters | `technicalIndicators` copiado em 5 arquivos; `chain_kind` divergente; custo/chain imprecisos | Falso masking de erros de validação de LLM e telemetria/custo incorretos |
| `P2-ENG-01` | **P2 Médio** | `lib/ai/engine.ts:100-109` | `formatTimeElapsed` calcula `minutes` mas nunca retorna minutos | Prompt exibe `"2700 segundos"` em vez de `"45 minutos"` |
| `P2-ENG-02` | **P2 Médio** | `lib/ai/engine.ts:1602`, `lib/ai/tools.ts:314, 558`, `media-router.ts:122`, `transcribe.ts:79, 100` | `Promise.race` com `setTimeout` sem `clearTimeout` / `AbortController` | Timers e sockets HTTP órfãos em serverless |
| `P2-ENG-03` | **P2 Médio** | `app/admin/actions.ts` (1.361 linhas), `app/(app)/settings/actions.ts` (1.081 linhas) | Monólitos sem Zod e `PLAN_MAX` hardcoded (`admin/actions.ts:1022`) divergente de `plans.ts` | Alta acoplagem, quotas divergentes no Admin e difícil manutenção |

---

### Detalhamento Técnico das Causas Raízes

#### P0 Crítico

1. **`[P0-ENG-01]` Sobrescrita destrutiva do `requeue` em `lib/ai/debounce.ts:293-313`**
   - **Confirmação:** Confirmado. Em `lib/ai/engine.ts:876-926`, quando um worker encontra o lead com `is_processing = true` e lock fresco (`< STALE_LOCK_MS`), ele faz `upsert` na tabela `message_buffer` com `flushed: false` e `flush_after` futuro (backoff exponencial `5s * 2^requeueCount`, teto `60s`), deleta o claim em `processed_messages` (`linha 917-920`) e retorna `'requeued'` (`linha 926`).
   - **Falha:** `flushBuffer` (`lib/ai/debounce.ts:293-313`) não captura o retorno de `handleIncomingMessage` e executa incondicionalmente `admin.from('message_buffer').update({ flushed: true }).in('provider_message_id', items.map((i) => i.provider_message_id))`. Enquanto `lib/ai/buffer-flush.ts:113-127` trata explicitamente `if (outcome === 'requeued')`, o fluxo principal de produção (QStash → `/api/internal/flush` → `flushBuffer`) marca a linha recém-reagendada como `flushed = true`, tornando-a invisível para `flushMessageBuffer` (`pg_cron`).

2. **`[P0-ENG-02]` HTTP 405 no Fast-Requeue via QStash (`lib/ai/engine.ts:899-908` vs `app/api/cron/flush-buffer/route.ts:24`)**
   - **Confirmação:** Confirmado. `qstashClient().publishJSON({ url: `${publicBaseUrl()}/api/cron/flush-buffer`, ... })` emite HTTP `POST`, mas `app/api/cron/flush-buffer/route.ts` exporta somente `export async function GET(...)`. Todo agendamento de fast-requeue retorna `405 Method Not Allowed` ao QStash.

3. **`[P0-ENG-03]` Descarte falso-positivo pelo rate limit de 1s em `leads.last_message_at` (`lib/ai/engine.ts:798-819` vs `821-838`)**
   - **Descoberta adicional:** Ao adquirir o lock na `linha 824`, o Worker 1 grava `last_message_at: new Date().toISOString()`. Se um segundo worker (ex.: nova mensagem enviada 400ms depois pelo lead que escapou da janela de debounce) lê o lead antes do lock check (`linha 831`), ele cai em `if (ageMs < 1000)` (`linha 800`), marca `processed_messages.status = 'completed'` (`linha 814`) e aborta sem enfileirar nem responder. O próprio teste unitário `lib/ai/__tests__/lock-requeue.test.ts:41` precisou forjar `last_message_at: Date.now() - 60_000` para que o cenário de `requeue` fosse alcançável.

4. **`[P0-ENG-04]` Race na criação concorrente de lead (`lib/ai/engine.ts:943-986`)**
   - **Confirmação:** Confirmado. Na `linha 943`, dois workers simultâneos para um lead inédito executam `SELECT` (`linha 759`) recebendo `null`, e ambos disparam `INSERT` (`linha 945`). Um vence e fica com `is_processing: true`; o perdedor colide no índice único `leads_company_phone_unique` (`supabase/migrations/078_leads_unique_phone_per_company.sql:57-59`), entra no `else` (`linha 961`), executa re-`SELECT` (`linha 967-974`) e segue com `activeLead = existing` **sem adquirir lock** e **sem fazer requeue**, executando o turno de IA em paralelo e soltando o lock do primeiro worker na `linha 1420`.

5. **`[P0-ENG-05]` Desalinhamento de chave de idempotência e drenagem não-atômica em Redis (`lib/ai/debounce.ts:174, 281-282, 298` vs `lib/ai/buffer-flush.ts:103` & `lib/infra/redis.ts:152`)**
   - **Confirmação:** Confirmado e ampliado:
     - Em lote de `N >= 2` mensagens, `flushBuffer` (`debounce.ts:298`) envia `lastItem.provider_message_id` enquanto `flushMessageBuffer` (`buffer-flush.ts:103`) envia `items[0].provider_message_id`. Drenagens concorrentes inserem chaves distintas em `processed_messages` e respondem duas vezes.
     - `redis.claimAndFlush` (`lib/infra/redis.ts:152-175`) nunca é invocado. `flushBuffer` faz `redis.get(tokenKey)` (`debounce.ts:174`) e só deleta na `linha 316` ao final do turno; duas entregas concorrentes do QStash passam pela guarda de geração simultaneamente.
     - `preIdsKey` (`debounce.ts:281-282`) sofre `lrange` + `del` **antes** do engine rodar: se o turno lançar erro transitório e QStash retentar, `prePersistedIds` vem vazio e a mensagem do usuário é reinserida duplicada em `messages` (`engine.ts:1101`).
     - Para áudios e imagens, `bufferAndQueueMessage` (`debounce.ts:90-98`) pré-insere `content: ''` (`args.body || ''`) na tabela `messages`, e `flushBuffer` após `routeMedia` (`linhas 235-259`) **nunca atualiza** a linha pré-salva com a transcrição/descrição gerada.

6. **`[P0-ENG-06]` Status inválido em `handleRequestHumanAgent` e colunas inexistentes em `app/admin/actions.ts`**
   - **Descoberta adicional:**
     - `handleRequestHumanAgent` (`lib/ai/tools.ts:896`) grava `status: 'manual'` na tabela `leads`, porém `LeadStatus` (`lib/types/database.ts:1`) e os filtros/check constraints do sistema esperam `'cold' | 'warm' | 'hot' | 'success'` (e `'disqualified'`). O controle humano já é modelado por `is_paused: true` + `control_mode: 'manual'`.
     - `inspectLeadByPhone` (`app/admin/actions.ts:816, 833`) seleciona `leads.intent` e `leads.lead_score` (os nomes reais são `heat_score`, `status`, `lead_memory`) e consulta `processed_messages` filtrando por `lead_id` (`linha 833`, coluna que não existe na tabela — `014_ai_idempotency_and_locks.sql`). `getCompanyChannelDetails` (`app/admin/actions.ts:982`) seleciona `channels.phone_number` (a coluna real é `phone`).

#### P1 Alto

1. **`[P1-ENG-01]` Sanitização cega destruindo links humanos e código Pix (`lib/channels/send.ts:179`, `lib/ai/sanitizer.ts:91, 95, 98-116`, `lib/ai/tools.ts:920-941`)**
   - `sendChannelMessage` sanitiza qualquer texto, inclusive envios manuais de atendentes (`sendNote`). `sanitizer.ts:91` apaga qualquer UUID v4 (quebrando URLs de checkout/documentos/agendamento enviadas pelo operador), `linhas 98-116` removem qualquer `{chave}` e `linha 95` remove blocos ```` ```...``` ```` — apagando o próprio Pix Copia e Cola gerado por `handleGeneratePixCharge` (`tools.ts:938`). Ademais, `handleGeneratePixCharge` gera uma string estática aleatória (`Math.random()`) e usa `api.qrserver.com` externo em vez de gateway real (Stripe Pix / PSP).

2. **`[P1-ENG-02]` Parsing morto `---JSON---` / `lastIndexOf('{')` e `JSON.parse` sem schema (`lib/ai/engine.ts:484-553`, `lib/ai/memory.ts:131`, `lib/ai/media-router.ts:126`)**
   - `buildSystemPrompt` (`engine.ts:111-313`) não solicita mais `---JSON---`, logo `heat_score` e `summary` nunca são extraídos do turno principal (`linhas 513-553` são código morto com risco de falso positivo se o texto contiver `{` e `}`). Em `memory.ts:131` e `media-router.ts:126`, `JSON.parse` é chamado diretamente sem validação Zod em runtime.

3. **`[P1-ENG-03]` Duplicação de schemas de tools, falta de validação runtime e reexecução mutável (`lib/ai/tools.ts:47-226`, `lib/ai/tool-schemas.ts`, adapters, `engine.ts:463-507`)**
   - `baseFunctionDeclarations` / `toolDeclarations` (`tools.ts:47-226`) duplicam `neutralToolDefinitions` (`tool-schemas.ts`). Ambos leem `process.env.ENABLE_FINTECH` uma única vez na carga do módulo.
   - Os 4 adapters (`gemini-adapter.ts`, `groq-adapter.ts`, `cerebras-adapter.ts`, `sambanova-adapter.ts`) invocam `toolHandler(name, args)` sem validar tipos/formatos (ex.: UUIDs, ISO-8601, `amount > 0`) com Zod.
   - Em fallback do `router.ts` (se um provider executou `bookAppointment` mas estourou timeout no turno seguinte da conversa multi-step) ou na 2ª tentativa de auto-correção (`engine.ts:463-507`), não há guarda de idempotência por `(traceId, toolName)`, podendo duplicar eventos no Google Calendar e no PostgreSQL.

4. **`[P1-ENG-04]` Janela de histórico `.slice(-5)`, mutação de `persona` e regex destrutivo de frases (`lib/ai/engine.ts:380-383, 581-586, 1009, 1056-1068`)**
   - `historyLimit` consulta 10 ou 15 mensagens (`linha 1057`, testando um status `'booking_in_progress'` que nunca é atribuído em lugar nenhum), mas `processLeadMessage` descarta tudo antes das últimas 5 (`linha 383`).
   - `persona.extra_instructions` é mutado diretamente (`linha 1009`).
   - `reply.match(/[^.!?…]+[.!?…]+(\s|$)/g)` (`linha 582`) trunca indevidamente abreviações (`Dr.`, `Sr.`, `R$ 150.00`) e links.

5. **`[P1-ENG-05]` `technicalIndicators` duplicado em 5 arquivos e telemetria divergente (`engine.ts:435-441, 1436, 1456-1458`, `observability.ts:4-15`, adapters)**
   - A lista `technicalIndicators` está copiada literalmente em `engine.ts` e nos 4 adapters, contendo palavras comuns em erros de validação (`status`, `api`, `json`, `null`), o que impede o LLM de receber feedback útil para corrigir argumentos inválidos e se repete em dupla camada (`engine.ts` + adapter).
   - `chain_kind` gravado em `ai_logs` (`engine.ts:1436, 1458`) usa regex local diferente de `classifyIntent` (`lib/ai/intent.ts:33`); `provider_chain_used` omite provedores que falharam; e `calculateProviderCost` (`observability.ts:4-15`) aplica tabela do Gemini Flash (`$0.30/$2.50`) para `cerebras` e `sambanova`.

#### P2 Médio

1. **`[P2-ENG-01]` `formatTimeElapsed` ignora minutos (`lib/ai/engine.ts:100-109`)** — Calcula `minutes` na `linha 102`, mas só verifica `days > 0` e `hours > 0`, retornando segundos para intervalos entre 1 e 59 minutos.
2. **`[P2-ENG-02]` `Promise.race` sem `clearTimeout`/`AbortController` (`engine.ts:1602`, `tools.ts:314, 558`, `media-router.ts:122`, `transcribe.ts:79, 100`)** — Timers pendentes seguram handles no runtime Node.js.
3. **`[P2-ENG-03]` Monólitos de Server Actions (`app/admin/actions.ts` e `app/(app)/settings/actions.ts`)** — `app/admin/actions.ts` possui `1.361` linhas e `PLAN_MAX` hardcoded (`linha 1022`: `starter: 500, pro: 2000, business: 10000`) divergente de `PLAN_LIMITS` em `lib/billing/plans.ts` (`starter: 150, pro: 1000, business: 5000`); `app/(app)/settings/actions.ts` possui `1.081` linhas sem validação Zod estruturada.

---

## 2. Lista Exata de Arquivos

### 2.1 Criar

| Caminho | Responsabilidade Única |
| :--- | :--- |
| `lib/ai/turn-orchestrator.ts` | Orquestração da máquina de estados do turno (`handleIncomingMessage`, `triggerAutoFollowUp`), dedup, billing gate, despacho e analytics |
| `lib/ai/turn-lock.ts` | Aquisição atômica de lock por lead (`acquireOrCreateLeadLock`), stale-lock reclaim, requeue em `message_buffer` e `releaseLeadLock` |
| `lib/ai/prompt-builder.ts` | Montagem pura e imutável de `buildSystemPrompt`, `buildPlanContext`, `formatTimeElapsed` (com minutos) e perfil comportamental |
| `lib/ai/rag.ts` | Busca semântica vetorial (`getSemanticKnowledge`) com `AbortController` e retorno imutável de contexto |
| `lib/ai/response-composer.ts` | Divisão `---MSG---`, segmentação segura de frases via `Intl.Segmenter`, watermark e envio texto/TTS/shadow |
| `lib/ai/error-sanitizer.ts` | Fonte única para classificação e sanitização de erros de tools (`ToolValidationError`, `BusinessRuleError`, `sanitizeToolError`) |
| `lib/ai/schemas/analytics.schema.ts` | Schemas Zod para `BackgroundAnalyticsSchema`, `ImageAnalysisSchema` e `FlushJobSchema` |
| `lib/ai/tools/registry.ts` | Fonte única de verdade de definições de tools em Zod + conversores para Gemini/OpenAI + guard de idempotência para tools mutáveis |
| `lib/ai/tools/scheduling-tools.ts` | Handlers de agenda (`listServices`, `get_available_slots`, `bookAppointment`, `cancelAppointment`, `rescheduleAppointment`, `myAppointments`) |
| `lib/ai/tools/crm-tools.ts` | Handlers CRM (`updateLeadInfo`, `updateLeadMemory`, `requestHumanAgent` sem gravar `status: 'manual'`) |
| `lib/ai/tools/payment-tools.ts` | Handlers Pix (`generatePixCharge`, `checkPaymentStatus` bloqueados sem gateway real em produção) |
| `app/admin/actions/auth.actions.ts` | `validateAdminSessionOrThrow`, `verifyAdminPassword`, `logoutAdmin` |
| `app/admin/actions/tenants.actions.ts` | Gestão de tenants (`updateTenantPlan`, `toggleCompanyAI`, `deleteTenant`, `generateTenantMagicLink`, `resetTenantOnboarding`, `forceBypassOnboarding`, `forceCompanyModel`, `toggleTenantRAG`, `sendTenantNotification`, `triggerTenantAnomalyAlert`) |
| `app/admin/actions/diagnostics.actions.ts` | Saúde e inspeção (`checkEnvHealth`, `checkDependencyHealth`, `inspectLeadByPhone`, `getCronJobsHealth`, `forceUnlockStaleLead`, `forceUnlockAllStaleLeads`, `forceUnlockStaleMessage`, `getLatestMigrations`, `searchAdminLeads`) |
| `app/admin/actions/quotas.actions.ts` | Quotas, auditoria e exportação (`extendTenantMessageLimit`, `getCompanyChannelDetails`, `getCompanyQuotaStatus` usando `PLAN_LIMITS`, `getTenantActivityTimeline`, `getTenantStripeInvoices`, `getTenantAuthLogs`, `getTenantDailyUsage`, `exportTenantDataCSV`, `injectTestMessage`) |
| `app/(app)/settings/actions/persona.actions.ts` | `updatePersona`, `getPromptVersions`, `rollbackPromptVersion` com schemas Zod |
| `app/(app)/settings/actions/channels.actions.ts` | `saveWhatsAppChannel`, `completeWhatsAppOnboarding`, `disconnectChannel`, `disconnectWhatsAppChannel` |
| `app/(app)/settings/actions/team.actions.ts` | `updateCompany`, `inviteTeamMember`, `updateUserProfile` |
| `app/(app)/settings/actions/webhooks.actions.ts` | `saveWebhookConfig`, `deleteWebhook` |
| `app/(app)/settings/actions/notifications.actions.ts` | `saveAutomationConfig`, `saveReactivationConfig`, `getUserNotificationSettings`, `saveUserNotificationSettings`, `saveCompanyReminderSettings` |
| `supabase/migrations/082_atomic_turn_lock_and_buffer_claim.sql` | RPCs `acquire_or_create_lead_turn_lock` e `claim_message_buffer_batch` (`FOR UPDATE SKIP LOCKED`) com lockdown `service_role` |

### 2.2 Modificar

| Caminho | Mudança Exata |
| :--- | :--- |
| `package.json` | Instalar `zod` (`pnpm add zod`) em `dependencies` |
| `lib/ai/engine.ts` | Converter em fachada fina (<100 linhas) reexportando `handleIncomingMessage`, `processLeadMessage`, `triggerAutoFollowUp` e `sanitizeClientResponse` |
| `lib/ai/debounce.ts` | Usar `redis.claimFlushGen` atômico; checar `outcome.status === 'requeued'` antes de marcar `flushed = true`; alinhar chave de dedup para `items[0].provider_message_id`; atualizar mensagens pré-salvas com transcrição pós-`routeMedia`; deletar `pre_ids` somente após conclusão do turno |
| `lib/ai/buffer-flush.ts` | Adotar `claim_message_buffer_batch` (`FOR UPDATE SKIP LOCKED`), respeitar `outcome.status === 'requeued'` e alinhar chave `items[0].provider_message_id` |
| `lib/infra/redis.ts` | Adicionar Lua scripts `claimFlushGen` e `popPrePersistedIds` mantendo compatibilidade REST + TCP |
| `app/api/cron/flush-buffer/route.ts` | Exportar `POST` além de `GET`, aceitando assinatura QStash (`verifyQstashSignature`) ou `Authorization: Bearer <CRON_SECRET>` timing-safe |
| `app/api/internal/flush/route.ts` | Validar payload via `FlushJobSchema` (Zod) e tratar `TurnOutcome` |
| `lib/ai/providers/types.ts` | Adicionar `attemptedProviders: ProviderName[]` em `ProviderRouteResult` |
| `lib/ai/providers/router.ts` | Registrar `attemptedProviders` reais e remover `setTimeout` sem limpeza quando aplicável |
| `lib/ai/providers/{gemini,groq,cerebras,sambanova}-adapter.ts` | Remover `technicalIndicators` duplicados; delegar parsing/validação/sanitização ao `registry.ts` e `error-sanitizer.ts` |
| `lib/ai/sanitizer.ts` | Separar `sanitizeAIResponse` (strict LLM) de `sanitizeOutboundText` (seguro para humanos e preservando payload Pix EMV `000201...` sem apagar blocos válidos) |
| `lib/channels/send.ts` | Aceitar opção `{ isHumanOperator?: boolean }` para não destruir URLs/UUIDs enviados por operadores |
| `lib/ai/observability.ts` | Adicionar tabela de preços real para `cerebras` (`gpt-oss-120b`) e `sambanova` (`Meta-Llama-3.3-70B-Instruct`) |
| `lib/ai/memory.ts`, `lib/ai/media-router.ts`, `lib/ai/transcribe.ts` | Validar JSON via Zod (`BackgroundAnalyticsSchema`, `ImageAnalysisSchema`) e substituir `Promise.race` sem cleanup por `AbortController` + `clearTimeout` |
| `app/admin/actions.ts` e `app/(app)/settings/actions.ts` | Transformar em barrels `"use server"` (ou atualizar imports nos call sites) reexportando os sub-módulos; corrigir `inspectLeadByPhone`, `getCompanyChannelDetails`, `forceUnlockStaleLead` e `PLAN_MAX` |

### 2.3 Remover / Depreciar

| Caminho / Símbolo | Estratégia de Migração sem Downtime |
| :--- | :--- |
| `toolDeclarations` / `baseFunctionDeclarations` em `lib/ai/tools.ts:47-226` | Substituído por `toGeminiFunctionDeclarations()` em `lib/ai/tools/registry.ts`; remover assim que os imports forem migrados na Fase 1 |
| `lib/ai/tool-schemas.ts` | Manter re-export de `getNeutralToolDefinitions()` durante a Fase 2; remover arquivo na Fase 4 |
| Bloco `---JSON---` / `lastIndexOf('{')` em `lib/ai/engine.ts:484-496, 513-553` | Remover após validar que `validateAndNormalizeScore` + `processBackgroundAnalytics` cobrem 100% da evolução de `heat_score`, `status` e `summary` |
| `@anthropic-ai/sdk` e `resend` em `package.json` | Verificar zero referências em runtime (`rg "@anthropic-ai/sdk|from 'resend'"`) e remover em PR dedicado de limpeza na Fase 4 |

---

## 3. Contratos, Interfaces e Schemas Principais

### 3.1 Máquina de Estados do Turno Conversacional (`lib/ai/turn-orchestrator.ts`)

```typescript
export type TurnState =
  | 'RECEIVED'
  | 'BUFFERED'
  | 'CLAIMED'
  | 'LOCKED'
  | 'CONTEXT_READY'
  | 'AI_EXECUTING'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'REQUEUED'
  | 'SKIPPED_DEDUP'
  | 'SKIPPED_TAKEOVER'
  | 'FAILED_RETRYABLE'
  | 'FAILED_HANDOFF';

export type TurnOutcome =
  | { status: 'completed'; traceId: string; messageIds: string[] }
  | { status: 'requeued'; traceId: string; nextFlushAt: string; requeueCount: number }
  | { status: 'skipped'; traceId: string; reason: 'dedup' | 'takeover' | 'paused' | 'billing_limit' };

export interface TurnContext {
  readonly traceId: string;
  readonly companyId: string;
  readonly phone: string;
  readonly senderName: string;
  readonly representativeMessageId: string;
  readonly batchMessageIds: string[];
  readonly prePersistedIds: string[];
  readonly attemptCount: number;
  readonly requeueCount: number;
  readonly receivedAtMs: number;
}
```

### 3.2 Fonte Única de Tools e Schemas Runtime (`lib/ai/tools/registry.ts`)

```typescript
import { z } from 'zod';
import type { NeutralToolDefinition } from '@/lib/ai/providers/types';

export interface ToolContext {
  companyId: string;
  leadId: string;
  traceId: string;
}

export interface ToolSpec<TSchema extends z.ZodObject<z.ZodRawShape>, TResult = unknown> {
  name: string;
  description: string;
  /** Tools que alteram estado externo (DB/GCal/Pix) recebem dedup por (traceId, name). */
  mutatesExternalState: boolean;
  /** Avaliada em runtime a cada turno (nunca congelada no module load). */
  isEnabled?: () => boolean;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<TResult>;
}

export const BookAppointmentArgsSchema = z.object({
  service_id: z.string().uuid('service_id deve ser um UUID válido do catálogo'),
  start_time: z.string().datetime({ offset: true, message: 'start_time deve ser ISO 8601 com timezone' }),
  notes: z.string().max(500).optional(),
});

export const GetAvailableSlotsArgsSchema = z.object({
  service_id: z.string().uuid('service_id deve ser um UUID válido'),
  days_ahead: z.number().int().min(1).max(14).optional(),
  date_hint: z.string().max(80).optional(),
  timezone: z.string().min(3).max(64).default('America/Sao_Paulo'),
});

export const BackgroundAnalyticsSchema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'aggressively_cold']).default('neutral'),
  sentiment_score: z.number().min(-1).max(1).default(0),
  intent_detected: z.string().min(1).max(120).default('conversação'),
  urgency_detected: z.boolean().default(false),
  objection_handled: z.string().nullable().default(null),
  rationale: z.string().max(1000).default('Interação padrão.'),
  services: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  answers: z.record(z.string(), z.string()).default({}),
  new_summary: z.string().max(500).optional(),
});

export const FlushJobSchema = z.object({
  companyId: z.string().uuid(),
  leadPhone: z.string().min(4).max(64),
  leadName: z.string().max(200).default(''),
  gen: z.string().min(8).max(64),
});
```

### 3.3 RPCs Atômicas SQL (`supabase/migrations/082_atomic_turn_lock_and_buffer_claim.sql`)

```sql
-- 1. Aquisição atômica ou criação idempotente de lead com lock de turno
CREATE OR REPLACE FUNCTION public.acquire_or_create_lead_turn_lock(
  p_company_id UUID,
  p_phone TEXT,
  p_name TEXT,
  p_channel TEXT DEFAULT 'whatsapp',
  p_channel_id UUID DEFAULT NULL,
  p_stale_after_ms INT DEFAULT 300000
)
RETURNS TABLE (
  acquired BOOLEAN,
  lead_row JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
BEGIN
  -- Garante existência do lead sem race condition (usa índice parcial leads_company_phone_unique)
  INSERT INTO public.leads (
    company_id, name, phone, channel, channel_id,
    lead_memory, is_processing, processing_started_at, followup_count
  )
  VALUES (
    p_company_id,
    COALESCE(NULLIF(TRIM(p_name), ''), p_phone),
    p_phone,
    p_channel,
    p_channel_id,
    '{"timeline":[],"objections_raised":[],"services_mentioned":[],"score_history":[],"last_intent_signal":"","qualification_answers":{}}'::jsonb,
    false,
    NULL,
    0
  )
  ON CONFLICT (company_id, phone) WHERE phone IS NOT NULL DO NOTHING;

  -- Tenta adquirir lock livre OU reclamar lock expirado atomicamente
  UPDATE public.leads
  SET is_processing = true,
      processing_started_at = now(),
      last_message_at = now(),
      followup_count = CASE WHEN control_mode <> 'shadow' THEN 0 ELSE followup_count END
  WHERE company_id = p_company_id
    AND phone = p_phone
    AND (
      is_processing = false
      OR processing_started_at IS NULL
      OR processing_started_at < now() - (p_stale_after_ms * INTERVAL '1 millisecond')
    )
  RETURNING * INTO v_lead;

  IF FOUND THEN
    RETURN QUERY SELECT true, to_jsonb(v_lead);
    RETURN;
  END IF;

  -- Lock ocupado por outro worker saudável → retorna lead atual para inspeção de takeover/requeue
  SELECT * INTO v_lead
  FROM public.leads
  WHERE company_id = p_company_id AND phone = p_phone
  LIMIT 1;

  RETURN QUERY SELECT false, to_jsonb(v_lead);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_or_create_lead_turn_lock(UUID, TEXT, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_or_create_lead_turn_lock(UUID, TEXT, TEXT, TEXT, UUID, INT) TO service_role;

-- 2. Claim atômico de lote do message_buffer (evita colisão entre pg_cron e QStash)
CREATE OR REPLACE FUNCTION public.claim_message_buffer_batch(
  p_row_limit INT DEFAULT 30,
  p_lease_seconds INT DEFAULT 300
)
RETURNS SETOF public.message_buffer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT provider_message_id
    FROM public.message_buffer
    WHERE flushed = false
      AND flush_after <= now()
    ORDER BY created_at ASC
    LIMIT p_row_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.message_buffer mb
  SET flush_after = now() + (p_lease_seconds * INTERVAL '1 second')
  FROM eligible e
  WHERE mb.provider_message_id = e.provider_message_id
  RETURNING mb.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_buffer_batch(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_buffer_batch(INT, INT) TO service_role;
```

### 3.4 Chaves Redis e Lua Scripts Atômicos (`lib/infra/redis.ts`)

| Chave | Tipo | TTL | Finalidade |
| :--- | :--- | :--- | :--- |
| `ch:dedup:{providerMessageId}` | String | `600s` | Deduplicação de entrega Meta |
| `ch:bufgen:{companyId}:{leadPhone}` | String (`gen` ou `flushing:{gen}`) | `60s` / `280s` | Token de geração do debounce + claim exclusivo do flusher |
| `ch:pre_ids:{companyId}:{leadPhone}` | List (`uuid[]`) | `300s` | IDs pré-persistidos em `messages` (drenados apenas no commit do turno) |
| `ch:tool_idem:{traceId}:{toolName}` | String (JSON) | `300s` | Resultado cacheado de tool mutável para impedir dupla execução no mesmo turno |

```lua
-- claimFlushGen(KEYS[1] = tokenKey, ARGV[1] = expectedGen, ARGV[2] = inflightTtlSec)
-- Retorna 1 se este worker ganhou o direito exclusivo de dar flush; 0 se outro gen ou flusher já assumiu.
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], 'flushing:' .. ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
```

---

## 4. Ordem Segura de Execução (Fases e Rollout)

1. **Fase 1 — Pré-requisitos, Zod e Sanitização Central (Zero Downtime)**
   - Instalar `zod` (`pnpm add zod`).
   - Criar `lib/ai/error-sanitizer.ts`, `lib/ai/schemas/analytics.schema.ts` e `lib/ai/tools/registry.ts` mantendo `lib/ai/tools.ts` e `lib/ai/tool-schemas.ts` como shims compatíveis.
   - **Rollback:** Revert de commit único; sem alterações em banco ou filas.

2. **Fase 2 — Coordenação Atômica SQL + Redis + QStash e Correção dos P0 de Requeue**
   - Aplicar migration aditiva `082_atomic_turn_lock_and_buffer_claim.sql` (após aprovação explícita do usuário).
   - Habilitar `POST` em `app/api/cron/flush-buffer/route.ts` aceitando `verifyQstashSignature` ou `CRON_SECRET` timing-safe.
   - Atualizar `lib/infra/redis.ts`, `lib/ai/debounce.ts` e `lib/ai/buffer-flush.ts`:
     - Tratar `outcome.status === 'requeued'` sem marcar `flushed = true`.
     - Unificar chave representativa em `items[0].provider_message_id`.
     - Substituir `redis.get(tokenKey)` por `claimFlushGen`.
     - Atualizar `messages.content` dos `prePersistedIds` com o resultado de `routeMedia` e só deletar `preIdsKey` ao final de `flushBuffer` quando `outcome.status !== 'failed'`.
   - Adotar `acquire_or_create_lead_turn_lock` em `turn-lock.ts` e remover o check destrutivo `ageMs < 1000` em `leads.last_message_at`.
   - **Rollback:** Variável de ambiente `USE_LEGACY_TURN_LOCK=true` (ou revert do código mantendo a migration `082` inerte).

3. **Fase 3 — Desmonte Modular de `engine.ts` e Hardening Multi-Provider**
   - Extrair `prompt-builder.ts`, `rag.ts`, `response-composer.ts` (`Intl.Segmenter`) e `turn-orchestrator.ts`.
   - Atualizar `router.ts` e os 4 adapters para validar argumentos com Zod e bloquear reexecução de tools mutáveis via `ch:tool_idem:{traceId}:{toolName}`.
   - Separar `sanitizeAIResponse` de envios de operadores humanos em `lib/channels/send.ts` e corrigir `handleRequestHumanAgent` (remover `status: 'manual'`), `handleGeneratePixCharge` e `observability.ts`.
   - **Rollback:** Manter assinatura pública idêntica em `lib/ai/engine.ts`.

4. **Fase 4 — Decomposição das Server Actions e Remoção de Shims**
   - Dividir `app/admin/actions.ts` e `app/(app)/settings/actions.ts` em sub-módulos `< 300` linhas, corrigir `inspectLeadByPhone`, `getCompanyChannelDetails` e `PLAN_MAX`.
   - Remover `tool-schemas.ts`, código morto `---JSON---` e dependências não utilizadas.

---

## 5. Critérios de Validação e Aceite

- **Testes Unitários e de Concorrência (Vitest — `pnpm test`):**
  - Atualizar `lib/ai/__tests__/lock-requeue.test.ts`: validar que mensagens enviadas `< 1s` após o início do turno do Worker 1 **não são descartadas** e entram no fluxo de `requeue` sem forjar `last_message_at`.
  - Criar `lib/ai/__tests__/debounce-requeue-preservation.test.ts`: garantir que `flushBuffer` **não** grava `flushed = true` quando `handleIncomingMessage` retorna `{ status: 'requeued' }`, e que atualiza a mensagem pré-salva após transcrição de áudio.
  - Criar `lib/ai/__tests__/concurrent-lead-creation.test.ts`: simular 2 workers paralelos na criação de um lead inédito via `acquire_or_create_lead_turn_lock`, garantindo exatamente 1 vencedor com lock e 1 `requeue`.
  - Criar `lib/ai/__tests__/tool-registry-zod.test.ts`: validar rejeição de `service_id` não-UUID, `start_time` inválido, e idempotência de `bookAppointment` no mesmo `traceId`.
  - Criar `lib/ai/__tests__/response-composer.test.ts`: validar que `Intl.Segmenter` não quebra `R$ 150.00`, `Dr. João` ou URLs ao limitar a 3 frases, e que payloads Pix `000201...` não são apagados na saída da IA.
  - Criar `app/admin/__tests__/diagnostics-queries.test.ts`: validar colunas reais em `inspectLeadByPhone`, `getCompanyChannelDetails` e `getCompanyQuotaStatus` alinhado com `PLAN_LIMITS`.
  - Criar `app/api/cron/__tests__/flush-buffer-route.test.ts`: validar respostas `200` (GET cron e POST QStash assinado) e `401` (sem assinatura).
- **Checagens Estáticas e Build:**
  - `pnpm typecheck` (`tsc --noEmit` com `strict: true`, 0 `any` novos).
  - `pnpm lint` (0 erros/warnings novos).
  - `pnpm build` (Next.js 16 produção sem erros de bundle client/server).
- **Validação de Runtime / Carga:**
  - Simular rajada de 5 mensagens em 1.5s + 2 entregas concorrentes (`/api/internal/flush` + `/api/cron/flush-buffer`) verificando exatamente 1 entrada executada em `ai_logs` e zero linhas órfãs em `processed_messages` ou `message_buffer`.

---

## 6. Ajustes da Auditoria Cruzada

> Revisão cruzada contra o código-fonte real realizada antes da execução incremental.

1. **`P0-ENG-06` (`processed_messages.lead_id`):** A coluna `lead_id` existe na tabela (`014_ai_idempotency_and_locks.sql`) e possui índice (`064_perf_fk_indexes_and_dedup.sql`), porém nunca era preenchida no `INSERT` do engine. O orquestrador passa a atualizar `processed_messages.lead_id` após resolver o lead (best-effort), além de corrigir as colunas inexistentes em `app/admin/actions` (`leads.intent`, `leads.lead_score`, `channels.phone_number`).
2. **`acquire_or_create_lead_turn_lock` (`previous_last_message_at`):** Como o `UPDATE` atômico atualiza `last_message_at = now()`, a RPC retorna também `previous_last_message_at TIMESTAMPTZ` capturado antes do `UPDATE`, preservando o cálculo exato de `isSessionExpired` (>12h) e `formatTimeElapsed` no prompt.
3. **`debounce.ts` no requeue e drenagem de Redis:**
   - Em lote `N >= 2` com retorno `'requeued'`, marcar apenas `items.slice(1)` como `flushed = true`, preservando `items[0].provider_message_id` re-armado.
   - Substituir `redis.del(tokenKey)` por CAS Lua `releaseFlushGen(tokenKey, gen)` para nunca apagar o token de uma geração mais nova.
   - Gravar `pre_message_id` no `message_buffer.metadata` no momento do buffer e substituir `redis.del(preIdsKey)` por `trimPrePersistedIds(preIdsKey, count)` após conclusão do turno, preservando IDs de mensagens recém-chegadas.
4. **Compatibilidade da fachada `lib/ai/engine.ts`:** `handleIncomingMessage(...): Promise<'requeued' | void>` mantém assinatura pública intacta para callers e testes existentes, delegando ao `executeTurn` (`TurnOutcome`) em `lib/ai/turn-orchestrator.ts`.
5. **Rollout seguro da migration `082`:** `turn-lock.ts` e `buffer-flush.ts` incluem fallback automático para `PGRST202` / `USE_LEGACY_TURN_LOCK=true` enquanto a migration `082` aguardar aplicação manual em produção.
6. **Barrels `"use server"` no Next.js 16:** Os sub-módulos `*.actions.ts` declaram `"use server"` no topo; os arquivos raiz (`app/admin/actions.ts` e `app/(app)/settings/actions.ts`) funcionam como barrels sem `"use server"` reexportando funções e tipos.
