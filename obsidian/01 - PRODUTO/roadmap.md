# 🗺️ Roadmap & Progresso

## ✅ Fase 1: Fundação (Concluído)
- [x] Auth via OTP Supabase.
- [x] Webhook WhatsApp (Recebimento & Envio).
- [x] Motor de IA (Gemini 3.1 Flash-Lite) processando intents.
- [x] UI Dashboard base (Liquid Glass).

## 🔄 Fase 2: Robustez & Realtime (Em Progresso)
- [x] **Google Calendar**: Integração OAuth2 bidirecional (Sync Token logic).
- [x] **Realtime**: Sincronização automática do Inbox (Supabase Channels).
- [ ] **Human Handoff**: Interface para pausar IA e intervir manualmente (flag `is_paused` na tabela `leads`).
- [ ] **Persona Settings**: Configuração de tom de voz via UI e atualização dinâmica do `SYSTEM_PROMPT`.

## 💸 Fase 3: Monetização & Arquitetura Multitenancy
- [x] **Stripe**: Checkout e gestão de assinaturas (Webhook `/api/stripe/webhook`).
- [ ] **Dynamic Channels**: Tabela `channels` para mapear múltiplos `phone_number_id` para diferentes empresas.
- [ ] **Gating**: Bloqueio de respostas de IA caso a assinatura em `companies.plan` expire.

## 💅 Fase 4: Polimento Premium & Escala
- [x] **Performance**: Otimização de navegação (<150ms) e cache via React `cache()`.
- [ ] **Multi-channel**: Preparação para Instagram & Messenger.
- [ ] **Analytics**: Dashboard de performance de conversão e BI avançado.

---
[[visao-geral|⬅️ Voltar]]
