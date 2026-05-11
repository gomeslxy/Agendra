# 🧠 Motor de IA (Agendra AI Engine)

O Agendra utiliza um motor agêntico baseado no **Gemini 1.5 Flash** (em transição para **Gemini 3.1 Flash-Lite**), projetado para transformar conversas em WhatsApp em agendamentos reais.

## ⚙️ Tecnologias
- **Modelo Principal**: `gemini-3.1-flash-lite` (Escolha baseada em estabilidade de cota e performance).
- **Modelo de Fallback**: `gemini-1.5-flash`.
- **SDK**: `@google/generative-ai`.
- **Padrão**: Tool Calling (Function Calling) com loop agêntico de até 5 iterações.

## 📜 Regras de Histórico
- **Strict User Start**: O Gemini exige que a primeira mensagem do histórico seja do `user`. O motor filtra automaticamente mensagens iniciais do assistente se necessário.
- **Filtragem de Notas**: Mensagens do tipo `note` (anotações manuais) são ignoradas pelo motor de IA para evitar confusão no contexto.

## 🛠️ Ferramentas (Tools)
A IA possui "mãos" para interagir com o sistema através das seguintes ferramentas:

1.  **`checkAvailability`**:
    - Consulta o banco local (`events`) e/ou Google Calendar.
    - Retorna slots livres para o lead.
2.  **`bookMeeting`**:
    - Cria um registro na tabela `events`.
    - Dispara a criação no Google Calendar.
3.  **`updateLeadInfo`**:
    - Atualiza silenciosamente dados como `email`, `city` e `source` na tabela `leads`.

## 🔄 Fluxo de Processamento (`engine.ts`)
1.  **Entrada**: Mensagem do lead via Webhook.
2.  **Contexto**: Carrega Persona da empresa + Histórico de 20 mensagens + Dados do Lead.
3.  **Loop**:
    - Gemini analisa a intenção.
    - Se precisar de dados (ex: "tem vaga amanhã?"), chama `checkAvailability`.
    - O motor executa a função, devolve o resultado para o Gemini.
    - Gemini gera a resposta final textual.
4.  **Extração de Metadados**:
    - A IA retorna um bloco JSON (`---JSON---`) com `heat_score`, `status` e `summary`.
5.  **Persistência**: Atualiza o lead e salva a mensagem do assistente.
6.  **Saída**: Envia a resposta via WhatsApp Cloud API.

## 🎭 Persona e Tom
O prompt do sistema é construído dinamicamente:
- **Cold**: Formal, breve, sem emojis.
- **Warm**: Amigável, atencioso, emojis moderados.
- **Hot**: Persuasivo, ágil, focado em fechar.

Os tons podem ser alterados manualmente no Dashboard ou detectados pela IA.
