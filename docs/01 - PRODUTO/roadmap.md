# 🚀 Roadmap Agendra

Status atualizado em: 2026-05-10

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

## ✅ Fase 3: Inteligência Executiva (Concluído)
- [x] **Engine v2**: Migração para Gemini 2.0 Flash.
- [x] **Tool Calling**: IA capaz de verificar horários, agendar e atualizar leads sozinha.
- [x] **Persona Dinâmica**: Prompt do sistema carregado das configurações da empresa.
- [x] **Email & Security**: OTP via Resend, reset de senha, RLS audit, rate limiting.
- [x] **Performance**: React.cache() em getUser(), settings tabs instant, inbox fade 120ms.
- [ ] **Follow-up Automático**: Sequências de mensagens disparadas por tempo (Backlog).

## ✅ Fase 4: Integrações Avançadas (Concluído)
- [x] **GCal Sync Engine**: Sincronização incremental via `syncToken` (GCal -> DB local).
- [x] **GCal Delete Propagation**: Cancelar no GCal quando deletar no Agendra (e vice-versa). `lib/calendar/sync.ts` + `app/(app)/agenda/actions.ts`
- [ ] **Instagram DM Integration**: Expansão de canais (Backlog).

## 🔧 Fase 5: Monetização & Escala (Em Progresso)
- [x] **Stripe Checkout**: Fluxo de assinatura + linha items + metadata companyId. `app/api/stripe/checkout/route.ts`
- [x] **Stripe Webhook**: Eventos `checkout.session.completed`, `subscription.updated`, `subscription.deleted`, `invoice.payment_failed`. `app/api/stripe/webhook/route.ts`
- [x] **Billing UI**: Tab "Cobrança" em Settings com estado Pro/Free + botão upgrade.
- [ ] **Stripe Customer Portal**: URL placeholder `test_placeholder` em `settings-shell.tsx:693,701` — precisa de URL real do Stripe Dashboard → Customer portal.
- [ ] **Reports Module**: Verificar se dados reais estão sendo exibidos e export XLSX funciona.

## 🛠️ Débito Técnico & Qualidade
- [ ] Substituir Lucide por ícones branded (SVGs customizados).
- [ ] Cobertura de testes E2E nos fluxos críticos.
- [ ] Rate limiter em memória → Upstash Redis quando escalar.
- [ ] `auth.admin.listUsers()` sem paginação — problema se >1000 users.
- [ ] Criptografar `google_refresh_token` e `whatsapp_token` em repouso.
