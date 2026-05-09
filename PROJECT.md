# 🛡️ Agendra — OBSIDIAN FIRST
> **ATENÇÃO AGENTE:** Antes de qualquer alteração, você **DEVE** ler a pasta `/docs`. O Obsidian é a fonte de verdade real deste projeto. Qualquer mudança no código deve ser refletida lá imediatamente.

# Agendra — Projeto

IA que responde, qualifica e agenda leads em WhatsApp, Instagram e formulários — em português brasileiro, com voz de marca configurável.

> **A documentação oficial e o estado real do projeto estão no Obsidian (pasta [./docs](./docs)).**
> Veja [docs/01 - PRODUTO/visao-geral.md](./docs/01%20-%20PRODUTO/visao-geral.md) para começar.

---

## ⚠️ Diretriz Técnica Obrigatória (Frameworks e Qualidade)

Este projeto **NÃO deve ser construído sem frameworks modernos**.

Frameworks são obrigatórios para garantir:
- alta qualidade de código
- escalabilidade
- performance
- organização
- facilidade de manutenção

### 🧱 Stack obrigatória

**Frontend**
- **Next.js** (App Router, React 19, Server Components onde fizer sentido)
- **TailwindCSS** (v4, mobile-first)
- **Framer Motion** (animações e motion design)
- **TypeScript** estrito

**Backend**
- **Supabase** (Postgres + Auth + Realtime + Storage) — ou alternativa equivalente moderna

**IA**
- OpenAI / Claude API (motor de qualificação)

**Integrações**
- WhatsApp Cloud API
- Google Calendar
- Stripe (billing)

### 🎯 Diretrizes de implementação

- Código **modular e bem estruturado** (componentes pequenos, server vs client claro)
- **Componentes reutilizáveis** em `components/` e `components/ui/`
- Boas práticas modernas de frontend (hooks, suspense, streaming, RSC)
- **Performance** primeiro (LCP/CLS/INP), code-splitting via dynamic imports onde apropriado
- **Mobile-first**, responsividade completa, breakpoints Tailwind padronizados
- A11y: contraste AA, foco visível, `prefers-reduced-motion`

### 🎬 Motion Design (IMPORTANTE)

Animações modernas e de alta qualidade:
- transições suaves entre páginas/seções (`AnimatePresence` + layout)
- entrada com **fade + slide** (variants reutilizáveis)
- microinterações em botões e elementos (`whileHover`, `whileTap`)
- hover refinado (escala sutil, glow, sheen)
- animações de **scroll** (`useInView`, `useScroll`, parallax leve)
- uso avançado de Framer Motion (orchestration, stagger, spring physics)

Padrão visual:
- fluido · leve · elegante
- **nunca exagerado ou pesado**
- respeitar `prefers-reduced-motion`

### 💎 Qualidade Visual

Objetivo: **interface premium nível startup internacional**.

- visual moderno e sofisticado
- efeitos visuais bem trabalhados (**liquid glass**, aurora gradients, sheen)
- tipografia refinada (Inter Tight + Inter Italic VF)
- espaçamento generoso, hierarquia clara
- micro-detalhes em todos os estados

**Evitar**:
- HTML puro sem estrutura
- CSS desorganizado / inline aleatório
- soluções improvisadas
- código legado / ultrapassado

### 🔥 Regra Final

**qualidade > velocidade**

Produto real de alto nível, não protótipo simples.

---

## Stack atual deste repo

```
Next.js 15 (App Router) + React 19 + TypeScript
TailwindCSS v4 (CSS-first config)
Framer Motion 12
Lucide React (ícones)
@supabase/supabase-js (auth + db, scaffolded)
```

Bundle: Turbopack (dev). Build: `next build`.

---

## Como rodar

```bash
# instalar deps
pnpm install   # ou npm install / yarn

# dev (Turbopack)
pnpm dev

# build prod
pnpm build && pnpm start
```

Variáveis de ambiente em `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
WHATSAPP_TOKEN=
```

---

## Estrutura

```
Agendra/
├── app/
│   ├── layout.tsx              shell global (fonts, providers, motion)
│   ├── page.tsx                landing pública
│   ├── globals.css             tokens Tailwind v4 + glass + motion primitives
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   └── (app)/
│       ├── layout.tsx          sidebar + topbar com page transitions
│       ├── inbox/page.tsx
│       ├── agenda/page.tsx
│       ├── leads/page.tsx
│       ├── reports/page.tsx
│       └── settings/page.tsx
├── components/
│   ├── landing/                Header, Hero, HowItWorks, ProductDemo, Benefits, Proof, UseCases, FinalCTA, Footer
│   ├── app/                    Sidebar, Topbar, ChatBubble, LeadRow, KpiCard, AgendaCalendar, ...
│   ├── motion/                 variants, MotionWrapper, FadeUp, Stagger
│   └── ui/                     Button, Badge, Glass, Input, Switch, Tabs, Chip
├── lib/
│   ├── supabase/               client browser + server
│   ├── utils.ts                cn(), formatters
│   └── constants.ts            NAV, HEAT_COLOR, etc.
├── public/
│   ├── assets/                 logo + glyph SVG
│   └── fonts/                  Inter Italic VF
├── _prototype/                 versão vanilla original (referência visual fiel — não importar)
├── _design/                    bundle Claude Design (fonte de verdade)
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
├── package.json
├── PROJECT.md                  este arquivo
└── PRODUCT.md                  definição de produto
```

