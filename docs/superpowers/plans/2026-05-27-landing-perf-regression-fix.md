# Landing & /contato Performance Regression Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverter regressão de performance em `/` e `/contato` (Lighthouse caiu para 90 desktop / 77 mobile, LCP 3.22s / 4.1s) restaurando lazy-loading removido nas mudanças não-commitadas, depois elevar performance acima do baseline anterior atacando hero animation cost, fontes, middleware overhead em rotas públicas.

**Architecture:**
- **Fase 1 (Cirúrgica)**: Restaurar `next/dynamic` para seções below-fold de `app/page.tsx` e `app/contato/page.tsx`. Preservar correções de navegação cross-page (header/footer com `/#section`) e ajustes de UX (WhatsApp/Login links) — essas NÃO são regressão.
- **Fase 2 (Performance além do baseline)**: (a) substituir framer-motion no Hero right column por animação CSS (LCP-critical path), (b) escopo do middleware para evitar `supabase.auth.getUser()` em rotas públicas (TTFB), (c) reduzir pesos de fonte preloaded, (d) min-height de skeletons para zerar CLS.
- **Fase 3 (Verificação)**: Build size analysis (`First Load JS`), Lighthouse desktop+mobile, manual smoke test de navegação por âncoras cross-page.

**Tech Stack:** Next.js 16 App Router, React 19, framer-motion, Tailwind, Supabase SSR (middleware), Vercel.

---

## Diagnóstico (Phase 0 — Já concluído)

### Causa-raiz confirmada por evidência

**Comparação git diff HEAD `app/page.tsx`:**

Working tree REMOVEU lazy-loading que o commit `c7bc42f perf(landing): lazy-load below-fold sections` introduziu:

```diff
- const ProductDemo = nextDynamic(() => import("@/components/landing/product-demo").then((m) => m.ProductDemo), { loading: SectionSkeleton });
- const Benefits   = nextDynamic(() => import("@/components/landing/benefits").then((m) => m.Benefits), { loading: SectionSkeleton });
- const Proof      = nextDynamic(() => import("@/components/landing/proof").then((m) => m.Proof), { loading: SectionSkeleton });
- const UseCases   = nextDynamic(() => import("@/components/landing/use-cases").then((m) => m.UseCases), { loading: SectionSkeleton });
- const FAQ        = nextDynamic(() => import("@/components/landing/faq").then((m) => m.FAQ), { loading: SectionSkeleton });
- const FinalCTA   = nextDynamic(() => import("@/components/landing/final-cta").then((m) => m.FinalCTA), { loading: SectionSkeleton });
- const Footer     = nextDynamic(() => import("@/components/landing/footer").then((m) => m.Footer), { loading: SectionSkeleton });
+ import { ProductDemo } from "@/components/landing/product-demo";
+ import { Benefits }   from "@/components/landing/benefits";
+ ...todos imports diretos
```

**Working tree também removeu lazy `ContatoForm`/`Footer` em `app/contato/page.tsx`.**

### Impacto na render path

| Componente eagerly bundled agora | Carga client (estimativa) | Razão de ser caro |
|---|---|---|
| `ProductDemo` | ~25KB (`useReducer`, `useEffect` IntersectionObserver, `motion`, `AnimatePresence`, state machine de chat) | Componente client mais pesado below-fold |
| `Benefits` | ~6KB (BentoGrid) | "use client" |
| `UseCases` | ~5KB (6× FadeUp) | 6 IntersectionObservers paralelos |
| `Proof` / `FAQ` / `FinalCTA` | ~4–8KB cada | `FadeUp` em todos |
| `Footer` | ~5KB | Bundled mesmo só renderizando ao final |
| `ContatoForm` | ~15KB (form state + framer-motion + Card UI completo) | Único conteúdo "use client" pesado de `/contato` |

**Conclusão:** Bundle inicial de `/` cresceu ~50–60KB gzipped. Bundle inicial de `/contato` cresceu ~15–20KB gzipped. Hidratação eager de IntersectionObservers below-fold = trabalho main-thread durante o LCP do Hero → LCP +0.8–1.2s, principalmente em mobile (CPU lento).

### Mudanças que NÃO são regressão (manter)

