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
- Suporta apenas mensagens de texto e templates básicos no momento.
- O envio é feito usando o token e o phone ID resolvidos dinamicamente pela `company_id`.

## 🛡️ Segurança
- **Admin Client**: O processamento do webhook usa um cliente admin do Supabase para bypassar RLS, já que não há sessão de usuário logado no momento do recebimento.
- **Isolamento**: Toda mensagem e lead é obrigatoriamente vinculada a uma `company_id`.
