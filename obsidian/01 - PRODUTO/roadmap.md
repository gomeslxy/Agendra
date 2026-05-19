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

## 💅 Fase 4: Polimento Premium & Escala
- [x] **Performance**: Otimização de navegação (<150ms) e cache via React `cache()`.
- [ ] **Multi-channel**: Preparação para Instagram & Messenger.
- [ ] **Analytics**: Dashboard de performance de conversão e BI avançado.

---
[[visao-geral|⬅️ Voltar]]
