# Steel Precision Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Agendra's dark "High-Contrast Minimal Slate" theme with a light "Steel Precision" theme — white/near-white surfaces, blue primary navigation, orange conversion CTAs, teal AI indicators, and soft-card chat bubbles.

**Architecture:** Foundation-first: globals.css token rewrite cascades through the entire codebase via CSS variables, dramatically reducing per-component changes. Then shell (sidebar/topbar/mobile nav), then UI primitives, then page clients in priority order.

**Tech Stack:** Next.js 15 App Router, Tailwind v4 (CSS-first, `@theme` in globals.css — no tailwind.config.ts), Framer Motion, shadcn/ui primitives, TypeScript strict, pnpm only.

---

## Context for the Implementer

**This project uses Tailwind v4 CSS-first config.** All design tokens live in `app/globals.css` inside an `@theme { }` block. There is no `tailwind.config.ts`. Arbitrary Tailwind classes like `bg-[#0f1015]` are used throughout — these must be replaced with the new light equivalents.

**CSS variable pattern:** Many components use `style={{ color: "var(--color-fg-2)" }}` for text colours. These are resolved through `--color-fg-1/2/3` tokens in `@theme`. Remapping these tokens in `globals.css` changes all usages automatically.

**Test baseline:** `pnpm test` must show 42/42 passing before and after every task. `pnpm typecheck` must exit 0.

**Never touch:** `app/page.tsx`, `components/landing/`, `app/(auth)/`, `app/onboarding/`. Landing and auth have separate visual DNA.

**Dark-to-light token cheat-sheet (commit to memory):**
```
Old dark bg       → New light bg
#09090B / #0f1015 → #FAFAFA or #FFFFFF
bg-white/[0.03]   → bg-[#F4F4F5]
bg-white/[0.05]   → bg-[#F4F4F5]
bg-white/[0.06]   → bg-[#F4F4F5]
border-white/[0.04]-[0.08] → border-[#E4E4E7]
border-white/[0.12]-[0.20] → border-[#D4D4D8]
text-white        → text-[#09090B]
text-white/70     → text-[#3F3F46]
text-white/40-50  → text-[#71717A]
text-white/20-30  → text-[#A1A1AA]
shadow-[0_0_Xpx_rgba(59,130,246,...)]  → keep but reduce opacity (see task specs)
```

---

## File Map

| File | Action | Task |
|---|---|---|
| `app/globals.css` | Rewrite @theme tokens + base + .glass + .input + scrollbars | 1 |
| `components/ui/button.tsx` | Replace gradient variants with flat light variants; add `orange` CTA | 2 |
| `components/ui/badge.tsx` | Replace dark opacity classes with explicit light semantic tokens | 2 |
| `components/app/chat-bubble.tsx` | Rewrite bubble styles → soft card system | 3 |
| `components/ui/empty-state.tsx` | Remove aurora glows; clean flat icon treatment | 3 |
| `components/ui/glass.tsx` | Add `.card` / `.card-elevated` exports (keep glass as alias) | 3 |
| `components/app/app-shell.tsx` | Remove bg-aurora; fix warning banner to light red | 4 |
| `components/app/sidebar.tsx` | White bg, blue active pill, orange upgrade btn, remap tokens | 5 |
| `components/app/topbar.tsx` | White bg, light search, remove gradient avatar | 6 |
| `components/app/mobile-nav.tsx` | White bg, border-top, blue active icons, no backdrop-blur | 7 |
| `app/(app)/inbox/inbox-client.tsx` | Full token remap: lead list, chat area, soft-card bubbles, detail panel | 8 |
| `app/(app)/leads/leads-client.tsx` | Table light tokens, filter tabs, modal | 9 |
| `app/(app)/agenda/agenda-client.tsx` | Calendar light tokens, appointment cards | 10 |
| `app/(app)/reports/reports-client.tsx` + `RevenueChart.tsx` + `ProviderHealthSection.tsx` | KPI cards, chart colours, provider rows | 11 |
| `app/(app)/settings/settings-shell.tsx` | Tab nav, form cards, danger zone | 12 |

---

## Task 1: CSS Foundation — globals.css

**Files:**
- Modify: `app/globals.css`

This is the highest-leverage task. Remapping `--color-fg-1/2/3` and changing `html, body` background fixes dozens of dark remnants automatically.

- [ ] **Step 1: Verify current baseline**

```bash
pnpm typecheck && pnpm test
```
Expected: exit 0, 42/42 passing.

- [ ] **Step 2: Replace the @theme block**

Open `app/globals.css`. Replace the entire `@theme { }` block (lines 8-78) with:

```css
@theme {
  /* Brand accents */
  --color-graphite:     #0F172A;
  --color-blue-core:    #2563EB;
  --color-teal-flow:    #14B8A6;
  --color-orange-spark: #F97316;

  /* Light surface ramp */
  --color-bg-base:    #FAFAFA;
  --color-bg-surface: #FFFFFF;
  --color-bg-raised:  #F4F4F5;
  --color-bg-sunken:  #F0F0F1;

  /* Borders */
  --color-border-soft:   #E4E4E7;
  --color-border-medium: #D4D4D8;
  --color-border-strong: #A1A1AA;

  /* Text — fg-1/2/3 used via var(--color-fg-X) in existing components */
  --color-fg-1: #09090B;
  --color-fg-2: #3F3F46;
  --color-fg-3: #71717A;
  --color-fg-4: #A1A1AA;

  /* Blue ramp */
  --color-brand-blue-50:  #EFF6FF;
  --color-brand-blue-100: #DBEAFE;
  --color-brand-blue-300: #93C5FD;
  --color-brand-blue-400: #60A5FA;
  --color-brand-blue-500: #3B82F6;
  --color-brand-blue-600: #2563EB;
  --color-brand-blue-700: #1D4ED8;

  /* Teal ramp */
  --color-brand-teal-50:  #F0FDFA;
  --color-brand-teal-100: #CCFBF1;
  --color-brand-teal-300: #5EEAD4;
  --color-brand-teal-400: #2DD4BF;
  --color-brand-teal-500: #14B8A6;
  --color-brand-teal-600: #0D9488;
  --color-brand-teal-700: #0F766E;

  /* Orange ramp */
  --color-brand-orange-50:  #FFF7ED;
  --color-brand-orange-100: #FFEDD5;
  --color-brand-orange-300: #FDBA74;
  --color-brand-orange-400: #FB923C;
  --color-brand-orange-500: #F97316;
  --color-brand-orange-600: #EA580C;
  --color-brand-orange-700: #C2410C;

  /* Heat semantics */
  --color-heat-hot:  #F97316;
  --color-heat-warm: #F59E0B;
  --color-heat-cold: #3B82F6;

  /* Fonts */
  --font-sans: var(--font-inter-tight), "Inter Tight", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-italic: "Inter", var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Radii */
  --radius-2xl: 1.75rem;

  /* Shadows */
  --shadow-glow-blue:   0 0 0 1px rgba(37,99,235,0.20), 0 4px 16px rgba(37,99,235,0.18);
  --shadow-glow-teal:   0 0 0 1px rgba(20,184,166,0.20), 0 4px 16px rgba(20,184,166,0.15);
  --shadow-glow-orange: 0 0 0 1px rgba(249,115,22,0.25), 0 4px 16px rgba(249,115,22,0.20);

  /* Easings */
  --ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-soft:     cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

- [ ] **Step 3: Replace the @layer base block**

Replace the `@layer base { html, body { ... } }` section with:

```css
@layer base {
  html, body {
    background: #FAFAFA;
    color: #09090B;
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.5;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  em, i, .italic {
    font-family: var(--font-italic);
    font-style: italic;
    font-synthesis: none;
  }

  ::selection {
    background: rgba(37, 99, 235, 0.15);
    color: #09090B;
  }

  @media (max-width: 767px) {
    .mobile-scroll-area {
      padding-bottom: calc(4rem + env(safe-area-inset-bottom));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 4: Replace the @layer components block**

Replace everything inside `@layer components { }` with:

```css
@layer components {
  /* Card surfaces (replaces .glass / .glass-strong) */
  .glass,
  .card {
    position: relative;
    background: #FFFFFF;
    border: 1px solid #E4E4E7;
    border-radius: 0.75rem;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    overflow: hidden;
  }
  .glass::before,
  .glass::after { display: none; }

  .glass-strong,
  .card-elevated {
    background: #FFFFFF;
    border: 1px solid #D4D4D8;
    border-radius: 0.75rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
    overflow: hidden;
  }

  /* Page background */
  .bg-aurora,
  .bg-base {
    background: #FAFAFA;
    position: relative;
  }
  .bg-aurora::after { display: none; }

  /* Text utilities */
  .grad-text { color: #09090B; }

  .eyebrow {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #A1A1AA;
  }

  /* Input — light theme */
  .input {
    width: 100%;
    padding: 9px 12px;
    background: #FFFFFF;
    border: 1.5px solid #E4E4E7;
    border-radius: 8px;
    color: #09090B;
    font: 400 14px var(--font-sans);
    outline: none;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .input::placeholder { color: #A1A1AA; }
  .input:focus {
    border-color: #2563EB;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
  }
}
```

- [ ] **Step 5: Replace scrollbar styles**

Find the scrollbar section (after `@layer components`) and replace:

```css
/* Custom scrollbar — light theme */
* { scrollbar-width: thin; scrollbar-color: #D4D4D8 transparent; }
*::-webkit-scrollbar { width: 5px; height: 5px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: #D4D4D8; border-radius: 999px; transition: background 0.3s; }
*::-webkit-scrollbar-thumb:hover { background: #A1A1AA; }

.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #D4D4D8; }
.custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #A1A1AA; }

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm test
```
Expected: exit 0, 42/42.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat(design): replace dark token system with Steel Precision light theme foundation"
```

---

## Task 2: Button and Badge Components

**Files:**
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/badge.tsx`

- [ ] **Step 1: Rewrite button variants**

Replace the entire `VARIANT` constant and `Button` function in `components/ui/button.tsx`:

```tsx
type Variant = "primary" | "secondary" | "ghost" | "blue" | "orange";

const VARIANT: Record<Variant, string> = {
  // Orange = conversion CTA (Assinar, Upgrade, Novo lead CTA)
  orange:
    "text-white bg-[#F97316] border-transparent " +
    "hover:bg-[#EA580C] shadow-[0_2px_8px_rgba(249,115,22,0.22)] " +
    "hover:shadow-[0_4px_16px_rgba(249,115,22,0.30)]",
  // Blue = navigation action (Novo fluxo, Enviar, Aprovar)
  primary:
    "text-white bg-[#2563EB] border-transparent " +
    "hover:bg-[#1D4ED8] shadow-[0_2px_8px_rgba(37,99,235,0.22)] " +
    "hover:shadow-[0_4px_16px_rgba(37,99,235,0.28)]",
  // Secondary = subtle framed button
  secondary:
    "text-[#3F3F46] bg-white border-[#E4E4E7] " +
    "hover:bg-[#F4F4F5] hover:border-[#D4D4D8]",
  // Ghost = icon buttons, contextual actions
  ghost:
    "text-[#71717A] bg-transparent border-transparent " +
    "hover:bg-[#F4F4F5] hover:text-[#3F3F46]",
  // Blue alias kept for backward compat in inbox send button etc.
  blue:
    "text-white bg-[#2563EB] border-transparent " +
    "hover:bg-[#1D4ED8] shadow-[0_2px_8px_rgba(37,99,235,0.22)]",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  icon: "p-0 flex items-center justify-center",
};
```

Also update the `className` in the component — change `rounded-full` to `rounded-lg` and update focus ring:

```tsx
const classNames = cn(
  "inline-flex items-center gap-2 rounded-lg border font-semibold leading-none cursor-pointer select-none isolate",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  "transition-[box-shadow,background,filter,border-color] duration-150",
  "disabled:opacity-50 disabled:pointer-events-none",
  VARIANT[variant],
  SIZE[size],
  pulse && "pulse-cta",
  className,
);
```

Also update the type declaration at top of file:
```tsx
type Variant = "primary" | "secondary" | "ghost" | "blue" | "orange";
```

- [ ] **Step 2: Rewrite badge variants**

Replace the entire content of `components/ui/badge.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Heat = "hot" | "warm" | "cold" | "success" | "neutral";

const HEAT_CLS: Record<Heat, string> = {
  hot:     "text-[#C2410C] border-[#FED7AA] bg-[#FFF7ED]",
  warm:    "text-[#854D0E] border-[#FDE68A] bg-[#FEFCE8]",
  cold:    "text-[#1D4ED8] border-[#BFDBFE] bg-[#EFF6FF]",
  success: "text-[#166534] border-[#BBF7D0] bg-[#F0FDF4]",
  neutral: "text-[#71717A] border-[#E4E4E7] bg-[#F4F4F5]",
};

interface BadgeProps {
  variant?: Heat;
  children?: ReactNode;
  className?: string;
  withDot?: boolean;
}

export function Badge({
  variant = "neutral",
  children,
  className,
  withDot = true,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        HEAT_CLS[variant],
        className,
      )}
    >
      {withDot && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      )}
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm test
```
Expected: exit 0, 42/42.

- [ ] **Step 4: Commit**

```bash
git add components/ui/button.tsx components/ui/badge.tsx
git commit -m "feat(design): rewrite button/badge variants for light theme — flat colours, semantic tokens"
```

---

## Task 3: UI Primitives — ChatBubble, EmptyState, Glass

**Files:**
- Modify: `components/app/chat-bubble.tsx`
- Modify: `components/ui/empty-state.tsx`
- Modify: `components/ui/glass.tsx` (if exists, otherwise skip)

- [ ] **Step 1: Rewrite chat-bubble.tsx**

Replace entire file content:

```tsx
"use client";

import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "lead" | "ai" | "agent" | "note";

interface ChatBubbleProps {
  variant: Variant;
  children: ReactNode;
  timestamp?: string;
  className?: string;
  isFirst?: boolean;
  isLast?: boolean;
  hideLabel?: boolean;
  hideTime?: boolean;
}

const ANIM_X: Record<Variant, number> = {
  lead: -10, ai: 10, agent: 10, note: 0,
};

const META: Record<Variant, { label: string; align: "start" | "end" | "center" }> = {
  lead:  { label: "Lead",       align: "start"  },
  ai:    { label: "Agendra IA", align: "end"    },
  agent: { label: "Você",       align: "end"    },
  note:  { label: "",           align: "center" },
};

function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatBubble({
  variant,
  children,
  timestamp,
  className,
  isFirst = true,
  isLast = true,
  hideLabel = false,
  hideTime = false,
}: ChatBubbleProps) {
  const x = ANIM_X[variant];
  const { label, align } = META[variant];

  // System note — centered pill
  if (variant === "note") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 py-3 px-4"
      >
        <div className="h-px flex-1 bg-[#E4E4E7]" />
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[#71717A] bg-[#FEFCE8] px-3 py-1 rounded-full border border-[#FDE68A]">
          {children}
        </span>
        <div className="h-px flex-1 bg-[#E4E4E7]" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex max-w-[85%] sm:max-w-[72%] flex-col gap-1",
        align === "end" ? "self-end items-end" : "self-start items-start",
        !isFirst && "-mt-2"
      )}
    >
      {/* Sender label */}
      {!hideLabel && (
        <div className="flex items-center gap-1.5 px-1.5 mb-0.5">
          {variant === "ai" && <Bot size={10} className="text-[#2563EB]" />}
          {variant === "agent" && <User size={10} className="text-[#71717A]" />}
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#A1A1AA]">
            {label}
          </span>
        </div>
      )}

      {/* Bubble — soft card */}
      <div
        className={cn(
          "relative px-4 py-2.5 text-[13px] leading-relaxed transition-all duration-150",
          // Lead: white card, gray border, shadow
          variant === "lead" && [
            "bg-white text-[#09090B]",
            "border border-[#E4E4E7]",
            "shadow-[0_1px_4px_rgba(0,0,0,0.06)]",
            "rounded-[14px] rounded-tl-[3px]",
            !isLast && "rounded-bl-[3px]",
          ],
          // Agent (human): blue card
          variant === "agent" && [
            "bg-[#2563EB] text-white",
            "shadow-[0_2px_8px_rgba(37,99,235,0.22)]",
            "rounded-[14px] rounded-tr-[3px]",
            !isLast && "rounded-br-[3px]",
          ],
          // AI auto-sent: slightly lighter blue
          variant === "ai" && [
            "bg-[#3B82F6] text-white",
            "shadow-[0_2px_8px_rgba(59,130,246,0.20)]",
            "rounded-[14px] rounded-tr-[3px]",
            !isLast && "rounded-br-[3px]",
          ],
          className,
        )}
      >
        <div className="flex flex-col gap-1">
          <div>{children}</div>
          {timestamp && !hideTime && (
            <div className={cn(
              "self-end text-[9px] font-medium mt-1",
              variant === "lead" ? "text-[#A1A1AA]" : "text-white/60"
            )}>
              {formatTime(timestamp)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Rewrite empty-state.tsx**

Replace entire file content:

```tsx
"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto my-6",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] text-[#A1A1AA]">
        <Icon size={22} />
      </div>
      <h3 className="text-[15px] font-700 tracking-tight text-[#09090B] mb-2">
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed text-[#71717A] mb-5 max-w-xs">
        {description}
      </p>
      {action && <div>{action}</div>}
    </motion.div>
  );
}
```

- [ ] **Step 3: Check if glass.tsx exists and update**

```bash
cat "components/ui/glass.tsx"
```

If the file exports a `Glass` component using `className="glass"`, update it to also accept `"card"` as a valid className:

```tsx
// If glass.tsx exports a wrapper — update the className
className={cn("card", className)}
```

If the file doesn't exist, skip this step.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm test
```
Expected: exit 0, 42/42.

- [ ] **Step 5: Commit**

```bash
git add components/app/chat-bubble.tsx components/ui/empty-state.tsx components/ui/glass.tsx
git commit -m "feat(design): rewrite chat bubbles (soft cards), empty state, glass primitives for light theme"
```

---

## Task 4: App Shell

**Files:**
- Modify: `components/app/app-shell.tsx`

- [ ] **Step 1: Update app-shell**

In `components/app/app-shell.tsx`, apply these changes:

**Change 1** — main grid background (line ~41):
```tsx
// Before:
className="bg-aurora grid overflow-hidden md:grid-cols-[240px_1fr] h-[calc(100dvh-3.5rem)] md:h-screen"

// After:
className="bg-[#FAFAFA] grid overflow-hidden md:grid-cols-[240px_1fr] h-[calc(100dvh-3.5rem)] md:h-screen"
```

**Change 2** — SidebarFallback skeleton (lines ~17-32):
```tsx
function SidebarFallback() {
  return (
    <aside
      key="sidebar-fallback"
      className="hidden h-screen flex-col gap-4 border-r border-[#E4E4E7] bg-white p-4 md:flex z-20"
    >
      <div className="h-7 w-28 animate-pulse rounded-lg bg-[#F4F4F5]" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-[#F4F4F5]" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="mt-auto h-16 w-full animate-pulse rounded-xl bg-[#F4F4F5]" />
    </aside>
  );
}
```

**Change 3** — warning banner (lines ~58-77):
```tsx
<Link
  href="/settings?tab=channels"
  className="flex items-center gap-3 bg-[#FFF1F2] border-b border-[#FECACA] px-6 py-2.5 hover:bg-[#FFE4E6] transition-colors group"
>
  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626] ring-1 ring-[#FECACA]">
    <AlertTriangle size={12} />
  </div>
  <div className="flex flex-1 flex-col min-w-0">
    <span className="text-[12px] font-bold text-[#991B1B]">Atenção Necessária</span>
    <span className="text-[11px] text-[#B91C1C]/70 truncate">
      {unhealthyChannelsCount === 1
        ? "Um canal de WhatsApp está desconectado ou com erro de conexão."
        : `${unhealthyChannelsCount} canais de WhatsApp estão com problemas de conexão.`}
    </span>
  </div>
  <div className="flex items-center gap-1 text-[11px] font-bold text-[#DC2626] group-hover:text-[#991B1B] transition-colors shrink-0">
    Resolver Agora
    <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
  </div>
</Link>
```

Also remove the `{/* Glowing highlight strip */}` div inside the link (that entire `<div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r ...">` block).

- [ ] **Step 2: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add components/app/app-shell.tsx
git commit -m "feat(design): update app shell — light bg, clean warning banner"
```

---

## Task 5: Sidebar

**Files:**
- Modify: `components/app/sidebar.tsx`

- [ ] **Step 1: Update aside container**

Line ~55 — the `<aside>` element:
```tsx
// Before:
className="hidden h-screen flex-col gap-4 border-r border-white/[0.06] bg-[#0f1015] p-4 md:flex z-20"

// After:
className="hidden h-screen flex-col gap-4 border-r border-[#E4E4E7] bg-white p-4 md:flex z-20"
```

- [ ] **Step 2: Update logo area**

The logo link (line ~59) — remove the teal dot span (or update it):
```tsx
<Link href="/inbox" className="flex items-center gap-2 px-2 py-1.5 shrink-0 select-none">
  <Image src="/assets/agendra-logo.svg" alt="Agendra" width={96} height={24} priority />
  <span className="relative flex h-1.5 w-1.5" title="AI ACTIVE">
    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#14B8A6] animate-pulse" />
  </span>
</Link>
```

Note: Check if the SVG logo is dark-on-transparent (works on white) or light (needs invert). If it's white text on transparent, add `className="dark:invert"` or replace with a dark version. For now, keep as-is — verify visually.

- [ ] **Step 3: Update section dividers**

The `.eyebrow` class is already remapped in Task 1 (now `color: #A1A1AA`), so the section labels will update automatically. No change needed here.

- [ ] **Step 4: Update nav item active state**

Replace the nav item render (lines ~76-109). The key section is the `active` conditional:

```tsx
<Link
  key={n.id}
  href={n.href}
  onClick={() => trackEvent("nav_click", { target: n.id })}
  className={cn(
    "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-colors duration-150",
    active
      ? "text-[#1D4ED8] font-semibold"
      : "text-[#71717A] border border-transparent hover:bg-[#F4F4F5] hover:text-[#3F3F46]",
  )}
>
  {active && (
    <motion.span
      layoutId="nav-pill"
      className="absolute inset-0 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]"
      transition={{ type: "spring", stiffness: 400, damping: 36 }}
    />
  )}
  <n.icon size={16} className="relative z-10" />
  <span className="relative z-10">{n.label}</span>
  {n.badge && (
    <Badge variant={n.badge.type} className="relative z-10 ml-auto">
      {n.id === "inbox" ? hotCount : n.badge.count}
    </Badge>
  )}
</Link>
```

- [ ] **Step 5: Update user card**

Replace the user card container div (line ~112):
```tsx
<div className="mt-auto rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3 transition-all duration-200 hover:bg-[#F4F4F5] relative overflow-hidden group/user z-10 shrink-0">
```

Update the avatar (line ~118):
```tsx
<div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-bold text-[#2563EB]">
  {initials}
</div>
```

Update the company/plan text (line ~124):
```tsx
<div className="min-w-0">
  <div className="truncate text-xs font-semibold text-[#09090B]">{displayName}</div>
  <div className="truncate font-mono text-[10px] text-[#71717A]">
    {companyName} · {displayPlan}
  </div>
</div>
```

Update trial bar text colors:
```tsx
<div className="flex items-center justify-between text-[9px] font-medium">
  <span className="text-[#A1A1AA]">Trial ativo</span>
  <span className="font-mono text-[9px] text-[#71717A]">
    {remaining}d restantes
  </span>
</div>
<div className="h-[2px] w-full overflow-hidden rounded-full bg-[#E4E4E7]">
  <motion.div
    initial={{ width: 0 }}
    animate={{ width: `${calculateTrialProgress(elapsed)}%` }}
    transition={{ duration: 1 }}
    className="h-full bg-[#2563EB]"
  />
</div>
```

Update upgrade button — use orange:
```tsx
<Link href="/planos" className="flex-1">
  <Button
    variant="orange"
    size="sm"
    className="w-full justify-center text-[10px] h-7 rounded-lg"
  >
    <IconZap size={10} />
    {planType === "trial" ? "Assinar" : "Upgrade"}
  </Button>
</Link>
```

Update logout button:
```tsx
<Button
  variant="ghost"
  size="sm"
  className="px-2 h-7 rounded-lg hover:bg-[#F4F4F5]"
  aria-label="Sair"
  onClick={signOut}
  title="Sair"
>
  <IconLogout size={12} className="text-[#A1A1AA]" />
</Button>
```

- [ ] **Step 6: Update skeleton loading state**

```tsx
{!mounted || loading ? (
  <div className="h-16 animate-pulse rounded-lg bg-[#F4F4F5]" />
) : (
```

- [ ] **Step 7: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add components/app/sidebar.tsx
git commit -m "feat(design): sidebar — white bg, blue active pill, orange upgrade CTA, light tokens"
```

---

## Task 6: Topbar

**Files:**
- Modify: `components/app/topbar.tsx`

- [ ] **Step 1: Update topbar container** (line ~83):

```tsx
className="flex items-center gap-3 border-b border-[#E4E4E7] bg-white px-4 py-2.5 md:gap-4 md:px-6 md:py-3"
```

- [ ] **Step 2: Update search input** (line ~97):

```tsx
<input
  placeholder="Buscar leads, conversas, agendamentos…"
  className="w-full h-[30px] bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg pl-9 pr-8 text-[13px] text-[#09090B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  onKeyDown={handleSearchKeyDown}
/>
```

Also update the search icon:
```tsx
<Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
```

And the clear button:
```tsx
<button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#71717A]" aria-label="Limpar busca">
  <X size={14} />
</button>
```

- [ ] **Step 3: Update loading skeleton**

```tsx
{loading ? (
  <div className="h-9 w-9 animate-pulse rounded-full bg-[#F4F4F5]" />
) : ...}
```

- [ ] **Step 4: Update mobile avatar** — remove gradient:

```tsx
<button
  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-bold text-[#2563EB] md:hidden"
  onClick={() => setShowProfile(true)}
  aria-label="Abrir perfil"
>
  {loading ? "…" : initials}
</button>
```

- [ ] **Step 5: Update mobile profile bottom sheet**

The sheet container:
```tsx
className="fixed bottom-0 left-0 right-0 z-[61] md:hidden rounded-t-3xl border-t border-[#E4E4E7] bg-white p-6 shadow-[0_-8px_32px_rgba(0,0,0,0.10)]"
```

Handle:
```tsx
<div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#E4E4E7]" />
```

Backdrop:
```tsx
className="fixed inset-0 z-[60] bg-black/30 md:hidden"
```

Avatar in sheet:
```tsx
<div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-sm font-bold text-[#2563EB]">
  {initials}
</div>
```

Name/company in sheet:
```tsx
<div className="truncate text-sm font-semibold text-[#09090B]">{displayName}</div>
<div className="truncate text-[12px] text-[#71717A]">{companyName}</div>
<div className="font-mono text-[11px] text-[#A1A1AA]">{displayPlan}</div>
```

Trial bar in sheet:
```tsx
<span className="text-[#A1A1AA]">Trial em progresso</span>
<span className="text-[#2563EB]">{remaining} dias restantes</span>
// bar track:
className="h-[2px] w-full overflow-hidden rounded-full bg-[#E4E4E7]"
// bar fill:
className="h-full bg-[#2563EB]"
```

Sheet buttons:
```tsx
// Upgrade:
<Button variant="orange" size="sm" className="w-full justify-center text-[11px] h-9 rounded-xl">
  <Zap size={13} /> Upgrade
</Button>
// Logout:
<Button variant="secondary" size="sm" className="flex-1 text-[11px] h-9 rounded-xl" onClick={...}>
  <LogOut size={13} /> Sair
</Button>
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add components/app/topbar.tsx
git commit -m "feat(design): topbar — white bg, light search, clean mobile profile sheet"
```

---

## Task 7: Mobile Nav

**Files:**
- Modify: `components/app/mobile-nav.tsx`

- [ ] **Step 1: Replace nav styles**

Replace the `style` prop on the `<nav>` element:

```tsx
<nav
  className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-[#E4E4E7]"
  style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
>
```

- [ ] **Step 2: Update link active/inactive colors**

```tsx
className={cn(
  "flex flex-1 flex-col items-center gap-1 px-2 py-3 text-[10px] font-medium transition-colors",
  active ? "text-[#2563EB]" : "text-[#A1A1AA]",
)}
```

```tsx
<item.icon
  size={20}
  className={cn(
    "transition-colors duration-150",
    active ? "text-[#2563EB]" : "text-[#A1A1AA]",
  )}
/>
```

Active dot — update color:
```tsx
<motion.span
  layoutId="mobile-nav-dot"
  className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[#2563EB]"
  transition={{ type: "spring", stiffness: 400, damping: 34 }}
/>
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add components/app/mobile-nav.tsx
git commit -m "feat(design): mobile nav — white bg, border-top, blue active state, no blur"
```

---

## Task 8: Inbox Client

**Files:**
- Modify: `app/(app)/inbox/inbox-client.tsx`

This is the largest component (~1460 lines). Focus on systematic token replacement section by section.

- [ ] **Step 1: Lead list header**

Find the "COL 1 — list" section header block (around line 793). Update:

```tsx
<section className={cn(
  "flex flex-col border-r border-[#E4E4E7] bg-white transition-all duration-300 lg:w-[320px] lg:flex-shrink-0",
  showChatOnMobile ? "hidden lg:flex" : "flex w-full"
)}>
  <div className="px-5 pb-3 pt-5 shrink-0">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-black tracking-tight text-[#09090B]">Inbox</h2>
      <div className="flex items-center gap-2">
        <div className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all duration-500",
          isConnected
            ? "bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1]"
            : "bg-[#F4F4F5] text-[#A1A1AA] border border-[#E4E4E7]"
        )}>
          <span className={cn(
            "h-1.5 w-1.5 rounded-full transition-all duration-500",
            isConnected ? "bg-[#14B8A6] animate-pulse" : "bg-[#D4D4D8]"
          )} />
          {isConnected ? "LIVE" : "OFFLINE"}
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Lead list search + filters**

```tsx
// Search input inside list:
<input
  type="text"
  placeholder="Buscar por nome ou telefone..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="w-full rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] pl-9 pr-3 py-2 text-[13px] text-[#09090B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
/>
```

Status filter tabs — update colors:
```tsx
className={cn(
  "relative pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 whitespace-nowrap cursor-pointer",
  statusFilter === status ? "text-[#2563EB]" : "text-[#A1A1AA] hover:text-[#71717A]"
)}
// Active indicator:
className="absolute bottom-0 inset-x-0 h-[1.5px] bg-[#2563EB]"
```

Channel filter:
```tsx
className={cn(
  "relative pb-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 whitespace-nowrap flex items-center gap-1 cursor-pointer",
  channelFilter === chan ? "text-[#09090B]" : "text-[#A1A1AA] hover:text-[#71717A]"
)}
// Active indicator:
className="absolute bottom-0 inset-x-0 h-[1px] bg-[#D4D4D8]"
// Filter border separator:
className="flex gap-3 overflow-x-auto no-scrollbar pb-1 border-b border-[#E4E4E7] scrollbar-none select-none"
```

- [ ] **Step 3: Lead list items (LeadListItem component)**

Update the `LeadListItem` component:

```tsx
const LeadListItem = memo(function LeadListItem({ lead: l, isActive, isUnread, onSelect }: LeadListItemProps) {
  const last = lastMsg(l);
  return (
    <motion.div
      variants={LEAD_ITEM_VARIANTS}
      whileHover={{ backgroundColor: "#F4F4F5" }}
      onClick={() => onSelect(l.id)}
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 border-b border-[#F4F4F5] px-5 py-3.5 transition-all duration-150 select-none",
        isActive && "bg-[#EFF6FF] border-b-[#DBEAFE]"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-lead"
          className="absolute inset-y-2 left-0 w-[2px] rounded-r-full bg-[#2563EB]"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      {/* Avatar */}
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F4F4F5] border border-[#E4E4E7] text-[10px] font-bold text-[#3F3F46]">
        {initials(l.name)}
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white transition-all",
          l.status === "hot" ? "bg-[#F97316]" :
          l.status === "warm" ? "bg-[#F59E0B]" :
          l.status === "success" ? "bg-[#22C55E]" : "bg-[#3B82F6]"
        )} />
        {isUnread && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#2563EB] border-2 border-white"
          />
        )}
      </div>
      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[13px] font-semibold text-[#09090B]">{l.name}</span>
            {l.channel === "whatsapp" && <MessageCircle size={11} className="text-[#14B8A6] shrink-0" />}
            {l.channel === "instagram" && <Instagram size={11} className="text-pink-400 shrink-0" />}
          </div>
          <span className="font-mono text-[9px] font-medium text-[#A1A1AA] whitespace-nowrap">
            {last ? relativeTime(last.created_at) : "—"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
          {last && (last.metadata as any)?.is_draft && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded px-1 py-0.5">
              Rascunho
            </span>
          )}
          <span className={cn(
            "truncate text-[11px] transition-colors",
            isActive ? "text-[#71717A]" : "text-[#A1A1AA]"
          )}>
            {last?.content ?? "Nenhuma mensagem"}
          </span>
        </div>
      </div>
    </motion.div>
  );
});
```

- [ ] **Step 4: Empty state in list**

```tsx
<div className="flex flex-col items-center justify-center h-40 px-5 text-center gap-2">
  <div className="h-12 w-12 rounded-full bg-[#F4F4F5] flex items-center justify-center">
    <Zap size={20} className="text-[#D4D4D8]" />
  </div>
  <p className="text-xs font-medium text-[#A1A1AA]">Nenhum lead encontrado.</p>
</div>
```

- [ ] **Step 5: Chat header (COL 2)**

```tsx
<div className="flex items-center justify-between border-b border-[#E4E4E7] bg-white px-4 py-3 sm:px-6 z-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
```

Avatar in chat header — use HEAT_GRADIENT if it's still color strings, otherwise assign by status. Update the outer container:
```tsx
// avatar div:
className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black text-white"
// (keep style={{ background: HEAT_GRADIENT[selected.status] }} — the gradient values are semantic, keep them)
```

Name and status text:
```tsx
<div className="truncate text-sm font-bold text-[#09090B]">{selected.name}</div>
<div className="flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
  <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
  Ativo agora · {selected.channel}
</div>
```

- [ ] **Step 6: Messages area**

```tsx
// Chat section container:
className={cn(
  "flex flex-col transition-all duration-300",
  !showChatOnMobile ? "hidden lg:flex lg:flex-1" : "flex w-full lg:flex-1"
)}

// Messages area bg:
<div className="flex-1 overflow-y-auto custom-scrollbar">
  <motion.div
    key={selected.id}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
    className="flex flex-col gap-3 p-4 sm:p-6 bg-[#F8F8F8] min-h-full"
  >
```

Conversation-start divider:
```tsx
<div className="my-12 text-center flex flex-col items-center gap-2">
  <div className="h-1 w-8 bg-[#E4E4E7] rounded-full" />
  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA]">Início da conversa</span>
</div>
```

- [ ] **Step 7: AI Draft card in messages**

```tsx
<motion.div
  key={msg.id}
  initial={{ opacity: 0, y: 8, scale: 0.97 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  className="flex flex-col items-end gap-2 self-end max-w-[85%]"
>
  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#14B8A6]">
    <Sparkles size={10} />
    Rascunho da IA · Aguardando aprovação
  </div>
  <div className="relative rounded-[14px] rounded-br-[3px] border-[1.5px] border-[#CCFBF1] bg-[#F0FDFA] px-4 py-3 text-[13px] leading-relaxed text-[#166534]">
    {msg.content}
  </div>
  {/* Actions */}
  {editingDraftId === msg.id ? (
    <div className="flex flex-col gap-2 w-full">
      <textarea
        autoFocus
        value={editDraftText}
        onChange={(e) => setEditDraftText(e.target.value)}
        rows={3}
        className="w-full rounded-xl border-[1.5px] border-[#E4E4E7] bg-white px-3 py-2 text-[13px] text-[#09090B] outline-none resize-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
      />
      <div className="flex items-center gap-2 justify-end">
        <button onClick={() => setEditingDraftId(null)} className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all">
          Cancelar
        </button>
        <button onClick={() => handleEditAndSendDraft(msg.id, editDraftText)} disabled={draftPending || !editDraftText.trim()} className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] transition-all disabled:opacity-50">
          <Send size={10} />
          Enviar Editado
        </button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button onClick={() => handleDeleteDraft(msg.id)} disabled={draftPending} className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50">
        <Trash size={10} /> Descartar
      </button>
      <button onClick={() => { setEditingDraftId(msg.id); setEditDraftText(msg.content); }} disabled={draftPending} className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50">
        ✏️ Editar
      </button>
      <button onClick={() => handleApproveDraft(msg.id)} disabled={draftPending} className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] transition-all shadow-[0_2px_8px_rgba(37,99,235,0.22)] disabled:opacity-50">
        <Check size={10} /> ✓ Aprovar e Enviar
      </button>
    </div>
  )}
</motion.div>
```

- [ ] **Step 8: Typing indicator**

```tsx
<div className="flex items-center gap-2 rounded-[14px] rounded-bl-[3px] border border-[#E4E4E7] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
```

Dots: `className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]"`

- [ ] **Step 9: Input area**

```tsx
<div className="relative bg-white border-t border-[#E4E4E7] p-3 sm:p-4 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:pb-[env(safe-area-inset-bottom,16px)]">
```

Input container:
```tsx
<div className="flex-1 relative flex flex-col gap-0 bg-[#F4F4F5] border border-[#E4E4E7] rounded-2xl px-3 py-1.5 transition-all focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]">
```

Textarea:
```tsx
className="flex-1 bg-transparent py-2.5 text-[14px] text-[#09090B] outline-none placeholder:text-[#A1A1AA] disabled:cursor-not-allowed resize-none max-h-32 custom-scrollbar"
```

Blocker overlay:
```tsx
className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl"
// Assume control button:
<Button variant="orange" size="sm" className="gap-2 px-6 h-10 rounded-full font-black uppercase tracking-wider" onClick={handleTakeOver} disabled={takePending}>
  {takePending ? <Zap size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
  Assumir Atendimento
</Button>
```

Send button area — remove glow div, keep button:
```tsx
<Button
  variant="primary"
  size="sm"
  className="h-11 w-11 rounded-full shrink-0 transition-all duration-200 overflow-hidden z-10"
  disabled={inputBlocked || (!noteText.trim() && !attachedFile)}
  onClick={handleSend}
>
  ...
</Button>
```

Bottom status text:
```tsx
// Autonomous mode text:
<p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[#14B8A6]">
  Modo Automático Ativo · Agendra IA está no controle
</p>
// Shadow mode text:
<p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[#2563EB]">
  <Sparkles className="inline mr-1" size={9} />
  Modo Copiloto · Aprove rascunhos acima ou escreva diretamente
</p>
```

Error text:
```tsx
<p className="mt-2 text-center text-[11px] font-bold text-[#DC2626]">Erro: {inboxError}</p>
```

- [ ] **Step 10: COL 3 — Lead detail panel**

```tsx
<aside className="hidden flex-col gap-5 overflow-y-auto border-l border-[#E4E4E7] bg-white p-5 w-[280px] shrink-0 custom-scrollbar xl:flex z-10 select-none">
```

Profile card:
```tsx
<div className="flex flex-col items-center text-center gap-3.5 pb-4 border-b border-[#F4F4F5]">
  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#F4F4F5] border border-[#E4E4E7] text-base font-bold text-[#3F3F46]">
    {initials(selected.name)}
  </div>
  <div>
    <h2 className="text-base font-bold text-[#09090B] leading-tight">{selected.name}</h2>
    <p className="text-[11px] font-medium text-[#A1A1AA] mt-0.5">{selected.phone}</p>
  </div>
</div>
```

Section headers:
```tsx
<h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1A1AA] mb-3">...</h4>
```

AI summary card:
```tsx
<div className="rounded-xl bg-[#F0FDFA] border border-[#CCFBF1] p-3">
  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#14B8A6] block mb-1.5">✦ Resumo IA</span>
  <p className="text-[12px] leading-relaxed text-[#166534] italic">"{selected.summary}"</p>
</div>
```

KV component:
```tsx
function KV({ k, v, color = "text-[#3F3F46]" }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="font-bold text-[#A1A1AA] uppercase tracking-widest text-[10px]">{k}</span>
      <span className={cn("font-semibold truncate max-w-[140px]", color)}>{v}</span>
    </div>
  );
}
```

BookingStatusCard:
```tsx
// Container:
<div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4">
// Icon circle:
<div className="h-7 w-7 rounded-lg bg-[#F0FDFA] flex items-center justify-center text-[#14B8A6]">
// Title text:
<div className="text-[11px] font-bold text-[#71717A]">Agendamento Confirmado</div>
<div className="text-[12px] font-semibold text-[#09090B] mt-0.5">{next.title}</div>
<div className="text-[10px] text-[#A1A1AA] mt-0.5 capitalize">{formatted}</div>
```

Error banner in list:
```tsx
<div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl border border-[#FECACA] bg-[#FFF1F2] px-3 py-2">
  <p className="text-[12px] font-medium text-[#DC2626] leading-tight">{inboxError}</p>
  <button onClick={() => router.refresh()} className="shrink-0 text-[11px] font-black uppercase tracking-wider text-[#DC2626] hover:text-[#991B1B] transition-colors">
    Tentar novamente
  </button>
</div>
```

- [ ] **Step 11: ToneDropdown and ControlModeDropdown**

Both dropdowns: update container and items to light tokens:

```tsx
// Trigger button (both dropdowns):
className={cn(
  "flex items-center justify-between gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-150 hover:bg-[#F4F4F5] disabled:opacity-50 cursor-pointer",
  (toneOpen || controlOpen) && "bg-[#F4F4F5]",
  compact ? "h-7 px-2" : "w-full"
)}

// Dropdown menu:
className={cn(
  "absolute z-[101] overflow-hidden rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.10)]",
  compact ? "right-0 top-full mt-1 w-36" : "left-0 top-full w-full"
)}

// Item:
className={cn(
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
  selected.conversation_tone === t ? "bg-[#EFF6FF] text-[#1D4ED8]" : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
)}
```

Status dot colours remain semantic (orange for hot, yellow for warm, blue for cold/copilot, emerald for autonomous).

- [ ] **Step 12: Verify**

```bash
pnpm typecheck && pnpm test
```
Expected: exit 0, 42/42.

- [ ] **Step 13: Commit**

```bash
git add app/(app)/inbox/inbox-client.tsx
git commit -m "feat(design): inbox — light surfaces, soft-card bubbles, teal LIVE badge, clean panels"
```

---

## Task 9: Leads Client

**Files:**
- Modify: `app/(app)/leads/leads-client.tsx`

- [ ] **Step 1: Page header**

```tsx
<header className="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#09090B]">Leads</h1>
    <p className="mt-1 text-sm text-[#71717A]">
      {visible.length} leads {filter === "all" ? "no total" : `· filtro: ${HEAT_LABEL[filter] || filter}`}
    </p>
  </div>
  <div className="flex gap-2">
    <Button variant="secondary" size="sm" disabled={exportPending} onClick={handleExport}>
      <Download size={14} /> {exportPending ? "…" : "Exportar"}
    </Button>
    <Button variant="orange" size="sm" onClick={() => setShowNewModal(true)}>
      <UserPlus size={14} /> Novo lead
    </Button>
  </div>
</header>
```

Remove `ShinyButton` import and usage for the "Novo lead" button — replaced with `Button variant="orange"`.

- [ ] **Step 2: Filter tabs**

```tsx
<div className="mb-6 flex gap-4 border-b border-[#E4E4E7] pb-1 select-none">
  {FILTERS.map((f) => {
    const count = f.id === "all" ? leads.length : (statusCounts[f.id] ?? 0);
    const active = f.id === filter;
    return (
      <button
        key={f.id}
        onClick={() => setFilter(f.id)}
        className={cn(
          "relative pb-2 text-[11px] font-bold uppercase tracking-wider transition-colors duration-150 flex items-center gap-1.5 cursor-pointer",
          active ? "text-[#09090B]" : "text-[#A1A1AA] hover:text-[#71717A]"
        )}
      >
        <span>{f.label}</span>
        <span className={cn(
          "font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#F4F4F5] text-[#A1A1AA]",
          active && "text-[#09090B] bg-[#E4E4E7]"
        )}>{count}</span>
        {active && (
          <motion.div
            layoutId="active-leads-filter"
            className="absolute bottom-0 inset-x-0 h-[1.5px] bg-[#2563EB]"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
      </button>
    );
  })}
</div>
```

- [ ] **Step 3: Table**

```tsx
<div className="overflow-x-auto rounded-xl border border-[#E4E4E7] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] relative">
  <table className="w-full border-collapse">
    <thead>
      <tr className="bg-[#FAFAFA]">
        {["Lead", "Heat · Score", "Canal", "Origem", "Status", "Última msg"].map((h) => (
          <th key={h} className="border-b border-[#E4E4E7] px-4 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A1A1AA]">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {visible.map((l, idx) => (
        <tr key={l.id} className="border-b border-[#F4F4F5] hover:bg-[#FAFAFA] transition-colors cursor-pointer">
          <td className="px-4 py-3.5 text-[13px]">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F4F4F5] border border-[#E4E4E7] text-[10px] font-bold text-[#3F3F46]">
                {initials(l.name)}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#09090B]">{l.name}</div>
                {l.city && <div className="text-[11px] text-[#A1A1AA]">{l.city}</div>}
              </div>
            </div>
          </td>
          {/* ...remaining cells use Badge component with semantic variants — already updated in Task 2 */}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

- [ ] **Step 4: New lead modal**

Find the modal overlay and content. Update:

```tsx
// Overlay backdrop:
className="fixed inset-0 z-[60] bg-black/30"

// Modal container:
className="bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.14)] p-6 w-full max-w-md"

// Modal title:
className="text-[18px] font-bold text-[#09090B] mb-5"

// Labels:
className="block text-[12px] font-semibold text-[#3F3F46] mb-1.5"

// Inputs: use .input class (already updated in globals.css Task 1)

// Error text:
className="text-[12px] text-[#DC2626]"

// Submit button: variant="orange"
// Cancel button: variant="secondary"
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add app/(app)/leads/leads-client.tsx
git commit -m "feat(design): leads — light table, semantic filter tabs, orange CTA, clean modal"
```

---

## Task 10: Agenda Client

**Files:**
- Modify: `app/(app)/agenda/agenda-client.tsx`

- [ ] **Step 1: Read agenda-client**

```bash
head -100 "app/(app)/agenda/agenda-client.tsx"
```

Note the component structure, then apply these rules throughout:

**Systematic replacements for agenda-client:**

| Dark pattern | Light replacement |
|---|---|
| `bg-[#09090B]`, `bg-[#0f1015]` | `bg-white` or `bg-[#FAFAFA]` |
| `border-white/[0.X]` | `border-[#E4E4E7]` |
| `text-white` (primary) | `text-[#09090B]` |
| `text-white/60` | `text-[#3F3F46]` |
| `text-white/40` | `text-[#71717A]` |
| `text-white/20` | `text-[#A1A1AA]` |
| `bg-white/[0.03]` | `bg-[#F4F4F5]` |

**Appointment card structure** — replace gradient bg with semantic flat card:
```tsx
// Hot appointment:
className="border border-[#FED7AA] bg-[#FFF7ED] border-l-4 border-l-[#F97316] rounded-lg p-2 text-[#09090B]"
// Warm:
className="border border-[#FDE68A] bg-[#FEFCE8] border-l-4 border-l-[#F59E0B] rounded-lg p-2 text-[#09090B]"
// Success/confirmed:
className="border border-[#BBF7D0] bg-[#F0FDF4] border-l-4 border-l-[#22C55E] rounded-lg p-2 text-[#09090B]"
// Cold/default:
className="border border-[#BFDBFE] bg-[#EFF6FF] border-l-4 border-l-[#3B82F6] rounded-lg p-2 text-[#09090B]"
```

**Today highlight in calendar:**
```tsx
// Today's date cell:
className="bg-[#EFF6FF] text-[#2563EB] font-bold rounded-lg"
```

**Calendar grid lines:**
```tsx
className="border border-[#E4E4E7]"
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/agenda/agenda-client.tsx
git commit -m "feat(design): agenda — light calendar grid, semantic appointment cards"
```

---

## Task 11: Reports Client

**Files:**
- Modify: `app/(app)/reports/reports-client.tsx`
- Modify: `app/(app)/reports/components/RevenueChart.tsx`
- Modify: `app/(app)/reports/components/ProviderHealthSection.tsx`

- [ ] **Step 1: Read each file**

```bash
head -80 "app/(app)/reports/reports-client.tsx"
head -60 "app/(app)/reports/components/RevenueChart.tsx"
head -60 "app/(app)/reports/components/ProviderHealthSection.tsx"
```

- [ ] **Step 2: Apply systematic replacements to reports-client.tsx**

Same token replacement table as Task 10. Additionally:

**KPI cards:**
```tsx
<div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#A1A1AA] mb-2">{label}</div>
  <div className="text-[28px] font-black tracking-tight text-[#09090B]">{value}</div>
  {/* trend: */}
  <div className={cn("text-[11px] font-semibold mt-1", positive ? "text-[#166534]" : "text-[#DC2626]")}>
    {trend}
  </div>
</div>
```

**Section headers:**
```tsx
<h2 className="text-[16px] font-bold text-[#09090B] mb-4">...</h2>
```

- [ ] **Step 3: Update RevenueChart.tsx**

Replace dark chart colours:
```tsx
// Chart container bg:
style={{ background: '#FFFFFF' }}
// Grid lines (recharts GridProps):
stroke="#F4F4F5"
// Axis text:
fill="#A1A1AA"
// Line colours (keep brand palette, reduce to 3):
// Primary line: #2563EB
// Secondary line: #14B8A6
// Tertiary line: #F97316
// Area fill: use 8% opacity version of line colour
// Tooltip:
contentStyle={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
labelStyle={{ color: '#09090B', fontWeight: 600 }}
```

- [ ] **Step 4: Update ProviderHealthSection.tsx**

```tsx
// Container card:
className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"

// Provider row:
className="flex items-center justify-between py-3 border-b border-[#F4F4F5] last:border-0"

// Provider name:
className="text-[13px] font-semibold text-[#09090B]"

// Status dot — replace glow-on-dark with flat semantic dots:
// healthy:  bg-[#22C55E]
// degraded: bg-[#F59E0B]
// down:     bg-[#EF4444]

// Latency text:
className="text-[11px] font-mono text-[#71717A]"
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add app/(app)/reports/reports-client.tsx app/(app)/reports/components/
git commit -m "feat(design): reports — light KPI cards, white chart bg, flat provider health dots"
```

---

## Task 12: Settings Shell

**Files:**
- Modify: `app/(app)/settings/settings-shell.tsx`

- [ ] **Step 1: Read the file**

```bash
head -100 "app/(app)/settings/settings-shell.tsx"
```

- [ ] **Step 2: Apply systematic replacements**

Same token table. Key structural patterns:

**Tab navigation:**
```tsx
// Tab button:
className={cn(
  "relative pb-3 text-[13px] font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap",
  activeTab === tab.id ? "text-[#09090B]" : "text-[#A1A1AA] hover:text-[#71717A]"
)}
// Active underline:
className="absolute bottom-0 inset-x-0 h-[2px] bg-[#2563EB] rounded-full"
// Tab bar border:
className="border-b border-[#E4E4E7] mb-6"
```

**Section cards:**
```tsx
<div className="rounded-xl border border-[#E4E4E7] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-4">
  <h3 className="text-[15px] font-bold text-[#09090B] mb-1">{title}</h3>
  <p className="text-[13px] text-[#71717A] mb-5">{description}</p>
  {/* form content */}
</div>
```

**Form labels and helpers:**
```tsx
<label className="block text-[12px] font-semibold text-[#3F3F46] mb-1.5">{label}</label>
<p className="text-[11px] text-[#A1A1AA] mt-1">{helper}</p>
```

**Danger zone:**
```tsx
<div className="rounded-xl border border-[#FECACA] bg-[#FFF1F2] p-6">
  <h3 className="text-[15px] font-bold text-[#991B1B] mb-1">Zona de Perigo</h3>
  <p className="text-[13px] text-[#B91C1C]/80 mb-4">{description}</p>
  <Button variant="secondary" className="border-[#FECACA] text-[#DC2626] hover:bg-[#FEE2E2]">
    Excluir conta
  </Button>
</div>
```

**Save/cancel buttons:**
```tsx
<Button variant="primary" size="sm">Salvar</Button>
<Button variant="secondary" size="sm">Cancelar</Button>
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add app/(app)/settings/settings-shell.tsx
git commit -m "feat(design): settings — light tab nav, white section cards, styled danger zone"
```

---

## Task 13: Final Integration Check

**Files:** No new changes — verification only.

- [ ] **Step 1: Run full check suite**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: typecheck exit 0, 42/42, build succeeds.

- [ ] **Step 2: Start dev server and verify visually**

```bash
pnpm dev
```

Open http://localhost:3000 and check each route:
- [ ] `/inbox` — white sidebar, blue active nav, chat soft cards visible
- [ ] `/leads` — white table, semantic status badges, orange "Novo lead" button
- [ ] `/agenda` — white calendar grid, coloured left-border appointment cards
- [ ] `/reports` — white KPI cards, light chart backgrounds
- [ ] `/settings` — white cards, blue tab underline, red danger zone

Also verify:
- [ ] Mobile view (≤768px): bottom nav bar white with border-top, no backdrop-blur
- [ ] Mobile profile sheet: white bg, no dark gradient
- [ ] Warning banner (simulate unhealthy channel): light red bg, not dark red
- [ ] Trial user state: orange upgrade button in sidebar and mobile sheet

- [ ] **Step 3: Check for any remaining dark remnants**

```bash
# Search for dark bg values that should no longer exist in dashboard components
grep -r "bg-\[#09090" app/\(app\) components/app components/ui/badge.tsx components/ui/button.tsx components/app/chat-bubble.tsx
grep -r "bg-\[#0f1015\]" app/\(app\) components/app
grep -r "border-white/\[0\." app/\(app\) components/app
```

Fix any remaining occurrences using the cheat-sheet at the top of this plan.

- [ ] **Step 4: Update Obsidian docs**

Per completion protocol, create session log and update roadmap index:

Create `obsidian/05 - LOGS/sessions/2026-05-28-steel-precision-light-theme.md`:
```markdown
# 2026-05-28 — Phase 11: Steel Precision Light Theme

## Resumo
Implementação completa do redesign light theme (Steel Precision) — substituição de toda a base dark token system por fundo branco, sidebar expandida, sistema de cores Blue/Orange/Teal, e soft cards no Inbox. `pnpm typecheck` EXIT 0 | `pnpm test` 42/42 | `pnpm build` SUCESSO.

## Alterações
- `app/globals.css`: tokens @theme reescritos, fg-1/2/3 remapeados para light
- `components/ui/button.tsx`: variante orange adicionada, gradientes removidos
- `components/ui/badge.tsx`: tokens semânticos light
- `components/app/chat-bubble.tsx`: soft card system (lead=white, agent=blue, ai=teal)
- `components/ui/empty-state.tsx`: glow aurora removido
- `components/app/app-shell.tsx`, `sidebar.tsx`, `topbar.tsx`, `mobile-nav.tsx`: shell light
- `app/(app)/inbox/`: inline-client light tokens + soft cards
- `app/(app)/leads/`, `agenda/`, `reports/`, `settings/`: páginas light
```

Update `obsidian/05 - LOGS/_INDEX.md` — prepend to "Latest Sessions" and table.

Update `obsidian/01 - PRODUTO/roadmap/_INDEX.md` — add Phase 11 row:
```
| 11 | Steel Precision Light Theme | ✅ Concluído | 28/05/2026 |
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs: update Obsidian vault — Phase 11 Steel Precision Light Theme complete"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §4 Token system — Task 1 (globals.css full rewrite)
- [x] §5.1 App shell bg — Task 4
- [x] §5.2 Sidebar full spec — Task 5
- [x] §5.3 Topbar — Task 6
- [x] §5.4 Mobile nav — Task 7
- [x] §6.1 Buttons — Task 2
- [x] §6.2 Inputs — Task 1 (`.input` class)
- [x] §6.3 Badges — Task 2
- [x] §6.4 Cards — Task 1 (`.glass`/`.card`)
- [x] §6.5 Dropdowns — Task 8 (ToneDropdown, ControlModeDropdown)
- [x] §6.6 Scrollbars — Task 1
- [x] §7.1 Inbox — Task 8 (13 steps, full coverage)
- [x] §7.2 Leads — Task 9
- [x] §7.3 Agenda — Task 10
- [x] §7.4 Reports — Task 11
- [x] §7.5 Settings — Task 12
- [x] §8 Global CSS — Task 1
- [x] §9 Motion — no changes needed; Framer Motion kept, patterns unchanged
- [x] §10 Mobile — Tasks 6 (profile sheet), 7 (bottom nav), 8 (chat input padding)
- [x] §11 Migration map — embedded in each task as explicit before/after
- [x] §14 Success criteria — Task 13 verification steps

**Placeholder scan:** No TBD/TODO/placeholder text found.

**Type consistency:**
- `Button` `variant` type updated to include `"orange"` in Task 2 — used in Tasks 5, 8, 9, 12 ✓
- `Badge` `Heat` type unchanged — used in Tasks 2, 8, 9 ✓
- `ChatBubble` `Variant` type unchanged — used in Task 8 ✓