- `components/landing/header.tsx`: usa `usePathname` para detectar `/` e fazer smooth-scroll em hash links, hard nav em outras rotas. Hrefs mudaram `#x` → `/#x`. **Correta** — sem isso, "Como funciona" quebra em `/contato`. Memory `feedback_animatepresence_mode_wait_freezes_nav` reforça evitar tocar em padrão de nav que já funciona.
- `components/landing/footer.tsx`: mesmo fix (`#x` → `/#x`). **Correta.**
- `app/contato/contato-form.tsx`: WhatsApp virou `<a href="https://wa.me/...">`, Dashboard virou `<Link href="/login">`. **UX correta.**
- `app/api/cron/*/route.ts`: mudanças não relacionadas à perf das landing pages. **Fora do escopo deste plano.**

### Por que rotas internas (/inbox, /settings) não sofreram

- Estão atrás de auth → não são candidatos a LCP público
- Lighthouse rodando em rota autenticada raramente — usuário compara o que importa para conversão (landing + contato)
- Bundle interno já é code-split por rota; lazy-loading da landing era a única alavanca removida

### Hipótese da TTFB 0.67s (pré-existente, não regressão, mas atacar na Fase 2)

`middleware.ts` roda `supabase.auth.getUser()` em TODAS rotas exceto `api|_next|favicon|assets|fonts|*.svg|*.png|*.jpg|*.webp|*.woff2?` — inclui `/` e `/contato`. `getUser()` faz round-trip a `auth.supabase.co`. Para visitantes anônimos é trabalho desperdiçado. Único uso útil em rota pública: redirect `/ → /inbox` se logado. Pode ser feito client-side ou com check de cookie sem rede.

---

## File Structure

**Arquivos a modificar (Fase 1 — surgical revert):**
- `app/page.tsx` — restaurar lazy imports below-fold
- `app/contato/page.tsx` — restaurar lazy `ContatoForm` + `Footer`

**Arquivos a modificar (Fase 2 — deep optimizations):**
- `components/landing/hero-animations.tsx` — converter `HeroRightAnimation` para CSS animation
- `app/globals.css` — adicionar keyframe `animate-hero-right`
- `app/layout.tsx` — reduzir weights de `JetBrains_Mono` + revisar `preload`
- `middleware.ts` — escopo restrito + early-return em rotas públicas

**Arquivos a criar:**
- `components/landing/section-skeleton.tsx` — extrair skeleton para reuso (DRY) com `min-height` correto

**Arquivos a NÃO tocar:** componentes UI (`components/ui/*`), `next.config.ts` (já bem configurado com `optimizePackageImports`), `app/api/cron/*` (fora do escopo).

---

## Phase 1 — Surgical Revert (P0)

### Task 1: Extrair skeleton compartilhado

**Files:**
- Create: `components/landing/section-skeleton.tsx`

- [ ] **Step 1: Criar componente skeleton com altura controlada**

```tsx
// components/landing/section-skeleton.tsx
import React from "react";

/**
 * Placeholder mostrado durante hydration de seções lazy-loaded.
 * min-height alinhado à altura típica das seções (evita CLS).
 */
export function SectionSkeleton({ minHeight = 350 }: { minHeight?: number }) {
  return (
    <div
      className="w-full flex items-center justify-center opacity-10"
      style={{ minHeight: `${minHeight}px` }}
      aria-hidden="true"
    >
      <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  );
}
```

- [ ] **Step 2: Verificar criação**

Run: `pnpm typecheck`
Expected: PASS sem warnings em `section-skeleton.tsx`.

### Task 2: Restaurar lazy-loading em `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Reescrever imports below-fold como `next/dynamic` SSR-on**

Reescrever de [linha 25 até final dos imports do arquivo](app/page.tsx#L25). Substituir os 7 imports diretos (`ProductDemo`, `Benefits`, `Proof`, `UseCases`, `FAQ`, `FinalCTA`, `Footer`) por `nextDynamic` com loading. **Manter `Header`, `Hero`, `HowItWorks` como imports eager** (above-fold).

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agendra — Lead novo, reunião marcada em segundos",
  description:
    "Agendra responde, qualifica e agenda leads do WhatsApp e Instagram em 4 segundos, 24/7. Sem fila, sem espera, sem lead perdido. Comece grátis.",
  alternates: { canonical: "https://www.agendra.site" },
  openGraph: {
    title: "Agendra — Lead novo, reunião marcada em segundos",
    description:
      "IA que responde, qualifica e agenda leads em 4 segundos, 24/7, pelo WhatsApp e Instagram.",
    url: "https://www.agendra.site",
  },
  twitter: {
    title: "Agendra — Lead novo, reunião marcada em segundos",
    description:
      "IA que responde, qualifica e agenda leads em 4 segundos, 24/7, pelo WhatsApp e Instagram.",
  },
};

