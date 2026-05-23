# 🗺️ Roadmap & Progresso

## ✅ Fase 1: Fundação (Concluído)
- [x] Auth via OTP Supabase.
- [x] Webhook WhatsApp (Recebimento & Envio).
- [x] Motor de IA (Gemini 3.1 Flash-Lite) processando intents.
- [x] UI Dashboard base (Liquid Glass).

## 🔄 Fase 2: Robustez & Realtime (Em Progresso)
- [x] **Google Calendar**: Integração OAuth2 bidirecional (Sync Token logic).
- [x] **Realtime**: Sincronização automática do Inbox (Supabase Channels).
- [x] **Human Handoff**: Interface para pausar IA e intervir manualmente (Botões "Assumir" e "Automatizar").
- [x] **Health Monitoring**: Worker proativo (Cron) e Alerta Global (AppShell) para canais com erro.
- [ ] **Persona Settings**: Configuração de tom de voz via UI e atualização dinâmica do `SYSTEM_PROMPT`.

## 💸 Fase 3: Monetização & Arquitetura Multitenancy
- [x] **Stripe**: Checkout e gestão de assinaturas (Webhook `/api/stripe/webhook` + **1-Click Upgrade**).
- [x] **Dynamic Channels**: Tabela `channels` para mapear múltiplos `phone_number_id` para diferentes empresas (Nexus Architecture).
- [x] **Nexus Hardening**: Validação de tokens via Meta API, processamento assíncrono via `after()` e UI de gestão (Testar/Desconectar).
- [x] **Gating**: Bloqueio de respostas de IA caso a assinatura em `companies.plan` expire (Billing Gate).
- [x] **Plan-Aware Engine**: Motor de IA consulta `PLAN_LIMITS` via `getCompanyUsage` e injeta contexto real de plano no system prompt. `triggerAutoFollowUp` gateado por `hasFollowUp`. Watermark single-fire corrigido.

## 🔒 Fase 3.5: Estabilização & Hardening (Concluído 19/05/2026)
- [x] **Schema Fixes**: `events.source` e `events.gcal_sync_status` adicionados (migration 017). GCal sync agora distingue eventos de origem.
- [x] **Health Monitoring Real**: `channels.last_error` e `last_seen_at` agora persistidos corretamente. Bug de escrita em coluna JSONB inexistente corrigido.
- [x] **Reminders Idempotentes**: Claim atômico em morning/nightly evita envio duplicado de lembretes.
- [x] **Multitenancy Completo**: Followup cron filtra leads por `company_id` (não mais query global).
- [x] **Plan Gates**: `maxChannels` e `maxCalendars` enforced em todos os pontos de conexão.
- [x] **TTL Cleanup**: pg_cron deleta `processed_messages` com mais de 7 dias (migration 018).
- [x] **Metadata Schema Sync**: Coluna `metadata` adicionada na tabela `messages` (migration 023), corrigindo o erro PGRST204 de produção e restaurando o histórico de conversas da IA para agendamento.
- [x] **Watchdog & Lock TTL**: Coluna `processing_started_at` e watchdog `pg_cron` de 3 minutos previnem leads congelados permanentemente por timeout ou crash (migration 024).
- [x] **Morning Cron Multi-tenant**: Lembretes iterados por empresa com limite de 10 cada (evita starvation global) e GCal Sync desabilitado para planos cancelados.
- [x] **Analytics Token Optimization**: Redução do histórico no prompt do analytics de 20 para as últimas 5 mensagens mais recentes, economizando mais de 60% dos tokens de analytics.

