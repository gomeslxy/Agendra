# Navigation & Routing Audit — 2026-05-09

Auditoria completa do sistema de navegação Next.js App Router do Agendra.
Sintoma reportado: **URL muda, interface não atualiza**.

---

## Resumo executivo

7 bugs reais identificados via investigação sistemática (no chute). Causa
raiz dominante: o **shell do `(app)` usava `<AnimatePresence mode="wait">`
com `key={pathname}` envolvendo todo o conteúdo de RSC**, e o **settings
shell lia o hash apenas no mount** — então clicar em um link de sidebar
para `/settings#flows` enquanto já em `/settings` mudava só a URL, sem
atualizar a aba. O topbar ainda redirecionava agressivamente para
`/leads` em qualquer keystroke, o que parecia "navegação aleatória".

Todos os 7 bugs corrigidos em 7 arquivos. `tsc` limpo nos arquivos
tocados (erros remanescentes são pré-existentes em `lib/ai/*` e
`app/api/stripe/webhook` — fora do escopo de navegação).

---

## Bugs e fixes

### 1. Settings — abas não reagiam à mudança de hash *(causa raiz principal)*

**Arquivo:** `app/(app)/settings/settings-shell.tsx`

**Causa:** `useEffect(..., [])` rodava apenas no mount. Quando o usuário
já estava em `/settings#persona` e clicava em `/settings#flows` na
sidebar, o pathname não mudava, o template não remontava, o effect não
rodava de novo, e `tab` ficava preso em `persona`. URL mudava, UI não.

**Fix:** Effect dedicado que escuta `hashchange` continuamente. Effect
adicional sincroniza hash → tab quando o usuário clica em uma aba
internamente. OAuth callback isolado em effect próprio.

**Impacto:** Itens "Persona da IA", "Fluxos", "Canais", "Atendentes" da
sidebar agora trocam a aba mesmo já estando na rota `/settings`.

---

### 2. AppShell — `AnimatePresence mode="wait"` bloqueava render

**Arquivo:** `components/app/app-shell.tsx` *(reescrito)*
**Novo:** `app/(app)/template.tsx`

**Causa:** O wrapper `<AnimatePresence mode="wait">` com
`<motion.main key={pathname}>` força React a esperar a animação de
*exit* terminar antes de montar o novo conteúdo. Combinado com
`absolute inset-0` e RSC streaming, em certas condições o conteúdo
novo nunca aparece (a AnimatePresence segura a árvore antiga). Mesmo
quando funcionava, adicionava latência de 60ms+ a cada nav e podia
causar flash de tela em branco.

**Fix:** AppShell virou um shell estático puro (`<main>` simples). A
animação de entrada por rota foi movida para `app/(app)/template.tsx`
— o padrão oficial do App Router para esse caso. `template.tsx`
remonta automaticamente em cada navegação e a animação é só de
entrada (sem `exit` gate). Sem framer freeze, sem `mode="wait"`.

**Impacto:** Trocas de página (`/inbox` → `/agenda` → `/leads` etc.)
agora atualizam o conteúdo imediatamente. Sem mais "interface presa".

---

### 3. Sidebar — botão Upgrade fazia full-reload

**Arquivo:** `components/app/sidebar.tsx`

**Causa:** `onClick={() => { window.location.href = "/settings#billing"; }}`
provoca um page reload completo ao invés de navegação SPA. Estado
client é perdido, AuthProvider re-hidrata, RSC inteiro é refetched.

**Fix:** Trocado por `<Link href="/settings#billing">` envolvendo o
Button.

---

### 4. Topbar — busca redirecionava para `/leads` a cada tecla, em qualquer página

**Arquivo:** `components/app/topbar.tsx`

**Causa:** O effect com debounce de 500ms chamava
`router.push("/leads?q=...")` sempre que `query` mudava — independente
da página atual. Estando em `/inbox`, digitar "abc" jogava o usuário em
`/leads`. Adicionalmente, `lastPushed.current` persistia entre
mudanças de pathname → dedupe stale.

