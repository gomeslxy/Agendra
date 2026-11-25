# Agendra — Regras do Projeto (Antigravity)

> Regras sempre ativas na raiz do repositório. Mantenha este arquivo enxuto e sincronizado com o código real.
> Regras detalhadas por domínio estão em `.agent/rules/`.

## Contexto e Stack Real

- **Produto:** Agendra — SaaS multi-tenant de atendimento, qualificação de leads e agendamento autônomo com IA.
- **Framework & UI:** Next.js 16 (`App Router`, Turbopack em dev), React 19, TypeScript 5 (`strict: true`), Tailwind CSS v4, Framer Motion, Recharts, Lucide React, Sonner.
- **Gerenciador de Pacotes:** **Apenas `pnpm`** (`pnpm@11.1.3`, `engines.node >=22 <26`). Nunca use `npm install` ou `yarn`.
- **Banco & Auth:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`) com PostgreSQL, RLS por `company_id`, Realtime e Vault para segredos de canal.
- **Infraestrutura Serverless:** Upstash Redis (`ioredis` TCP + fallback REST) para debounce, dedup, rate limit, circuit breaker e cache; Upstash QStash (`@upstash/qstash`) para agendamento de flush assíncrono; Vercel Crons (`vercel.json`).
- **Motor de IA:** Multi-provider (`lib/ai/providers/router.ts`) com fallback e circuit breaker: Gemini (`@google/generative-ai`, primário + embeddings RAG 768d), Cerebras (`openai` SDK), SambaNova e Groq (chat fallback + transcrição Whisper). TTS opcional via OpenAI (`ENABLE_TTS`).
- **Integrações:** WhatsApp Cloud API & Instagram Messaging (Meta Graph API + HMAC SHA-256), Google Calendar (OAuth2 + REST API nativa sem SDK), Stripe (checkout, portal, webhooks), Gmail SMTP via Nodemailer (`lib/email/send.ts`).
- **Testes:** Vitest (`pnpm test`).

## Regras Inegociáveis (Resumo)

1. **Idioma e Clareza:** Responda sempre em **português**, de forma direta, técnica e objetiva.
2. **Código-fonte é a verdade:** Sempre leia os arquivos reais antes de editar ou documentar. Nunca assuma comportamento por documentação antiga.
3. **TypeScript estrito:** Proibido introduzir `any`, `@ts-ignore` ou código morto. Valide entradas de API, payloads de webhook e outputs estruturados de IA com **Zod** (instalar `zod` antes de iniciar novas APIs/refatorações).
4. **Modularidade:** Evite arquivos monolíticos (>300 linhas). Ao tocar em arquivos legados grandes (ex: `settings-shell.tsx`, `engine.ts`, `inbox-client.tsx`), extraia módulos coesos em vez de inflá-los.
5. **Logs limpos:** Não deixe `console.log` solto em código de produção; use `lib/logging.ts` (`logDebug`, `logInfo`, `logError`) sem vazar dados sensíveis ou tokens.
6. **Multi-tenant & RLS:** NUNCA desabilite ou contorne RLS do Supabase. Toda query em dados de negócio DEVE isolar por `company_id`. Use `createAdminClient()` apenas em rotas de servidor/webhook/cron onde não há sessão de usuário, mantendo validação explícita de tenant.
7. **Webhooks & Segredos:** Valide assinaturas criptográficas (`X-Hub-Signature-256`, Stripe, QStash) em modo fail-closed em produção e garanta idempotência. Nunca exponha chaves privadas em Client Components ou variáveis `NEXT_PUBLIC_*`.
8. **Migrations SQL:** NUNCA altere migrations já aplicadas ou rode SQL destrutivo em produção sem avisar e confirmar com o usuário antes.
9. **Validação ao encerrar:** Antes de concluir tarefas de código, valide `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` (quando houver mudança estrutural) e atualize a documentação em `obsidian/` se a arquitetura mudar.

## Referências Modulares

- Padrões de código e arquitetura: `.agent/rules/code-standards.md`
- Guardrails de segurança e multi-tenant: `.agent/rules/security-multitenant.md`
- Fluxo de trabalho do agente: `.agent/rules/agent-workflow.md`
- Documentação viva do projeto: `obsidian/00-MOC-Agendra.md`