export const dynamic = "force-static";

import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import nextDynamic from "next/dynamic";
import { SectionSkeleton } from "@/components/landing/section-skeleton";

// Below-fold — SSR mantido (default ssr: true), client JS lazy
const ProductDemo = nextDynamic(
  () => import("@/components/landing/product-demo").then((m) => m.ProductDemo),
  { loading: () => <SectionSkeleton minHeight={600} /> }
);
const Benefits = nextDynamic(
  () => import("@/components/landing/benefits").then((m) => m.Benefits),
  { loading: () => <SectionSkeleton minHeight={500} /> }
);
const Proof = nextDynamic(
  () => import("@/components/landing/proof").then((m) => m.Proof),
  { loading: () => <SectionSkeleton minHeight={300} /> }
);
const UseCases = nextDynamic(
  () => import("@/components/landing/use-cases").then((m) => m.UseCases),
  { loading: () => <SectionSkeleton minHeight={400} /> }
);
const FAQ = nextDynamic(
  () => import("@/components/landing/faq").then((m) => m.FAQ),
  { loading: () => <SectionSkeleton minHeight={450} /> }
);
const FinalCTA = nextDynamic(
  () => import("@/components/landing/final-cta").then((m) => m.FinalCTA),
  { loading: () => <SectionSkeleton minHeight={300} /> }
);
const Footer = nextDynamic(
  () => import("@/components/landing/footer").then((m) => m.Footer),
  { loading: () => <SectionSkeleton minHeight={200} /> }
);

