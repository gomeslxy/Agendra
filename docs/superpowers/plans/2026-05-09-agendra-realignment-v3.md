# Agendra: Roadmap de Precisão (v3) — Do Design à Funcionalidade

Este plano substitui e expande o plano `2026-05-08-agendra-functional-engine.md`, focando na resolução dos "mocks" e na implementação do motor de conversão real.

**Objetivo:** Sair da "Concha de Luxo" e entregar um SaaS funcional onde a IA qualifica e agenda reuniões via WhatsApp em tempo real para múltiplos clientes.

---

## 🛠️ Fase 1: Encanamento & Multitenancy (Urgente)

O Agendra precisa parar de usar IDs fixos no `.env` e se tornar um sistema multi-inquilino real.

### 1.1 Tabela de Canais (`channels`)
Atualmente, o webhook não sabe a qual empresa uma mensagem pertence se não for via `.env`.
- [ ] Criar tabela `public.channels`:
  - `id` (uuid)
  - `company_id` (uuid, fk -> companies)
  - `provider` (text: 'whatsapp', 'instagram', etc.)
  - `provider_id` (text: ID do telefone da Meta ou ID da conta)
  - `access_token` (text, encrypted: Token específico do canal)
  - `status` (text: 'active', 'error')
- [ ] Refatorar `app/api/whatsapp/route.ts`:
  - Buscar `company_id` dinamicamente via `value.metadata.phone_number_id` na tabela `channels`.

### 1.2 Inbox Real-time (Supabase Realtime)
O Inbox atual é estático. Precisamos que as mensagens apareçam instantaneamente.
- [ ] Ativar `Realtime` nas tabelas `messages` e `leads` no Supabase.
- [ ] Implementar `supabase.channel()` no `app/(app)/inbox/inbox-client.tsx` para ouvir `INSERT` em `messages`.
- [ ] Adicionar feedback visual "Digitando..." via presença no Realtime.

---

## 🧠 Fase 2: O Cérebro Executivo (AI Agency)

Transformar o motor de IA de um "Chatbot" em um "Agente de Vendas".

### 2.1 Upgrade para Gemini 2.0 Flash + Tool Calling
O plano anterior usava apenas texto puro. Vamos dar "mãos" à IA.
- [ ] Migrar `lib/ai/engine.ts` para usar o SDK oficial do Google Generative AI.
- [ ] Definir `Tools` (Ferramentas) para a IA:
  - `get_available_slots`: Consulta a tabela `events` e o Google Calendar.
  - `create_appointment`: Reserva um horário para o lead.
  - `update_lead_info`: Atualiza cidade, email ou interesse no banco.

### 2.2 Persona Dinâmica
- [ ] Carregar o `system_prompt` da tabela `companies.persona_config` (que já existe no front, mas precisa ser injetada no backend).

---

## 📅 Fase 3: Integração Google Calendar

Sem isso, a IA não consegue garantir que o horário sugerido está livre.

### 3.1 OAuth & Token Management
- [ ] Criar rota `app/api/auth/google/route.ts` para conectar a conta do Google do dono da empresa.
- [ ] Salvar `google_refresh_token` de forma segura (Vault/Encrypted) na tabela `companies`.

### 3.2 Sincronização de Disponibilidade
- [ ] Criar helper `lib/calendar/google.ts` para consultar a API Free/Busy.
- [ ] Sincronizar eventos do GCal para a tabela local `events` para consultas rápidas de colisão.

---

## 💳 Fase 4: Monetização (Stripe Real)

Substituir os botões "Em Breve" por um fluxo de receita.

- [ ] Implementar `Stripe Customer Portal` para gestão de assinatura.
- [ ] Criar Webhook Real (`app/api/stripe/webhook/route.ts`) que atualiza o `plan_type` na tabela `companies` e libera o limite de leads.

---

## 📋 Ordem de Execução Recomendada

1.  **DB & Multitenancy**: Criar `channels` e ajustar Webhook (Fim do mock de ID).
2.  **Real-time Inbox**: Conectar o frontend ao Supabase Realtime (UAU imediato para o usuário).
3.  **Gemini Tools**: Implementar Tool Calling para que a IA comece a "agir" no banco de dados.
4.  **Google Calendar**: O "Grand Finale" — IA agendando reuniões reais.

---

> [!TIP]
> **Foco na Conversão**: Ao testar, a pergunta deve ser: "A IA conseguiu extrair o email do lead e sugerir um horário?" Se sim, estamos no caminho certo.
