# 📧 Verificação de Email via OTP (Resend)

O Agendra utiliza um fluxo personalizado de verificação de email para garantir segurança e uma experiência de marca premium, evitando os links mágicos genéricos do Supabase.

## 🛠️ Stack
- **Provedor**: [Resend](https://resend.com)
- **Método**: Código de 6 dígitos enviado por email.
- **Tabela**: `otp_codes` (com TTL de 15 minutos).

## 🔄 Fluxo de Cadastro
1.  **Signup**: O usuário se cadastra em `/signup`.
2.  **Geração**: O sistema gera um código de 6 dígitos e salva em `otp_codes`.
3.  **Envio**: Um email HTML com estética "Liquid Glass" é enviado via Resend.
4.  **Verificação**: O usuário é redirecionado para `/verify`, onde insere o código.
5.  **Confirmação**: A API `verify-otp` valida o código e confirma o usuário no Supabase Auth via Admin Client.

## 🛡️ Segurança
- **Rate Limit**: Máximo de 3 códigos por email a cada 15 minutos.
- **Invalidação**: Ao gerar um novo código, os anteriores do mesmo email são marcados como usados.
- **Privacidade**: A tabela `otp_codes` tem RLS estrito; apenas o `service_role` pode ler os códigos.

## 📧 Templates
Os templates estão em `lib/email/templates/` e utilizam HTML puro para evitar dependências extras de build, mantendo a performance e o visual dark-glass.