export default function LandingPage() {
  return (
    <div className="bg-aurora min-h-screen">
      <Header isLoggedIn={false} />
      <main className="pt-[68px]">
        <Hero />
        <HowItWorks />
        <ProductDemo />
        <Benefits />
        <Proof />
        <UseCases />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
```

> **Nota técnica:** `next/dynamic` no App Router renderiza no server por padrão (ssr não-`false`). HTML completo continua sendo gerado em build (`force-static`). O skeleton só aparece em hydration mismatch ou client-side nav. Anchor `#como-funciona`, `#demo`, `#casos` continuam funcionando porque o HTML existe.

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

### Task 3: Restaurar lazy-loading em `app/contato/page.tsx`

**Files:**
- Modify: `app/contato/page.tsx`

- [ ] **Step 1: Substituir imports diretos por `nextDynamic`**

```tsx
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { Header } from "@/components/landing/header";
import { SectionSkeleton } from "@/components/landing/section-skeleton";

// ── Static rendering — cached at the CDN edge ──────────────────
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Contato — Agendra",
  description:
    "Entre em contato com a Agendra. Tire dúvidas sobre a nossa IA de agendamento para WhatsApp e Instagram, solicite uma demonstração ou acesse o suporte.",
  alternates: { canonical: "https://www.agendra.site/contato" },
  openGraph: {
    title: "Contato — Agendra",
    description:
      "Entre em contato com a Agendra. Nossa equipe está pronta para ajudar.",
    url: "https://www.agendra.site/contato",
  },
};

// ── Lazy-loaded client islands ──────────────────────────────────
const ContatoForm = nextDynamic(
  () => import("./contato-form").then((m) => m.ContatoForm),
  { loading: () => <SectionSkeleton minHeight={600} /> }
);

const Footer = nextDynamic(
  () => import("@/components/landing/footer").then((m) => m.Footer),
  { loading: () => <SectionSkeleton minHeight={200} /> }
);

// ── Page ────────────────────────────────────────────────────────
export default function ContatoPage() {
  return (
    <div className="bg-aurora min-h-screen selection:bg-brand-blue-500/30">
      <Header isLoggedIn={false} />
      <main className="pt-24 pb-20 px-6">
        <ContatoForm />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

### Task 4: Build + bundle baseline pós-revert

- [ ] **Step 1: Limpar cache de build**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
Expected: sem erro.

- [ ] **Step 2: Build produção**

Run: `pnpm build`
Expected: build PASS. Anotar:
- `First Load JS` em `/` e `/contato` da saída do build
- `shared chunks` size

- [ ] **Step 3: Smoke test local**

Run: `pnpm start` (em background) → abrir http://localhost:3000/ e http://localhost:3000/contato no navegador.
Verificar:
- Hero renderiza imediatamente
- Scroll para baixo dispara fade dos sections
- Header link "Como funciona" smooth-scroll em `/`, hard nav em `/contato → /#como-funciona`
- Form de contato renderiza
- Sem layout shift visível

- [ ] **Step 4: Commit Fase 1**

```bash
git add components/landing/section-skeleton.tsx app/page.tsx app/contato/page.tsx
git commit -m "perf(landing): restore lazy-loading of below-fold sections

Reverts regression in working tree that converted next/dynamic
imports to direct imports on / and /contato. ProductDemo,
Benefits, Proof, UseCases, FAQ, FinalCTA, Footer (and ContatoForm
on /contato) now lazy-loaded again, with shared SectionSkeleton
providing min-height to prevent CLS.

Preserves the legitimate header/footer navigation fix
(/#section paths + usePathname) and contato-form UX improvements
(WhatsApp link, Dashboard Link wrap).

Refs: c7bc42f perf(landing): lazy-load below-fold sections"
```

---

## Phase 2 — Performance Above Baseline (P1)

### Task 5: Hero right column — framer-motion → CSS animation

**Why:** O Hero é a region de LCP. Cada componente `motion.div` adiciona JS de framer-motion ao critical path. `HeroLeftAnimation` já é CSS-driven (ver comentário no código). `HeroRightAnimation` ainda usa `motion.div initial/animate` — converter para CSS.

**Files:**
- Modify: `components/landing/hero-animations.tsx`
- Modify: `app/globals.css` (adicionar keyframe)

- [ ] **Step 1: Adicionar keyframe em `app/globals.css`**

Adicionar ao final do arquivo (após keyframes existentes):

```css
@keyframes hero-right-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-hero-right {
  animation: hero-right-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
  will-change: opacity, transform;
}

@media (prefers-reduced-motion: reduce) {
  .animate-hero-right {
    animation: none;
  }
}
```

- [ ] **Step 2: Substituir `HeroRightAnimation` por wrapper CSS**

Editar `components/landing/hero-animations.tsx`:

```tsx
"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShinyButton } from "@/components/ui/shiny-button";
import { trackEvent } from "@/lib/analytics";

// CSS-driven fade-up — zero hydration cost, h1 (LCP element) visible immediately
export function HeroLeftAnimation({ children }: { children: React.ReactNode }) {
  return <div className="animate-hero-left">{children}</div>;
}

// CSS-driven scale-in — replaces former motion.div to remove framer-motion from Hero
export function HeroRightAnimation({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`animate-hero-right ${className ?? ""}`}>{children}</div>
  );
}

export function HeroButtons() {
  const handleDemoClick = () => {
    trackEvent("cta_click", { location: "hero", target: "demo" });
    const demoEl = document.getElementById("demo");
    if (demoEl) {
      demoEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mt-7 flex flex-wrap gap-3">
      <Link
        href="/signup"
        onClick={() =>
          trackEvent("cta_click", { location: "hero", target: "signup" })
        }
      >
        <ShinyButton className="px-8 group">
          Começar grátis
          <ArrowRight
            size={18}
            className="ml-2 inline-block transition-transform group-hover:translate-x-1"
          />
        </ShinyButton>
      </Link>
      <Button
        variant="secondary"
        className="px-6 rounded-full border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10"
        onClick={handleDemoClick}
      >
        <Play size={14} className="mr-2" />
        Ver demo de 2 min
      </Button>
    </div>
  );
}
```

> **Resultado esperado:** `framer-motion` deixa de ser dependência do bundle inicial do Hero. Resta apenas em `HeroButtons` (que é interativa e pequena), `ChatPanel` (now lazy de novo), e outros below-fold lazy.

- [ ] **Step 3: Verificar visualmente**

Run: `pnpm dev`
Verificar:
- Hero right column ainda anima (fade + scale-in)
- Sem flicker
- DevTools → Performance: tarefa main-thread durante carga reduzida

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add components/landing/hero-animations.tsx app/globals.css
git commit -m "perf(landing): convert Hero right animation to CSS

Removes framer-motion from Hero LCP path. HeroRightAnimation
was the last motion.div in above-fold render; replaces with
CSS keyframe (hero-right-in) honoring prefers-reduced-motion.

Expected: -8-15KB initial JS, faster Hero LCP on mobile."
```

### Task 6: Reduzir peso de fontes preloaded

**Why:** `layout.tsx` carrega `Inter_Tight` (4 weights: 400/500/600/700) + `JetBrains_Mono` (2 weights: 400/500) com `preload: true` em ambos. JetBrains_Mono é usado apenas em rótulos pequenos (eyebrow, métricas em hero) — não é LCP-critical. Reduzir preload.

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Auditar uso real de `JetBrains_Mono`**

Run: `pnpm exec rg "font-mono|font-jetbrains" --type tsx --type css -l`
Expected: lista < 20 arquivos. Confirmar que nenhum é above-fold de `/`.

- [ ] **Step 2: Desativar preload + reduzir weights de JetBrains_Mono**

Editar [app/layout.tsx:14-21](app/layout.tsx#L14):

```tsx
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"], // 400 não é usado; manter só 500
  display: "swap",
  variable: "--font-jetbrains",
  preload: false, // não-crítica para LCP; carrega após first paint
  adjustFontFallback: true,
});
```

- [ ] **Step 3: Verificar visual**

Run: `pnpm dev`
Verificar:
- Eyebrow labels e métricas mono renderizam com mesmo peso
- Sem FOIT, fallback de mono aceitável em primeiros 100ms

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "perf(fonts): drop preload of JetBrains_Mono on landing

Mono font only used in small labels (eyebrow, hero stats);
removing preload + dropping unused weight 400 reduces
font requests on initial paint by 1, with no visible
regression (font-display: swap + fallback handles brief delay)."
```

