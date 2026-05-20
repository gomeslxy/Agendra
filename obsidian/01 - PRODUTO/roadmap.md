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

## 💅 Fase 4: Polimento Premium & Escala
- [x] **Performance**: Otimização de navegação (<150ms) e cache via React `cache()`.
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

### Épico 2 — Modo Shadow / Copiloto IA na Inbox (🔜 Próximo)
- [ ] `inbox-client.tsx`: exibir rascunhos da IA (`role='draft'`) em bubble translúcida separada
- [ ] Botões "✨ Aprovar e Enviar" e "✏️ Editar" com animação holográfica
- [ ] `handleIncomingMessage`: quando `lead.control_mode='shadow'`, salvar resposta como `draft` (não enviar ao WhatsApp)
- [ ] Supabase Realtime propagar `draft` messages instantaneamente para o atendente
- [ ] Notificação visual de alta prioridade quando draft gerado
- [ ] Banner de nudge: "Você aprovou 95% das sugestões — ativar modo Autônomo?"

### Épico 3 — Brain Central & Control Center (✅ UX/UI + Automação Concluída 19/05/2026)
- [x] Refatoração do `/settings` para layout de Sidebar Vertical (Control Center).
- [x] Sliders de personalidade e limpeza de UI (Canais "em breve" removidos).
- [x] Gating Inteligente: bloqueio de features premium com Blur (Liquid Glass) baseado no `getPlanLimits()`.
- [x] UI de Drag-and-drop / upload de PDFs (Tabela de Preços, FAQ) na aba Cérebro.
- [x] UI de Explainability Log ("Mente da IA") projetada para exibir decisões em tempo real.
- [x] **Aba Automação**: Redesign completo — 5 cards interativos configuráveis, Activity Feed real, stats (remindersToday/followupsWeek), gating Business para Follow-up.
- [x] **automation_events**: Nova tabela (migration 027) com RLS + pg_cron TTL 90 dias. Crons e engine inserem eventos; UI lê feed em tempo real.
- [x] **Config dinâmica**: `reminder_advance_hours`, `followup_delay_hours`, `followup_max_retries` agora configuráveis via UI (action `saveAutomationConfig`), salvos em `persona_config` JSONB.
- [x] **Preços corretos**: `/planos` agora mostra preços anuais (67/147/397) como default — isAnnual=true.
- [ ] Integração Backend: salvar documentos no `company_knowledge` + pgvector.
- [ ] Integração Backend: ler `ai_decision_logs` com source e confiança na UI da Mente da IA.
- [ ] `match_knowledge()` RPC já definida em `plano-estrategico-evolucao.md` — implementar
- [ ] `followup_max_retries` lido pelo engine (config salva mas engine ainda usa limit(10) fixo).

### Épico 4 — Fintech Conversacional (🔜 Fase 3)
- [ ] Tabela `transactions` já existe (migration 019) — implementar geração de Pix dinâmico
- [ ] Tool `generateCharge` para a IA: cria cobrança Pix via Stripe/MercadoPago, retorna QR Code
- [ ] Tool `checkPaymentStatus`: IA verifica se pagamento foi liquidado
- [ ] Webhook de confirmação: atualiza `transactions.status='paid'`, confirma agendamento, notifica lead
- [ ] Card "Venda Realizada!" no dashboard no momento exato do webhook

### Épico 5 — Voice & Reativação Inteligente (🔜 Fase 4 — Arquitetural)
- [ ] Infraestrutura para transcrição de áudio (Whisper / Gemini Audio)
- [ ] Envio de áudio sintético (TTS) pelo WhatsApp Cloud API
- [ ] Reativação automática de leads frios com base em `ai_decision_logs.objection_handled`
- [ ] Análise de sentimento em tempo real → ajuste de `lead.last_sentiment`

---
[[visao-geral|⬅️ Voltar]]
