# 🗄️ Arquitetura do Banco de Dados

O Agendra utiliza **PostgreSQL via Supabase** com uma arquitetura focada em isolamento de dados (Multitenancy) via Row Level Security (RLS).

## 📊 Principais Tabelas

### `companies`
A entidade raiz. Armazena configurações globais da empresa.
- `persona_config`: JSONB com o prompt do sistema e tom da IA.
- `google_refresh_token`: Token para integração com calendário.
- `plan_type`: `trial`, `starter`, `pro`.

### `channels`
Mapeia integrações externas para empresas internas.
- `provider`: `whatsapp`, `instagram`.
- `provider_id`: ID do recurso externo (ex: `phone_number_id` da Meta).

### `leads`
Armazena os contatos capturados.
- `heat_score`: 0-100 calculado pela IA.
- `status`: `cold`, `warm`, `hot`, `success`.
- `auto_respond`: Boolean que controla se a IA tem permissão para responder.

### `messages`
Histórico completo de interações.
- `role`: `user`, `assistant` (IA), `agent` (Humano), `note` (Sistema).

### `events`
Compromissos e disponibilidade.
- `source`: `agendra` ou `gcal`.
- `gcal_event_id`: Link com o evento externo para sincronização.

## 🛡️ Segurança (RLS)
- **Isolamento**: Todo usuário logado pertence a uma empresa via tabela `memberships`.
- **Políticas**: RLS garante que o usuário de uma empresa NUNCA veja leads ou mensagens de outra empresa.
- **Admin Access**: Webhooks e Jobs de sincronização utilizam o `service_role` (Admin Client) para processar dados de múltiplas empresas sem sessão de usuário.

## 🔄 Migrações
As migrações seguem a ordem `schema.sql` -> `schema_v2` -> ... -> `schema_v5_gcal_sync`.
Sempre verifique a pasta `supabase/` para a estrutura mais atual.