### Task 7: Middleware — pular `getUser()` em rotas públicas

**Why:** `middleware.ts` chama `supabase.auth.getUser()` em toda rota não-`api|_next|assets`. Para `/`, é necessário (redirect logado → /inbox). Para `/contato`, `/planos`, `/sobre`, `/termos`, `/privacidade`, é desperdício de TTFB.

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Adicionar set de rotas públicas e early-return**

Editar `middleware.ts`. Adicionar acima de `middleware()`:

```ts
/** Rotas públicas que NUNCA precisam de auth check (TTFB-critical) */
const PUBLIC_PREFIXES = ["/contato", "/planos", "/sobre", "/termos", "/privacidade"];
```

Modificar `middleware()` para checar isso ANTES de criar o supabase client:

```ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast path: rotas marketing públicas — sem auth check, sem round-trip
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) {
    return NextResponse.next();
  }

  // Fast path: rota raiz sem cookie de sessão Supabase — anônimo, não precisa de getUser
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  if (pathname === "/" && !hasSupabaseCookie) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: any[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. Protected routes check
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // 2. Auth routes check (redirect to inbox if logged in)
    const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
    if (isAuthRoute && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }

    // 3. Root redirect for logged-in user
    if (pathname === "/" && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }
  } catch (e) {
    return response;
  }

  return response;
}
```

> **Por que detectar cookie em vez de sempre rodar `getUser()` em `/`:**
> 99% dos visitantes da landing são anônimos. Não têm cookie `sb-*-auth-token`. Detectar ausência do cookie é O(1), local, sem round-trip. Só se houver cookie, vale a pena chamar `getUser()` para validar e fazer redirect.

- [ ] **Step 2: Verificar que rotas protegidas continuam funcionando**

Run: `pnpm dev`
Testar:
- Acessar `/inbox` sem login → redireciona pra `/login?next=/inbox` ✓
- Acessar `/login` logado → redireciona pra `/inbox` ✓
- Acessar `/` logado → redireciona pra `/inbox` ✓
- Acessar `/` deslogado → serve landing ✓ (mais rápido que antes)
- Acessar `/contato` deslogado → serve direto ✓ (sem auth check)
- Acessar `/contato` logado → serve direto ✓ (público sempre)

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "perf(middleware): skip auth check on public marketing routes

