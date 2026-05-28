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

O **Agendra** é um ecossistema SaaS (Multi-tenant) projetado para revolucionar a forma como empresas gerenciam seus leads iniciais. Utilizando modelos de linguagem avançados (Multi-provider AI), o sistema automatiza o atendimento em canais como **WhatsApp** e **Instagram**, garantindo que nenhum lead seja perdido por demora no retorno.

A solução não apenas responde dúvidas, mas executa um fluxo completo de **qualificação**, **agendamento direto** no Google Calendar e **gestão comercial**, permitindo que o time comercial foque apenas em fechar vendas com leads já preparados.

---

## 💎 Diferenciais & Funcionalidades Premium

O projeto evoluiu rapidamente e hoje conta com ferramentas de nível corporativo (Enterprise-grade):

- **High-Contrast Minimal Slate Interface**: Dashboard sofisticado com tema dark profundo, contraste elevado de fontes e micro-interações fluidas.
- **Multi-Provider AI Router**: Fallback automático e inteligente entre modelos (Gemini Flash, Groq, Cerebras, SambaNova) utilizando um padrão Circuit Breaker, garantindo 99.9% de uptime para a IA.
- **Modo Copiloto (Shadow Mode)**: A IA pode ser configurada para não responder diretamente, mas sim gerar rascunhos que os humanos podem revisar, editar e aprovar via painel.
- **Compreensão de Áudio e Mídia**: Transcrição de áudio via Whisper (Groq) e análise de imagens com Gemini Vision.
- **Motor de Reengajamento (Follow-ups)**: Cron Jobs consolidados de inteligência que detectam leads frios ("ghosting") e os reativam no WhatsApp no momento ideal (delay configurável).
- **Integração Nativa de Calendário**: Sincronização avançada e bidirecional com Google Calendar, verificando conflitos e calculando fusos horários (`timezone`) em tempo real.
- **Lead Scoring & Sentimento**: Classificação automática de leads (🔥 Quente, 🟡 Morno, ❄️ Frio) baseada na urgência e detecção de sentimento durante a conversa.
- **Monetização e Limites Embutidos**: Integração com Stripe gerindo assinaturas, com limits dinâmicos (Analytics, RAG, Webhooks) controlados por planos (Trial, Starter, Pro, Business).
- **Fintech Conversacional**: Capacidade da IA de gerar cobranças PIX, e conferir status de pagamento diretamente do chat.
- **Central do Conhecimento (RAG)**: O usuário envia PDFs/DOCX e a IA estuda o material (HNSW 768D Indexing), usando isso para responder aos clientes.

---

## 🛠️ Stack Tecnológica

- **Core**: [Next.js 15](https://nextjs.org/) (App Router, Server Components)
- **Frontend**: React 19, TypeScript, TailwindCSS v4
- **Animações**: Framer Motion 12 (Motion Design avançado)
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Storage, Edge Functions)
- **Cache & Fila**: Upstash Redis (Debounce atômico, Fallbacks, Locks)
- **Integrações**: WhatsApp Cloud API, Google Calendar OAuth2, Stripe Webhooks
- **Design System**: Shadcn/ui customizado com estética High-Contrast Minimal Slate

---

## 🏗️ Estrutura do Projeto

```text
Agendra/
├── app/                # Rotas, layouts e handlers de API (Next.js)
├── components/         # Componentes UI (Dashboard, Inbox, Settings)
├── lib/                # Configurações do Supabase, Billing, Hooks e Utils
│   ├── ai/             # Motor de Inteligência Artificial, Debounce, Prompts
│   └── whatsapp/       # Integração com a Cloud API da Meta
├── public/             # Assets estáticos e identidade visual
├── supabase/           # Migrations, Schemas, Triggers SQL e pg_cron
└── obsidian/           # Documentação e Governança do Projeto
```

---

## 🚀 Como Começar

### Pré-requisitos

- Node.js 20+
- PNPM (Estritamente Recomendado)
- Instância no Supabase (com permissão para `pg_cron` e `pgvector`)
- Conta na Meta (WhatsApp Business API) e Stripe (opcional para faturamento)

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
   - Preencha as chaves do Supabase, WhatsApp, Stripe, e provedores de IA (Groq, Google).

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm dev
   ```

---

## 📜 Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE) para mais informações.

---

## 🤖 Regras dos Agentes e Governança

Este projeto adota **diretrizes estritas (Kaizen Protocol)** para desenvolvimento e manutenção automatizada:

- **Autonomia da IA**: Agentes (Claude, Antigravity, Cursor, etc) devem obedecer às Regras Globais e usar prioritariamente o PNPM.
- **Truth Source**: Todo o funcionamento, decisões arquiteturais e design systems devem ser sincronizados primeiramente pelo Vault do Obsidian antes da escrita de código.

### 🗺️ Mapa de Documentação (Obsidian)
O cofre em `obsidian/` contém a alma estrutural do Agendra:
- `00 - META/`: [Governança & Superpoderes (Regras Globais)](./obsidian/00%20-%20META/global-rules.md).
- `01 - PRODUTO/`: [Roadmap Atual](./obsidian/01%20-%20PRODUTO/roadmap.md) e Visão Estratégica.
- `02 - ARQUITETURA/`: Stack técnica, fluxos de banco de dados e APIs.
- `04 - DESIGN/`: [Design System](./obsidian/04%20-%20DESIGN/design-system.md) (Filosofia High-Contrast Minimal Slate).
- `05 - LOGS/`: [Histórico de Sessões](./obsidian/05%20-%20LOGS/sessions.md) documentando as Waves de evolução.
- `06 - BACKLOG/`: Débitos técnicos e planejamentos futuros.

---

<p align="center">
  Desenvolvido por <b>Lucas Gomes do Amaral</b>
</p>