**Fix:**
- Live search (com `router.replace`, não `push`) só roda quando
  `pathname.startsWith("/leads")`. Dedupe via `replace` e o próprio
  guard.
- Em outras páginas, busca é submetida apenas com **Enter**
  (`handleSearchKeyDown`).
- `lastPushed` ref removida — desnecessária com `replace`.

**Impacto:** Inbox/Agenda/Reports não jogam mais o usuário no Leads
durante digitação.

---

### 5. Topbar — CTA "Novo fluxo" navegava para `/leads`

**Arquivo:** `components/app/topbar.tsx`

**Causa:** Botão rotulado "Novo fluxo" mas `onClick={() => router.push("/leads")}`
— inconsistente com o label.

**Fix:** Substituído por `<Link href={cta?.href ?? "/settings#flows"}>`
(combina com o label e com `NAV` em `lib/constants.ts`). Prop `cta`
agora aceita `href` para override por página.

---

### 6. Lead drawer — `<a href="/inbox">` em vez de `<Link>`

**Arquivo:** `app/(app)/leads/leads-client.tsx`

**Causa:** Anchor cru → reload completo da página, descarta o estado
do drawer e do filtro. UX degradada.

**Fix:** `<Link>` do `next/link`. Adicionado `onClick` que fecha o
drawer (`setSelectedLead(null)`) antes da navegação para evitar
flash do drawer sobre a página de destino.

---

### 7. `pageTransition` — SSR/CSR variant mismatch

**Arquivo:** `components/motion/variants.ts`

**Causa:** `prefersReducedMotion` calculado em escopo de módulo via
`typeof window !== "undefined" && matchMedia(...)`. Em SSR resolve
`false`; em hidratação no client com user reduced-motion=on, o módulo
é executado de novo e `pageTransition` vira a versão "rápida". Variants
diferentes entre servidor e cliente → potencial hydration warning e
flicker.

**Fix:** Removido o branch. Variants estáticas. Reduced-motion já é
honrado globalmente por `<MotionConfig reducedMotion="user">` em
`components/motion/motion-provider.tsx` — framer aplica
automaticamente.

---

## Arquivos alterados

| Arquivo | Mudança |
|--------|---------|
| `app/(app)/settings/settings-shell.tsx` | hashchange listener contínuo, sync tab→hash, OAuth toast isolado |
| `components/app/sidebar.tsx` | `<Link>` no Upgrade |
| `components/app/topbar.tsx` | search só em `/leads` + Enter handler, CTA `<Link>` |
| `app/(app)/leads/leads-client.tsx` | `<Link>` no drawer |
| `components/app/app-shell.tsx` | shell puro, sem AnimatePresence |
| `app/(app)/template.tsx` | **novo** — page transition por rota |
| `components/motion/variants.ts` | `pageTransition` estável SSR/CSR |

---

## Padrões definidos (anti-regressão)

1. **Soft nav obrigatória.** Nunca usar `window.location.href` ou
   `<a href>` para rotas internas. Usar `<Link>` ou `router.push`.
   Exceção: redirecionamentos para fora do app (Stripe checkout, OAuth
   externo) — esses continuam com `window.location.href`.

2. **Hash em URL = estado.** Componentes que leem `location.hash`
   precisam escutar `hashchange`, não apenas no mount. Ou mover o
   estado para `useSearchParams`/`pathname` quando possível.

3. **Page transitions via `template.tsx`.** Não embrulhar `{children}`
   no layout com `<AnimatePresence mode="wait">`. App Router já
   remonta o template a cada nav — animação só de entrada.

4. **Variants estáveis SSR/CSR.** Não derivar variants do `window`
   em escopo de módulo. Reduced-motion via `<MotionConfig
   reducedMotion="user">`.

5. **Busca global ≠ navegação automática.** Inputs de busca no
   topbar não devem `router.push` em páginas que não são o destino
   da busca. Usar Enter.

6. **CTA contextual.** Botão de ação primária no topbar deve aceitar
   um prop `cta?: { label, href }` para a página customizar — em vez
   de hard-coded.
