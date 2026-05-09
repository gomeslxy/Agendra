# 🚀 Roadmap Agendra

Status atualizado em: 2026-05-09

## ✅ Fase 1: MVP & Core (Concluído)
- [x] Estrutura Next.js 15 + Tailwind v4 + Framer Motion.
- [x] Autenticação Supabase (Auth + Memberships).
- [x] Landing Page Premium.
- [x] Dashboard Base (Inbox, Leads, Agenda, Reports, Settings).
- [x] Banco de Dados Schema v1-v4 (Leads, Messages, Companies, Channels, Events).

## ✅ Fase 2: Conectividade & Multitenancy (Concluído)
- [x] **WhatsApp Cloud API**: Webhook multitenant real.
- [x] **Channels System**: Mapeamento dinâmico de `phone_number_id` -> `company_id`.
- [x] **Inbox Real-time**: Atualização instantânea via Supabase Realtime + Typing Indicators.
- [x] **Google OAuth**: Fluxo completo de conexão para donos de empresa.

## 🧠 Fase 3: Inteligência Executiva (Em Progresso)
- [x] **Engine v2**: Migração para Gemini 2.0 Flash.
- [x] **Tool Calling**: IA capaz de verificar horários, agendar e atualizar leads sozinha.
- [x] **Persona Dinâmica**: Prompt do sistema carregado das configurações da empresa.
- [ ] **Follow-up Automático**: Sequências de mensagens disparadas por tempo (Backlog).

## 📅 Fase 4: Integrações Avançadas (Em Progresso)
- [x] **GCal Sync Engine**: Sincronização incremental via `syncToken` (GCal -> DB local).
- [ ] **Delete Propagation**: Cancelar no GCal quando deletar no Agendra (e vice-versa).
- [ ] **Instagram DM Integration**: Expansão de canais.

## 💳 Fase 5: Monetização & Escala (Próximo)
- [ ] **Stripe Checkout**: Fluxo de assinatura real.
- [ ] **Stripe Webhook**: Liberação automática de recursos (limite de leads, canais).
- [ ] **Portal do Cliente**: Gestão de faturamento.

## 🛠️ Débito Técnico & Qualidade
- [ ] Substituir Lucide por ícones branded (SVGs customizados).
- [ ] Cobertura de testes E2E nos fluxos críticos.
- [ ] Otimização de performance INP no Dashboard.