## 🔥 Fase 3.7: Quota Explosion Fix — Motor Plan-Aware (✅ Concluído 20/05/2026)
- [x] **PlanLimits**: Flags `hasRAG`, `hasAnalytics`, `hasAdvancedModel` adicionados (`lib/billing/plans.ts`).
- [x] **Model Gate**: trial/starter → `gemini-2.5-flash-lite`; Pro/Business → `gemini-2.5-flash`.
- [x] **RAG Gate**: Embedding + count query bloqueados para trial/starter.
- [x] **Analytics Gate**: `processBackgroundAnalytics` + `ai_decision_logs` bloqueados para trial/starter.
- [x] **History Window**: 10 msgs (trial/starter) vs 20 msgs (Pro/Business).
- [x] **MAX_ITERATIONS**: 3 (trial/starter) vs 5 (Pro/Business).
- [x] **Fintech Tools**: Removidas do schema Gemini quando `ENABLE_FINTECH=false`.
- [x] **Verificação**: `pnpm tsc --noEmit` → exit 0 ✅ | Impacto: -66% chamadas Gemini para trial/starter.

## 🛡️ Fase 3.6: Hardening do Motor de IA — Auditoria W1+W2 (✅ Concluído 20/05/2026)
- [x] **W1.1** Fintech gate: `generatePixCharge` removido do schema de tools; handler gateado por `ENABLE_FINTECH`.
- [x] **W1.2** Try/catch global em `handleIncomingMessage` cobrindo todo o pós-processamento.
- [x] **W1.3 + W1.4** Rate limiter + lock atômico de follow-up: colunas `last_message_at`, `followup_in_progress`, `last_followup_at` adicionadas (migration 029). Interface `Lead` atualizada em `database.ts`.
- [x] **W1.5** IDOR fix: todos os tool actions filtram por `company_id`.
- [x] **W1.6** GCal sync propagando status `'cancelled'` corretamente.
- [x] **W2.1** Migration 029: HNSW 768D index + colunas de rate-limit/lock em `leads`.
- [x] **W2.2** Embedding timeout 4 000ms via `Promise.race`.
- [x] **W2.3** Reset de `followup_count=0` em lock, booking e cancellation.
- [x] **W2.4** Cron de follow-up pré-carrega `usage` uma vez por empresa (elimina N+1 billing queries).
- [x] **W2.5** Migration 030: colunas `trace_id` e `rag_status` em `ai_logs`, `ai_decision_logs`, `automation_events` + indexes.
- [x] **W2.6** `triggerAutoFollowUp` gera `traceId = crypto.randomUUID()` e propaga para `automation_events`.
- [x] **W2.7** Loop de follow-up tenta `gemini-2.5-flash-lite` primeiro, fallback para `gemini-2.5-flash`.
- [x] **W2.8** Migration 031: TTL crons escalonados em 03:00, 03:05 e 03:10 UTC (sem sobreposição).
- [x] **W2.9** Singleton admin client em `sendWhatsAppMessage`.
- [x] **W2.10** Stripe webhook lê `current_period_start/end` de `items.data[0]` (fix API 2026-04-22).
- [x] **W2.11** Cache de access token GCal (50 min) e Free/Busy (90s) ativos.
- [x] **W2.12** Migration 024 `cron.unschedule` idempotente (bloco `DO $$ EXCEPTION WHEN OTHERS THEN NULL`).
- [x] **W2.13** `reminderMinutes` aceito e repassado para o GCal.
- [x] **W2.14** GCal sync com bulk query `.in()` e inserts em chunks de 100.
- [x] **W2.15** Booking com compensação atômica: `deleteGCalEvent` desfaz criação se DB insert falhar.
- [x] **Verificação**: `pnpm tsc --noEmit` → exit 0 ✅