---

## Design System (tokens em globals.css + tailwind.config)

- **Paleta**: graphite `#0F172A`, blue-core `#2563EB`, teal-flow `#14B8A6`, orange-spark `#F97316`
- **Heat semantics**: hot · warm · cold · success
- **Liquid glass**: classe utility `.glass` (tinta + hairline + sheen) — sempre usar, não recriar
- **Aurora background**: `.bg-aurora` em layouts marketing/auth
- **Tipografia**: Inter Tight (upright), Inter Italic VF (ênfase em `<em>`), JetBrains Mono (números)
- **Motion tokens**: durations + easings expostos como CSS vars + variants reutilizáveis em `components/motion/`

Regras:
- Não usar cores fora dos tokens. Adicionar primeiro em `tailwind.config` se precisar.
- `<em>` sempre cai no Inter Italic VF.
- Animação decorativa precisa de fallback `prefers-reduced-motion`.

---

## Padrões de código

**Componentes**
- Server Component por padrão. `"use client"` apenas onde precisar de hooks/Framer Motion/event handlers.
- Props tipadas com TS. Sem `any`.
- Composição via `children` antes de prop-drilling.

**Estilos**
- Tailwind nas classes. CSS custom em `globals.css` apenas para tokens, glass, aurora, keyframes.
- `cn()` (clsx + tailwind-merge) para mesclar classes.
- Sem `style={{}}` inline exceto valores dinâmicos.

**Motion**
- Variants em `components/motion/variants.ts`. Reutilizar `fadeUp`, `stagger`, `spring`.
- Page transitions: `AnimatePresence` + `motion.main` no `(app)/layout.tsx`.
- Scroll: `useInView` + `viewport={{ once: true, margin: "-80px" }}`.
- Hover: `whileHover={{ y: -2 }}` + `transition={{ type: "spring", stiffness: 400, damping: 25 }}`.

**Adicionar nova página app**
1. `app/(app)/<rota>/page.tsx`
2. Importar shell já provido por `(app)/layout.tsx`
3. Adicionar item em `lib/constants.ts` → `NAV`
4. Componentes específicos em `components/app/<rota>/`

---

## Voz e conteúdo

- pt-BR primário. Tom próximo, caloroso, sem corporativês.
- Banidas: "desculpe pelo transtorno", "infelizmente", "não posso ajudar".
- CTAs no infinitivo: "Começar grátis", "Conectar".
- Eyebrows em CAIXA ALTA com tracking generoso (`tracking-[0.18em] uppercase`).

---

## Mapa de páginas → módulos do PRODUCT.md

| Página              | Cobre módulo do produto                  | Status   |
|---------------------|------------------------------------------|----------|
| `/`                 | Landing pública (vendas)                 | ✅ UI    |
| `/login`            | Auth                                     | ✅ UI    |
| `/signup`           | Auth + onboarding                        | ✅ UI    |
| `/inbox`            | Inbox + intervenção manual               | ✅ UI    |
| `/agenda`           | Agendamento                              | ✅ UI    |
| `/leads`            | Pipeline                                 | ✅ UI    |
| `/reports`          | Visão geral · KPIs                       | ✅ UI    |
| `/settings`         | Persona IA · Canais · Fluxos · Time      | ✅ UI    |
| —                   | Captura WhatsApp Cloud API               | 🔲 backend |
| —                   | Motor de IA (intenção, qualificação)     | 🔲 backend |
| —                   | Follow-up automático                     | 🔲 backend |
| —                   | Stripe billing                           | 🔲 backend |

---

## TODO

- [x] Conectar Supabase (auth real)
- [x] WhatsApp Cloud API webhook em `app/api/whatsapp/route.ts` (Multi-tenant)
- [x] Motor de IA (Gemini 2.0 Flash) processando intents + Tool Calling (`lib/ai/engine.ts`)
- [x] Conexão OAuth com Google Calendar (Helper + OAuth Route)
- [x] Assinatura Supabase Realtime no front-end (`/inbox` e `/leads`)
- [ ] Sincronização de eventos GCal -> DB local (Sync Job)
- [ ] Interface para o atendente pausar a IA e responder manualmente
- [ ] Funcionalidade de criar e editar a Persona/Prompt completa no `/settings`
- [ ] Stripe checkout + webhook em `/api/stripe/webhook`
- [ ] `prefers-reduced-motion` em todas as animações decorativas
- [ ] Substituir Lucide por SVGs branded em `components/icons/`
- [ ] Testes E2E (Playwright) nos fluxos críticos: login → inbox → agenda

---

## Origem

- Design entregue por Claude Design (claude.ai/design) em 2026-05-06.
- Bundle fonte: `_design/agendra-design-system/` — não modificar; é a referência visual.
- `_prototype/` guarda o port vanilla HTML/CSS/JS inicial — **não importar daqui**, serve como referência visual fiel.
- Implementação atual: Next.js + TS + Tailwind + Framer Motion (este repo).
