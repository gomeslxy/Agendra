# 📱 Integração WhatsApp (Multi-tenant)

O Agendra gerencia múltiplas contas de WhatsApp através de um único endpoint de webhook, utilizando uma arquitetura de mapeamento por canais.

## 🔗 Estrutura de Canais (`channels`)
Para suportar multitenancy real, não usamos IDs fixos no código. A relação é:
`Meta phone_number_id` ↔ `Agendra company_id`

A tabela `channels` armazena:
- `provider_id`: O ID do telefone na Meta.
- `access_token`: Token de acesso permanente (criptografado).
- `company_id`: A empresa dona deste canal.

## 📥 Fluxo de Recebimento (`app/api/whatsapp/route.ts`)
1.  **Validação**: Assinatura HMAC SHA-256 (X-Hub-Signature-256) garante que a mensagem veio da Meta.
2.  **Mapeamento**: O `phone_number_id` do payload é usado para buscar a `company_id` na tabela `channels`.
3.  **Assincronismo**: O webhook retorna `200 OK` imediatamente para a Meta e processa a lógica (`engine.ts`) em background (fire-and-forget).
4.  **Upsert de Lead**: Se o número for novo, cria um lead; se não, atualiza o existente.

## 📤 Fluxo de Envio (`lib/whatsapp/client.ts`)
- Utiliza a **WhatsApp Cloud API (v19.0+)**.
- **Resiliência do Inbox**: As mensagens manuais são salvas no banco de dados ANTES do envio via API. Isso garante o registro histórico mesmo se houver falha na comunicação com a Meta.
- **Tratamento de Erros**: Erros de envio (como Token expirado) são logados no servidor, mas não interrompem o fluxo da UI no dashboard.

## 🖼️ Suporte a Mídia
- O sistema detecta tipos de mensagem não-textuais (`image`, `audio`, `video`, `document`).
- Para manter a consistência do histórico, essas mensagens são convertidas em fallbacks de texto (ex: `[Imagem recebida]`) para processamento pela IA e exibição no Inbox.

## 🛠️ Troubleshooting & Dicas
- **Tokens**: O `WHATSAPP_TOKEN` (System User Access Token) deve ter aproximadamente 180-200 caracteres. Tokens curtos (10-15 caracteres) são IDs e causarão erro 401.
- **Formatador de Token**: O cliente limpa automaticamente prefixos "Bearer " e espaços em branco para evitar erros de autenticação comuns.
- **Phone ID**: Certifique-se de usar o `phone_number_id` (numérico longo) e não o WABA ID.

## 🛡️ Segurança
- **Admin Client**: O processamento do webhook usa um cliente admin do Supabase para bypassar RLS, já que não há sessão de usuário logado no momento do recebimento.
- **Isolamento**: Toda mensagem e lead é obrigatoriamente vinculada a uma `company_id`.