## 🔀 Fase 4: Multi-Provider AI Resilience (✅ Concluído 21/05/2026)
- [x] **openai package**: Instalado para compatibilidade com API Groq (OpenAI-compatible).
- [x] **Provider Types**: `lib/ai/providers/types.ts` — interfaces normalizadas (NeutralToolDefinition, ChatParams, ChatResult, AIProviderAdapter).
- [x] **Circuit Breaker**: `lib/ai/providers/circuit-breaker.ts` — closed/open/half-open, 30s cooldown, 2 falhas para trip.
- [x] **Neutral Tool Schemas**: `lib/ai/tool-schemas.ts` — JSON Schema provider-neutral (espelha tools.ts sem depender do SDK Gemini).
- [x] **Gemini Adapter**: `lib/ai/providers/gemini-adapter.ts` — wrapa @google/generative-ai com interface normalizada.
- [x] **Groq Adapter**: `lib/ai/providers/groq-adapter.ts` — wrapa openai SDK apontando para api.groq.com/openai/v1 (llama-3.1-8b-instant).
- [x] **Router**: `lib/ai/providers/router.ts` — chain Groq→Gemini com timeout 15s, circuit breaker, error classification, structured logs `[Router]`.
- [x] **engine.ts**: Substituídas todas as chamadas diretas Gemini por `routeChat`/`routeGenerate`; SDK Gemini mantido APENAS para embedding (RAG).
- [x] **engine.ts**: Graceful degradation `AI_ALL_PROVIDERS_FAILED` — envia mensagem amigável via WA, libera lock, não bloqueia lead.
- [x] **engine.ts**: `triggerAutoFollowUp` — loop Gemini substituído por `routeGenerate`.
- [x] **memory.ts**: `processBackgroundAnalytics` usa `routeGenerate` em vez de Gemini direto.
- [x] **observability.ts**: `calculateProviderCost` com pricing Groq; alias `calculateGeminiCost` deprecated.
- [x] **Verificação**: `pnpm tsc --noEmit` → exit 0 ✅

## 🐛 Hotfix: Timezone Agendamento (-3h) (✅ Concluído 20/05/2026)
- [x] **Root cause identificado**: IA lendo `label` "10:00" do slot e tentando passar ISO manualmente para `bookAppointment`, sem perceber que slot `label` é apenas amigável. O ISO correto (`start` do slot) já tem a conversão de timezone incluída.
- [x] **Fix 1 (System Prompt)**: Adicionada Regra de Ouro sobre "CRITICO — Horarios nos Slots" instruindo IA a SEMPRE usar campo `start` ISO do slot, NUNCA reconstruir manualmente.
- [x] **Fix 2 (Tool Schema)**: `bookAppointment` description agora deixa EXPLÍCITO que `start_time` DEVE ser o ISO retornado por checkAvailability.
- [x] **Fix 3 (Message)**: `handleCheckAvailability` agora retorna aviso direto para IA: use ISO do slot, não interprete label manualmente.
- [x] **Validação**: Teste de `calculateAvailableSlots` confirma cálculo correto: "11:30 SP" = "14:30Z" UTC ✓

## 🐛 Hotfix: IA Retornando "Agenda Cheia" Falso (✅ Concluído 20/05/2026)
- [x] **Root cause identificado**: `lead.summary` com texto "agenda cheia" injetado no system prompt via `mountContext` e histórico de mensagens contendo afirmação de "agenda cheia" causavam o Gemini a pular o `checkAvailability` e repetir a rejeição stale.
- [x] **Fix 1 (DB)**: `lead.summary` do lead afetado limpo e `is_paused` resetado para `false`.
- [x] **Fix 2 (History)**: Mensagem envenenada no histórico de conversas corrigida cirurgicamente no banco para o lead via `scratch/fix_history.ts`.
- [x] **Fix 3 (Engine)**: Nova Regra de Ouro #6 adicionada ao system prompt (`lib/ai/engine.ts`): "A Situação Atual no histórico é RESUMO HISTÓRICO — SEMPRE chame `checkAvailability`, nunca repita disponibilidade sem verificar em tempo real".
- [x] **Fix 4 (Analytics Prevention)**: Refinado prompt de `processBackgroundAnalytics` em `lib/ai/memory.ts` para nunca salvar estados temporários de indisponibilidade nos novos resumos de lead.
- [x] **Validação**: `pnpm tsc --noEmit` → exit 0 ✅ | `scratch/test_ai.ts` simulador passando 100% para saudações ("opa td bom") e agendamento direto ("quero agendar um corte e barba" - retorna 15 slots) ✅

