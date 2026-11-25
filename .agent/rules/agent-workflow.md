# Fluxo de Trabalho do Agente — Agendra

## Comunicação
- Responda sempre em **português** de forma direta, estruturada e sem rodeios.
- Quando houver ambiguidade real de produto ou risco em produção, pergunte antes de agir.
- Nunca esconda limitações ou verificações não executadas (ex: ambiente sem `node_modules` ou sem `.env.local`).

## Antes de Editar Código
1. Leia os arquivos envolvidos, seus chamadores e utilitários compartilhados antes de propor ou aplicar mudanças.
2. Consulte `obsidian/00-MOC-Agendra.md` quando a tarefa envolver arquitetura, banco, integrações ou dívida técnica.
3. Mantenha o escopo mínimo necessário: não refatore nem reformate arquivos fora do objetivo da tarefa.

## Durante e Após a Implementação
- Use exclusivamente **`pnpm`** (nunca `npm` ou `yarn`) para instalar pacotes e rodar scripts.
- Ao encerrar qualquer alteração de código, execute as validações aplicáveis:
  - `pnpm typecheck` (`tsc --noEmit`)
  - `pnpm lint` (`eslint .`)
  - `pnpm test` (`vitest run`)
  - `pnpm build` (quando houver mudança em rotas, configs, imports server/client ou dependências)
- Corrija todos os erros antes de concluir. Se algum check falhar por motivo pré-existente fora do escopo, reporte explicitamente.

## Manutenção da Documentação
- Sempre que mudar arquitetura, tabelas/migrations, chaves Redis, integrações, variáveis de ambiente ou dívida técnica relevante:
  - Atualize `.env.example` (se houver mudança em `process.env.*`);
  - Atualize a nota correspondente em `obsidian/` (`00-MOC-Agendra.md` a `05-Divida-Tecnica-e-Bugs.md`).
