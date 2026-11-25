# Padrões de Código — Agendra

## TypeScript e Tipagem
- `tsconfig.json` usa `strict: true` e `allowJs: false`.
- **Proibido introduzir `any`**, `as any` ou `@ts-ignore` em código novo ou refatorado. Use `unknown` com narrowing ou tipos explícitos.
- Remova imports não utilizados, variáveis mortas e dependências sem uso no `package.json`.
- Prefira tipos derivados do schema real (`lib/types/database.ts`, `lib/types/supabase.ts`).

## Validação de Entradas e Outputs de IA
- Toda entrada externa (Route Handlers em `app/api/`, Server Actions, payloads de webhook e respostas estruturadas/tool args de LLM) deve ser validada com **Zod** (`safeParse`) antes de tocar no banco ou disparar efeitos colaterais.
- Retorne erros HTTP padronizados (`400`, `401`, `403`, `404`, `429`, `500`) com mensagens claras e sem expor stack traces internos ao cliente.

## Modularidade e Tamanho de Arquivos
- **Limite alvo: ~300 linhas por arquivo.**
- Separe responsabilidades claramente:
  - `app/**/page.tsx`: Server Components enxutos para carregamento de dados e autorização.
  - `components/**`: componentes de UI pequenos e reutilizáveis.
  - `lib/**`: lógica de domínio pura, adapters de provedores e acesso a infraestrutura.
- Ao modificar arquivos monolíticos legados (`settings-shell.tsx`, `lib/ai/engine.ts`, `inbox-client.tsx`, `app/admin/actions.ts`), prefira extrair helpers/subcomponentes em vez de aumentar o monólito.

## Observabilidade e Logs
- **Não adicione `console.log` solto em produção.**
- Use `lib/logging.ts` (`logDebug`, `logInfo`, `logError`) para logs estruturados.
- Nunca logue tokens, refresh tokens, senhas, payloads completos com PII ou segredos de webhook.

## Front-end (Next.js App Router + Tailwind v4)
- Prefira Server Components por padrão; adicione `"use client"` apenas onde houver estado interativo, hooks ou eventos de navegador.
- Mantenha pacotes server-only (`exceljs`, `nodemailer`, SDKs de IA, `ioredis`, `stripe`) fora de bundles client-side (respeitando `serverExternalPackages` em `next.config.ts`).
- Não adicione `@supabase/ssr` ou `@supabase/supabase-js` em `experimental.optimizePackageImports` (causa erro de resolução no Turbopack).