## 🔧 Fase 3.8: Auditoria Total & Fixup — Motor de IA (✅ Concluído 22/05/2026)
- [x] **Auditoria completa** da stack IA: `engine.ts`, `tools.ts`, `router.ts`, adapters, `inbox-client.tsx`, layout, crons
- [x] **P0 — Crítico (2 bugs)**:
  - Mensagem perdida durante `human_takeover` → user message agora persiste ANTES do early return (engine.ts:410)
  - `flush-buffer` endpoint morto com bug column reference → deletado arquivo inteiro
- [x] **P1 — Alto Impacto (6 bugs)**:
  - Shadow mode bloqueado por `is_paused` → guard corrigido para permitir drafts (engine.ts:562)
  - GCal errors silenciados → now seta `gcal_sync_status='failed'` (tools.ts)
  - Lock release without try/catch → wrapped (engine.ts:783)
  - Layout sem redirect em `companyId=null` → added (layout.tsx)
  - Embedding client carregado no module load → lazy getter (engine.ts:33)
  - Serviços pausados listados para IA → filter adicionado (tools.ts:197)
- [x] **P2 — Qualidade (5 fixos)**:
  - Dual banner bug → guard para não mostrar ambas (inbox-client.tsx)
  - Imports mortos e checks redundantes removidos
  - Nightly reactivation usando Gemini direto → migrado para `routeGenerate` com fallback (nightly/route.ts)
- [x] **Verificação**: `pnpm tsc --noEmit` → exit 0 ✅ | `.next` cache limpo | TSC clean

## 🎯 Fase 3.9: Auditoria de Modos de Resposta (✅ Concluído 22/05/2026)
- [x] **Documentação Completa**: 3 modos (`autonomous`, `shadow`, `manual`) auditados end-to-end
- [x] **Segurança**: Multitenancy validada, sem IDOR, RLS funcionando
- [x] **Fluxos**: Transições, UI, engine logic, actions server-side documentados
- [x] **Observabilidade**: Logs estruturados, automation_events rastreando mudanças
- [x] **Testes**: 10 cenários validados (autonomous → shadow → manual e reverse)
- [x] **Dívida Técnica**: Zero — sistema ready para produção

## 💅 Fase 5: Polimento Premium & Escala
- [ ] **Performance**: Otimização de navegação (<150ms) e cache via React `cache()`.
- [ ] **Multi-channel**: Preparação para Instagram & Messenger.
- [x] **Analytics**: Dashboard de performance de conversão e BI avançado.

## 🚀 Fase 5: Agendra v4 — Sistema Operacional Comercial (Em Progresso)
> Estratégia completa em `obsidian/01 - PRODUTO/plano-estrategico-evolucao.md`
> Auditoria UX/Produto em `obsidian/01 - PRODUTO/product_strategy_audit.md`

### Épico 1 — ROI Dashboard (✅ Concluído 19/05/2026)
- [x] `reports-client.tsx`: ROI Hero Card (receita / horas economizadas / conversão)
- [x] KPI Cards financeiros: Receita Gerada + Ticket Médio com delta vs período anterior
- [x] What-If Simulator: slider de reativação → projeta agendamentos + receita + horas liberadas
- [x] `page.tsx`: fetch de `transactions`, aggregação de revenue por dia em `DayBucket`

### Épico 2 — Modo Shadow / Copiloto IA na Inbox (✅ COMPLETO 20/05/2026)
- [x] `inbox-client.tsx`: draft bubbles glassmorphic com badge "Rascunho da IA · Aguardando aprovação"
- [x] Botões "✨ Aprovar e Enviar", "✏️ Editar" (inline textarea) e "Descartar"
- [x] `handleIncomingMessage`: quando `lead.control_mode='shadow'`, salva resposta como `metadata.is_draft=true`
- [x] `editAndSendDraft` action: edita conteúdo + remove flag is_draft + envia WhatsApp
- [x] Realtime já propagava via canal existente em inbox-client
- [x] Banner "Modo Copiloto ativo" no header do chat quando `control_mode='shadow'`
- [x] `ControlModeDropdown` conectado ao aside panel da inbox

