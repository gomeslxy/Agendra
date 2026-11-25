# Guardrails de Segurança e Multi-Tenant — Agendra

## Isolamento Multi-Tenant e Supabase RLS
- **Nunca desabilite, remova ou contorne RLS** em tabelas do Supabase.
- Toda tabela de negócio pertence a um tenant via `company_id`. Toda query (mesmo via `createAdminClient()`) DEVE filtrar explicitamente por `company_id`.
- Use `createClient()` (`lib/supabase/server.ts`) com a sessão do usuário sempre que possível, deixando o RLS atuar como defesa em profundidade.
- Restrinja `createAdminClient()` (`lib/supabase/admin.ts`, `SUPABASE_SERVICE_ROLE_KEY`) a:
  - Webhooks externos (Meta, Stripe, QStash);
  - Crons autenticados (`CRON_SECRET`);
  - Operações administrativas verificadas (`lib/admin/auth.ts`) e fluxos de OTP/signup.
- Credenciais sensíveis de canais (tokens Meta/WhatsApp/Instagram) devem ser lidas/gravadas via RPCs seguras do Supabase Vault (`channel_get_access_token` / `channel_set_access_token`), nunca expostas em logs ou respostas ao cliente.

## Webhooks, Crons e Idempotência
- **Assinatura obrigatória (fail-closed em produção):**
  - WhatsApp/Meta (`/api/meta/webhook`): validar `X-Hub-Signature-256` com `crypto.timingSafeEqual` e `WHATSAPP_APP_SECRET`.
  - Instagram (`/api/webhooks/instagram`): validar assinatura com `INSTAGRAM_APP_SECRET`.
  - Stripe (`/api/stripe/webhook`): validar com `stripe.webhooks.constructEvent` e `STRIPE_WEBHOOK_SECRET`.
  - QStash (`/api/internal/flush`): validar assinatura com `verifyQstashSignature` (`QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`).
  - Crons (`/api/cron/*`): validar header `Authorization: Bearer <CRON_SECRET>`.
- **Idempotência obrigatória:** todo webhook e job assíncrono deve deduplicar eventos (`ch:dedup:*` no Redis, `processed_messages`, `dedup_keys`, `stripe_webhook_events`) para suportar reentregas sem duplicar mensagens, agendamentos ou cobranças.
- **Rate limiting:** preserve `checkRateLimitAsync` (`lib/rate-limit.ts`) em endpoints públicos, auth e webhooks.

## Segredos e Client-Side
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `WHATSAPP_APP_SECRET`, `ADMIN_PASSWORD`, `CRON_SECRET` ou chaves de API de IA em arquivos client-side ou variáveis `NEXT_PUBLIC_*`.
- Nunca commite `.env`, `.env.local` ou chaves reais. Atualize `.env.example` sempre que adicionar ou remover uma variável de ambiente.

## Banco de Dados e Migrations
- **Nunca edite migrations SQL já aplicadas em produção** (`supabase/migrations/003_*.sql` a `081_*.sql`).
- Crie sempre novas migrations incrementais e **avise e peça confirmação explícita ao usuário** antes de aplicar qualquer migration ou operação destrutiva em banco de produção.
- Em funções SQL `SECURITY DEFINER`, defina sempre `SET search_path = public` e restrinja permissões (`REVOKE ALL ... FROM anon, public`).
