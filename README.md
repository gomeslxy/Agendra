<div align="center">
  <img src="Agendra LOGO.png" alt="Agendra Logo" width="180" />
  <h1>Agendra 🚀</h1>
  <p><b>Inteligência Artificial que responde, qualifica e agenda leads em tempo real.</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-Database-green?logo=supabase)](https://supabase.com/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-blue?logo=tailwind-css)](https://tailwindcss.com/)
</div>

---

## 📌 Sobre o Agendra

O **Agendra** é um ecossistema multi-tenant (SaaS) projetado para revolucionar a forma como empresas gerenciam seus leads iniciais. Utilizando modelos de linguagem avançados (LLMs), o sistema automatiza o atendimento inicial em canais como **WhatsApp** e **Instagram**, garantindo que nenhum lead seja perdido por demora no retorno.

A solução não apenas responde dúvidas, mas executa um fluxo completo de **qualificação** e **agendamento direto** no calendário, permitindo que o time comercial foque apenas em fechar vendas com leads já preparados.

---

## 💎 Diferenciais

- **Liquid Glass Interface**: Dashboard sofisticado com efeitos de vidro, aurora gradients e micro-interações fluidas.
- **AI Engine (Conversational)**: Motor de IA com contexto profundo, evitando respostas robóticas e focando em conversão.
- **Lead Scoring Automático**: Classificação automática de leads em 🔥 Quente, 🟡 Morno ou ❄️ Frio baseada em intenção e urgência.
- **Agendamento Autônomo**: Integração nativa com calendários para fechamento de horários sem intervenção humana.
- **Multi-tenant Core**: Arquitetura robusta com isolamento total de dados e segurança via Row Level Security (RLS).

---

## 🛠️ Stack Tecnológica

- **Core**: [Next.js 15](https://nextjs.org/) (App Router, Server Components)
- **Frontend**: React 19, TypeScript, TailwindCSS v4
- **Animações**: Framer Motion 12 (Motion Design avançado)
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Storage)
- **Integrações**: WhatsApp Cloud API, Google Calendar, Stripe
- **Design System**: Shadcn/ui customizado com estética premium

---

## 🏗️ Estrutura do Projeto

```text
Agendra/
├── app/                # Rotas, layouts e handlers de API (Next.js)
├── components/         # Componentes UI, Dashboard e Shared
├── lib/                # Configurações de Supabase, Hooks e Utils
├── public/             # Assets estáticos e identidada visual
├── supabase/           # Migrations, Schemas e Triggers SQL
└── middleware.ts       # Proteção de rotas e gestão de sessões
```

---

## 🚀 Como Começar

### Pré-requisitos

- Node.js 20+
- PNPM (recomendado) ou NPM
- Instância no Supabase

### Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/gomeslxy/Agendra.git
   ```

2. **Instale as dependências:**
   ```bash
   pnpm install
   ```

3. **Configure as variáveis de ambiente:**
   - Copie `.env.example` para `.env.local`
   - Preencha as chaves do Supabase, WhatsApp e Stripe.

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm dev
   ```

---

## 📜 Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE) para mais informações.

---

## 🤖 Agent Rules & Governance

Este projeto utiliza diretrizes estritas para agentes de IA para garantir consistência e qualidade:

- **Claude**: Consulte [CLAUDE.md](./CLAUDE.md) para regras de operação e padrões de código.
- **Antigravity**: Consulte [ANTIGRAVITY.md](./ANTIGRAVITY.md) para protocolos de design premium e integração.
- **Rules**: Regras globais de gatilho estão em [.agents/rules/rules.md](./.agents/rules/rules.md).

### 🗺️ Mapa de Documentação (Obsidian)
O cofre em [obsidian/](./obsidian/) contém a alma do projeto:
- `01 - PRODUTO/`: [Visão Geral](./obsidian/01%20-%20PRODUTO/visao-geral.md) e [Roadmap](./obsidian/01%20-%20PRODUTO/roadmap.md).
- `02 - ARQUITETURA/`: [Stack Técnica](./obsidian/02%20-%20ARQUITETURA/stack-tecnica.md) e APIs.
- `03 - DESIGN/`: [Design System](./obsidian/03%20-%20DESIGN/design-system.md) e Tokens.
- `04 - LOGS/`: [Histórico de Sessões](./obsidian/04%20-%20LOGS/sessions.md).
- `05 - BACKLOG/`: [Dívida Técnica](./obsidian/05%20-%20BACKLOG/backlog.md).

---

<p align="center">
  Desenvolvido por <b>Lucas Gomes do Amaral</b>
</p>