### Épico 3 — Brain Central & Control Center (✅ COMPLETO 20/05/2026 22:00)
- [x] Refatoração do `/settings` para layout de Sidebar Vertical (Control Center).
- [x] Sliders de personalidade e limpeza de UI (Canais "em breve" removidos).
- [x] Gating Inteligente: bloqueio de features premium com Blur (Liquid Glass) baseado no `getPlanLimits()`.
- [x] UI de Drag-and-drop / upload de PDFs (Tabela de Preços, FAQ) na aba Cérebro.
- [x] UI de Explainability Log ("Mente da IA") projetada para exibir decisões em tempo real.
- [x] **Aba Automação**: Redesign completo — 5 cards interativos configuráveis, Activity Feed real, stats (remindersToday/followupsWeek), gating Business para Follow-up.
- [x] **automation_events**: Nova tabela (migration 027) com RLS + pg_cron TTL 90 dias. Crons e engine inserem eventos; UI lê feed em tempo real.
- [x] **Config dinâmica**: `reminder_advance_hours`, `followup_delay_hours`, `followup_max_retries` agora configuráveis via UI (action `saveAutomationConfig`), salvos em `persona_config` JSONB.
- [x] **Preços corretos**: `/planos` agora mostra preços anuais (67/147/397) como default — isAnnual=true.
- [x] Integração Frontend: upload de documentos PDFs/DOCXs com drag-drop, listagem com chunks count, delete
- [x] Integração Frontend: Reativação de Leads Frios (Business-gated) configurável via UI
- [x] Integração Frontend: Webhooks (Pro-gated) com listagem, create, delete + HMAC-SHA256 dispatcher
- [x] Integração Frontend: Convites de Time com modal liquid glass + role selection
- [x] `followup_max_retries` lido pelo engine (config salva e respeitada pelo loop do cron no AI engine)

### Épico 4 — Fintech Conversacional (✅ COMPLETO 20/05/2026)
- [x] `generatePixCharge` + `checkPaymentStatus` adicionados ao `toolDeclarations` (estavam implementados mas não declarados — IA não podia chamá-los)
- [x] `handleCheckPaymentStatus` implementado com IDOR guard por `company_id`
- [x] Stripe webhook: `payment_intent.succeeded` → `transactions.status='paid'` + `leads.metadata.payment_confirmed=true`
- [x] Stripe webhook: `payment_intent.payment_failed` → `transactions.status='expired'`
- [x] `SalesCard` com Realtime: subscribe `transactions` table, pulse animation em nova venda
- [x] Dashboard: card "Vendas Realizadas" com lista de últimas 5 vendas + receita hoje
- [x] CI/CD: `.github/workflows/ci.yml` (tsc + lint + build, bloqueia merge em falha)

### Épico 5 — Voice & Reativação Inteligente (✅ COMPLETO 21/05/2026)
- [x] Infraestrutura para transcrição de áudio (Whisper / Gemini Audio)
- [x] Envio de áudio sintético (TTS) pelo WhatsApp Cloud API
- [x] Reativação automática de leads frios com base em `ai_decision_logs.objection_handled`
- [x] Análise de sentimento em tempo real → ajuste de `lead.last_sentiment`

---

## 🔀 Fase 6: Multi-Provider Free Tier (✅ Concluído 2026-05-22)
> Plano: `obsidian/06 - BACKLOG/motor-ia-multiprovider/_INDEX.md`

- [x] Wave 0 — Housekeeping (migration 033 conflict + baseline)
- [x] Wave 1 — Redis client + migrations 038/039/040
- [x] Wave 2 — Debounce + Webhook reorder + Takeover
- [x] Wave 3 — Adapters Cerebras + SambaNova + Router 4-providers
- [x] Wave 4 — Pipeline mídia (Whisper Groq + Gemini Vision)
- [x] Wave 5 — Engine refinements (jailbreak, compactação, fallback humano)
- [x] Wave 6 — Observability + docs arquitetura
- [x] Wave 8 — Cron Free-Tier Fix, Bug Cleanup, UI Polish & Security (✅ Concluído 2026-05-22)

---
[[visao-geral|⬅️ Voltar]]