Adds fast-path for /contato, /planos, /sobre, /termos, /privacidade —
no Supabase getUser() round-trip needed (no auth-aware behavior).

For /, checks for sb-*-auth-token cookie before calling getUser():
anonymous visitors (no cookie) get NextResponse.next() in microseconds
instead of waiting for Supabase auth roundtrip.

Expected TTFB improvement: ~300-500ms on cold landing requests."
```

### Task 8: Build final + Lighthouse

- [ ] **Step 1: Clean build**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; pnpm build`
Expected: PASS. Anotar `First Load JS` final.

- [ ] **Step 2: Deploy preview (opcional)**

Pedir ao usuário se quer fazer preview deploy via Vercel para Lighthouse real de produção.

- [ ] **Step 3: Lighthouse desktop**

Em browser, modo incógnito, http://localhost:3000/ → DevTools → Lighthouse → Desktop → Performance only.
Esperado:
- LCP < 2.0s (vs 3.22s baseline regredido)
- TBT < 200ms
- Score ≥ 95

- [ ] **Step 4: Lighthouse mobile (Moto G Power simulation)**

Mesmo fluxo, modo Mobile.
Esperado:
- LCP < 2.8s (vs 4.1s baseline regredido)
- TBT < 350ms
- Score ≥ 90

- [ ] **Step 5: Repetir para `/contato`**

Esperado:
- Desktop LCP < 1.5s
- Mobile LCP < 2.5s

---

## Phase 3 — Documentação

### Task 9: Atualizar Obsidian (Doc Protocol)

**Files:**
- Create: `obsidian/05 - LOGS/sessions/2026-05-27-landing-perf-regression-fix.md`
- Modify: `obsidian/05 - LOGS/_INDEX.md` (top 5)
- Modify: `obsidian/06 - BACKLOG/open/<topic>.md` se sobrar débito (e.g., follow-up para auditar lucide-react bundle)

Usar Obsidian CLI conforme `c:\antigravity projetos\Agendra\.claude\rules\05-completion.md`:

```powershell
& "C:\Users\lucas\AppData\Local\Programs\obsidian\Obsidian.com" `
  vault=obsidian create "05 - LOGS/sessions/2026-05-27-landing-perf-regression-fix.md"
```

Conteúdo da sessão deve cobrir:
- Causa-raiz (commits + working-tree diff)
- Fix surgical (Fase 1)
- Otimizações além do baseline (Fase 2)
- Métricas antes/depois (Lighthouse)
- Arquivos modificados

---

## Resultado Esperado

| Métrica | Baseline regredido | Pós-Fase 1 (revert) | Pós-Fase 2 (deep opt) |
|---|---|---|---|
| **Score / Desktop** | 90 | 94–96 | **97–99** |
| **Score / Mobile** | 77 | 88–91 | **92–95** |
| **LCP Desktop** | 3.22s | 2.0–2.3s | **1.4–1.7s** |
| **LCP Mobile** | 4.1s | 2.8–3.2s | **2.0–2.5s** |
| **TTFB Desktop** | 0.67s | 0.65s (inalterado) | **0.20–0.30s** |
| **First Load JS `/`** | ~250KB (estimado) | ~190KB | **~165KB** |
| **First Load JS `/contato`** | ~210KB | ~170KB | **~150KB** |

---

## Self-Review Checklist

**Spec coverage:**
- [x] Diagnóstico de regressão — Phase 0
- [x] Confirmação de causa — diff + análise por arquivo
- [x] Fix surgical menor possível — Tasks 1–4
- [x] Melhorias além do baseline — Tasks 5–8
- [x] Análise separada desktop/mobile — Phase 3 (Lighthouse mobile profile)
- [x] Lista de arquivos modificados + efeito de cada — "Resultado Esperado"
- [x] Reverter regressão sem destruir o que já funciona — preserva header/footer/contato-form UX

**No placeholders:** Cada step contém código exato, comando exato, expected output.

**Type consistency:** `SectionSkeleton` definido na Task 1 com signature `({ minHeight?: number })`, usado consistente em Tasks 2–3.

**Risk surface:** baixo. Mudanças são reversíveis (`next/dynamic` é trivial reverter, middleware fast-path é additivo).
