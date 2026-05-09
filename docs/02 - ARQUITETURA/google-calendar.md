# 📅 Integração Google Calendar

O sistema de agendamento é sincronizado bidirecionalmente com o Google Calendar para garantir precisão e evitar conflitos.

## 🔑 Fluxo OAuth
1.  **Conexão**: O usuário (dono da empresa) conecta sua conta em `/settings`.
2.  **Tokens**: Recebemos um `refresh_token` de escopo offline e salvamos na tabela `companies`.
3.  **Segurança**: Os tokens são usados apenas para gerenciar o calendário primário da empresa.

## 🔄 Sync Engine (`lib/calendar/sync.ts`)
Para performance, o Agendra mantém uma cópia local dos eventos na tabela `events`.

- **Incremental Sync**: Utilizamos o `syncToken` do Google. Isso permite baixar apenas o que mudou (novos, editados ou deletados) desde a última sincronização.
- **Fallbacks**: Se o `syncToken` expirar, o motor realiza um Full Sync automático.
- **Frequência**:
    - **On-demand**: Quando o usuário clica em sincronizar na UI.
    - **Triggered**: Antes da IA sugerir horários (via Tool Calling).
    - **Cron**: Agendado para manter a sanidade dos dados (futuro).

## 🛡️ Regras de Filtro
Para não poluir o sistema, o sync ignora:
- Eventos de dia inteiro (feriados, aniversários).
- Eventos marcados como "Disponível" (Transparent).
- Eventos que não são do tipo `default`.

## 🤖 Uso pela IA
A IA utiliza a ferramenta `checkAvailability` que consulta a tabela `events` (local) já sincronizada, garantindo respostas ultra-rápidas para o lead no WhatsApp.
