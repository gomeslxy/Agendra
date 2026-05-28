# Agendra — Light Theme Redesign Spec
**Date:** 2026-05-28  
**Status:** Approved for implementation  
**Phase:** 11 — Steel Precision Light

---

## 1. Context & Problem

Phase 10 migrated from Liquid Glass → High-Contrast Minimal Slate (dark, `#09090B` base). The migration eliminated glows and blurs, but the product remains **heavy on dark mode** — every surface is near-black, every border is `white/0.08`, and the overall experience is visually fatiguing after extended use. The user base (Brazilian SMBs, agency owners, sales operators) uses the product for hours daily. The current aesthetic, while precise, creates cognitive strain and projects a "heavy tech" vibe that undersells the product's ease and warmth.

**Root causes of visual heaviness:**
- Pure obsidian backgrounds (`#09090B`) absorb light and make the interface feel dense
- All surfaces differentiated only by 4-8% white opacity — imperceptible separation
- `white/X` opacity system creates muddy, hard-to-reason-about color values throughout components
- No genuine whitespace — every pixel filled with dark surfaces
- Bright accent colors (blue, teal, orange) look aggressive on pure black
- Mobile experience inherits all desktop density problems

---

## 2. Design Decisions (Approved)

| Decision | Choice | Rationale |
|---|---|---|
| Overall direction | **C — Steel Precision** | Near-white base, full sidebar with labels, dense-but-breathable table. Linear/GitHub/Raycast reference. |
| Color system | **Blue-first hybrid** | Blue primary for nav/focus/actions. Orange for CTAs and conversion. Teal for AI indicators. Semantic colors for lead status. NOT 100% blue — contextual use of full brand palette. |
| Inbox chat style | **C — Soft Cards** | Messages as floating cards with shadow. IA drafts as distinct green cards with inline approval buttons. More tactile, visually differentiates roles clearly. |

---

## 3. Design Principles

1. **Legibility over decoration** — every color and element must earn its place by serving readability or function
2. **White as foundation** — the page breathes; containers float on white, not inside dark boxes
3. **Semantic color, not decorative color** — orange means "action/conversion", teal means "AI/automation", blue means "navigation/interaction", green means "success/confirmed"
4. **Shadows over borders** — depth through subtle box-shadow, not thick borders
5. **No opacity soup** — avoid `rgba(255,255,255,0.08)` patterns; use explicit named tokens instead
6. **Motion earns its place** — Framer Motion only for state transitions (enter/exit, active pill); no ambient animation

---

## 4. Token System

### 4.1 Color Palette

```css
/* ── Backgrounds ── */
--bg-base:     #FAFAFA;   /* page background */
--bg-surface:  #FFFFFF;   /* cards, sidebar, topbar, panels */
--bg-raised:   #F4F4F5;   /* hover states, secondary inputs, skeletons */
--bg-sunken:   #F0F0F1;   /* inset areas (chat message area background) */

/* ── Borders ── */
--border-soft:   #E4E4E7;  /* default borders, dividers */
--border-medium: #D4D4D8;  /* focused elements, stronger separation */
--border-strong: #A1A1AA;  /* active inputs, distinct sections */

/* ── Text ── */
--text-primary:   #09090B;  /* headings, important values */
--text-secondary: #3F3F46;  /* body text, labels */
--text-tertiary:  #71717A;  /* secondary labels, meta */
--text-placeholder: #A1A1AA; /* input placeholders */
--text-disabled:  #D4D4D8;  /* disabled states */

/* ── Brand Blue (Primary — Nav, Focus, Actions) ── */
--blue-50:  #EFF6FF;
--blue-100: #DBEAFE;
--blue-500: #3B82F6;
--blue-600: #2563EB;
--blue-700: #1D4ED8;
--blue-text: #1D4ED8; /* text on blue-50 bg */

/* ── Brand Orange (CTA, Conversion, Upgrade) ── */
--orange-50:  #FFF7ED;
--orange-100: #FFEDD5;
--orange-400: #FB923C;
--orange-500: #F97316;
--orange-600: #EA580C;

/* ── Brand Teal (AI, Automation, Live) ── */
--teal-50:  #F0FDFA;
--teal-100: #CCFBF1;
--teal-400: #2DD4BF;
--teal-500: #14B8A6;
--teal-600: #0D9488;
--teal-text: #0F766E;

/* ── Semantic: Lead Status ── */
--status-hot:   #F97316;  /* hot leads */
--status-hot-bg: #FFF7ED;
--status-hot-border: #FED7AA;
--status-warm:  #F59E0B;
--status-warm-bg: #FEFCE8;
--status-warm-border: #FDE68A;
--status-cold:  #3B82F6;
--status-cold-bg: #EFF6FF;
--status-cold-border: #BFDBFE;
--status-success: #22C55E;
--status-success-bg: #F0FDF4;
--status-success-border: #BBF7D0;

/* ── Shadows ── */
--shadow-xs:  0 1px 2px rgba(0,0,0,0.06);
--shadow-sm:  0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
--shadow-md:  0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
--shadow-lg:  0 12px 32px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.05);
--shadow-blue: 0 2px 8px rgba(37,99,235,0.22);
--shadow-orange: 0 2px 8px rgba(249,115,22,0.25);
```

### 4.2 Typography (unchanged from Phase 10)

```
Display:  Inter Tight — headings, logo text
Body:     Inter — all body text, labels, UI strings
Mono:     JetBrains Mono — timestamps, plan labels, technical data
```

**Scale:**
| Token | Size | Weight | Use |
|---|---|---|---|
| `text-page-title` | 20px / -0.5px | 700 | Page h1, modal titles |
| `text-section-title` | 15px / -0.3px | 700 | Section headers |
| `text-label-lg` | 13px | 600 | Nav items, card titles |
| `text-body` | 13px | 400 | Body text |
| `text-body-sm` | 12px | 400 | Secondary body |
| `text-caption` | 11px | 500 | Meta, timestamps |
| `text-eyebrow` | 9px / 0.12em UC | 700 | Section dividers in sidebar |
| `text-badge` | 10px | 700 | Badges, pills |

### 4.3 Spacing & Radii

```
Sidebar width: 216px
Topbar height: 48px
Content padding: 20px (desktop), 16px (mobile)

Radii:
  --radius-sm:  6px   (badges, small buttons)
  --radius-md:  8px   (buttons, inputs, table cells)
  --radius-lg:  10px  (cards, user card in sidebar)
  --radius-xl:  14px  (modals, dropdowns)
  --radius-full: 999px (pills, avatars)
```

---

## 5. Layout Architecture

### 5.1 App Shell

```
grid: [216px_sidebar | 1fr_main]
main: [48px_topbar | 1fr_content]
```

- Background: `--bg-base` (`#FAFAFA`)
- Sidebar: `--bg-surface` + `border-right: 1px solid --border-soft`
- Topbar: `--bg-surface` + `border-bottom: 1px solid --border-soft`
- Content area: `--bg-base`

### 5.2 Sidebar

**Structure (top → bottom):**
1. Logo (agendra logotype + teal AI dot)
2. Section label: "Principal" (`text-eyebrow`, `--text-placeholder`)
3. Nav items: Inbox, Leads, Agenda, Relatórios
4. Section label: "Config."
5. Nav item: Configurações
6. `margin-top: auto` spacer
7. User card (border `--border-soft`, rounded-lg)

**Nav item states:**
- **Default:** `color: --text-tertiary`, no background
- **Hover:** `background: --bg-raised`
- **Active:** `background: --blue-50`, `border: 1px solid --blue-100`, `color: --blue-700`, `font-weight: 600`. Animated with Framer Motion `layoutId="nav-pill"`

**Nav badge variants:**
- Count badge (Inbox hot leads): `background: --blue-600`, white text
- Alert badge (Leads needing attention): `background: --orange-50`, `border: --orange-border`, `color: --orange-600`

**User card:**
- Name: `text-label-lg`
- Company · Plan: `text-caption`, `--text-tertiary`, monospace
- Trial progress bar: thin `2px` height, `--bg-raised` track, `--blue-500` fill
- Upgrade button: full-width, `background: --orange-500`, white text, `--radius-md`

### 5.3 Topbar

```
height: 48px
background: --bg-surface
border-bottom: 1px solid --border-soft
padding: 0 20px
```

**Left:** Breadcrumb — `PageName / Current` in `--text-tertiary`  
**Center:** Search input (`max-width: 320px`, `--bg-raised`, border `--border-soft`)  
**Right:** Notification bell → Primary action button (blue)

**Warning banner** (unhealthy channels):
- Replace `bg-red-500/0.06` backdrop with: `background: #FFF1F2`, `border-bottom: 1px solid #FED7AA`, `color: #C2410C`
- No blur, no gradient strip — clean flat alert

### 5.4 Mobile Nav

Bottom bar: 5 icons (Inbox, Leads, Agenda, Relatórios, Config.)
- Background: `--bg-surface`
- Border-top: `--border-soft`
- Active icon: `--blue-600`
- Safe area inset respected

---

## 6. Component Specifications

### 6.1 Buttons

```
Primary:    bg --blue-600, white text, hover --blue-700, shadow-blue on hover
Orange CTA: bg --orange-500, white text, hover --orange-600 (upgrade, Assinar, Novo lead quando CTA de conversão)
Secondary:  bg --bg-surface, border --border-soft, text --text-secondary, hover bg --bg-raised
Ghost:      no bg, no border, text --text-tertiary, hover bg --bg-raised
Destructive: bg #FEF2F2, border #FECACA, text #DC2626

Heights: sm=28px, md=34px (default), lg=40px
Radii: --radius-md (8px)
```

**Rule:** "Novo fluxo" in topbar = blue (navigation action). "Assinar Pro" / "Upgrade" = orange (conversion CTA). Send button in inbox = blue. Export = secondary.

### 6.2 Inputs

```css
.input {
  background: #FFFFFF;
  border: 1.5px solid #E4E4E7;
  border-radius: 8px;
  color: #09090B;
  height: 36px;
  padding: 0 12px;
}
.input:focus {
  border-color: #2563EB;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
  outline: none;
}
.input::placeholder { color: #A1A1AA; }
```

Textarea: same token, `padding: 10px 12px`, `resize: none`.

### 6.3 Badges & Status Pills

**Lead status badges:**
```
Hot:     bg --status-hot-bg,   border --status-hot-border,   text #C2410C
Warm:    bg --status-warm-bg,  border --status-warm-border,  text #854D0E
Cold:    bg --status-cold-bg,  border --status-cold-border,  text #1D4ED8
Success: bg --status-success-bg, border --status-success-border, text #166534
```

**AI status pills (rounded-full):**
```
Autônomo:  bg --teal-50,  border --teal-100,  dot --teal-500, text --teal-text
Copiloto:  bg --blue-50,  border --blue-100,  dot --blue-500, text --blue-700
Manual:    bg --bg-raised, border --border-soft, dot --border-medium, text --text-tertiary
```

**LIVE indicator:**
```
bg --teal-50, border --teal-100, text --teal-text, dot --teal-500 (animate-pulse)
```

### 6.4 Cards / Glass

**Replace `.glass` class:**
```css
.card {
  background: #FFFFFF;
  border: 1px solid #E4E4E7;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
}
.card-elevated {
  background: #FFFFFF;
  border: 1px solid #E4E4E7;
  border-radius: 10px;
  box-shadow: var(--shadow-md);
}
```

Remove `.glass-strong`. Remove `.glass::before` / `.glass::after`.

### 6.5 Dropdowns & Menus

```
bg: --bg-surface
border: 1px solid --border-soft
border-radius: --radius-xl
box-shadow: --shadow-lg
padding: 4px

Item default:  color --text-secondary, hover bg --bg-raised
Item active:   bg --blue-50, border-left 2px solid --blue-600, color --blue-700
```

### 6.6 Scrollbars

Light theme:
```css
* { scrollbar-color: #D4D4D8 transparent; }
*::-webkit-scrollbar-thumb { background: #D4D4D8; }
*::-webkit-scrollbar-thumb:hover { background: #A1A1AA; }
```

---

## 7. Page-by-Page Specifications

### 7.1 Inbox (`/inbox`)

**3-column layout** (desktop): `[260px list | 1fr chat | 220px detail]`  
**2-column** (tablet): `[260px list | 1fr chat]`  
**1-column** (mobile): list → chat push (current behavior)

**Column 1 — Lead List:**
- Header: `--bg-surface`, bottom border `--border-soft`
- Title "Inbox" + LIVE pill in teal
- Search input full-width, `--bg-raised`
- Tab filters: status tabs (Todos / Quente / Morno / Frio / Convertidos), active tab underline `--blue-600`
- Channel filter row: Canais / WhatsApp (teal icon) / Instagram (pink icon)
- Lead item:
  - Default: `--bg-surface`, border-bottom `#F4F4F5`
  - Hover: `--bg-raised`
  - Selected: `background: --blue-50`, `border-left: 2px solid --blue-600`, padding-left adjusted
  - Avatar: colored by lead status (hot=orange, warm=amber, cold=blue, success=purple/random)
  - Status dot on avatar: colored dot, `border: 2px solid --bg-surface`
  - Unread badge: `--blue-600` circle

**Column 2 — Chat:**
- Background: `--bg-sunken` (`#F0F0F1`)
- Header: `--bg-surface`, `border-bottom: --border-soft`
- Messages area: `--bg-sunken`, `padding: 16px 18px`, `gap: 8px`

**Message variants (Soft Cards):**
```
Lead message:
  align: flex-start
  bg: --bg-surface
  border: 1px solid --border-soft
  border-radius: 14px 14px 14px 3px
  box-shadow: --shadow-xs
  padding: 9px 13px
  color: --text-primary

Agent message (human):
  align: flex-end
  bg: --blue-600
  border-radius: 14px 14px 3px 14px
  box-shadow: --shadow-blue
  padding: 9px 13px
  color: white

AI auto-sent message:
  Same as agent but bg --blue-500 (slightly lighter) + small teal ✦ indicator

AI Draft card:
  align: flex-end
  stack: [label row] + [card] + [action buttons]
  label: "✦ RASCUNHO IA" in --teal-600, text-right, 9px/700
  card bg: --teal-50
  card border: 1.5px solid --teal-100
  card border-radius: 14px 14px 3px 14px
  card box-shadow: 0 1px 4px rgba(20,184,166,0.12)
  Actions: [Descartar: secondary] [Editar: secondary] [Aprovar: blue primary]

Note/System message:
  align: center
  bg: --status-warm-bg
  border: 1px solid --status-warm-border
  border-radius: 8px
  padding: 4px 12px
  text: --status-warm, 10px italic
```

**Input area:**
- `background: --bg-surface`, `border-top: 1px solid --border-soft`
- Input box: `--bg-raised`, border `--border-soft`, focus-ring blue
- Send button: `--blue-600` circle
- Attachment button: ghost icon button
- "IA no controle" blocker: overlay with blur, "Assumir Atendimento" button in orange

**Column 3 — Lead Detail:**
- `background: --bg-surface`, `border-left: --border-soft`
- Profile section: avatar (colored), name, phone, status badge
- Data section: KV pairs with `--text-tertiary` key / `--text-secondary` value
- AI summary card: teal card (`--teal-50` + `--teal-100` border)
- Booking card: shows confirmed appointment or "sem agendamento"
- Upgrade strip (trial users): `--orange-50` bg, orange border, orange CTA button

### 7.2 Leads (`/leads`)

**Layout:** Full-width table with sticky header

**Page header:**
```
Title: "Leads" (text-page-title)
Subtitle: "X leads · Y quentes" (text-caption, --text-tertiary)
Actions: [Exportar: secondary] [Novo Lead: orange CTA]
```

**Filter tabs:** Todos / Quente / Morno / Frio / Convertidos  
Active: underline `--blue-600`, `--text-primary`

**Table:**
```
container: bg --bg-surface, border --border-soft, border-radius --radius-lg, shadow --shadow-sm
header row: bg --bg-raised, border-bottom --border-medium
body rows:
  default: bg --bg-surface, border-bottom #F4F4F5
  hover: bg --bg-raised
  
Columns: [Avatar+Name | Phone | Channel | Status badge | Last activity | Actions]
Avatar: 32px circle, colored by lead
Status: badge with semantic colors (see 6.3)
Last activity: --text-tertiary, monospace, relative time
```

**Lead detail modal (drawer):**
- Full-height right drawer on desktop, bottom sheet on mobile
- White bg, shadow-lg, rounded-l-xl

**Empty state:**
- Large icon (zinc-300), title, subtitle, orange CTA button
- No aurora glows, no gradient backgrounds

### 7.3 Agenda (`/agenda`)

**Calendar view:**
- White surface, `--border-soft` grid lines
- Today highlight: `--blue-50` bg, `--blue-600` number
- Appointment cards: colored by status (hot/warm/success), white text, `--radius-md`
- No gradient backgrounds on cards — flat with subtle left-border accent

**Appointment card:**
```
bg: --status-hot-bg (or warm/success)
border: 1px solid corresponding border token
border-left: 3px solid --status-hot (colored accent)
color: --text-primary
border-radius: --radius-md
padding: 8px 12px
```

### 7.4 Reports (`/reports`)

**KPI cards row:**
```
bg: --bg-surface
border: --border-soft
shadow: --shadow-sm
border-radius: --radius-lg
padding: 20px
Number: text-page-title, --text-primary
Label: text-caption, --text-tertiary
Trend badge: green (up) / red (down), bg-tinted, no gradients
```

**Charts:**
- Background: white
- Grid lines: `#F4F4F5`
- Axis text: `--text-tertiary`
- Line/bar colors: blue primary, teal secondary, orange tertiary
- No gradient fills on area charts — use 8% opacity solid fill

**Provider health section:**
- Each provider as a row in a white card
- Status: green dot (healthy) / amber dot (degraded) / red dot (down)
- No glows on dots — flat colored dots

### 7.5 Settings (`/settings`)

**Layout:** Tab navigation (horizontal pills) + content card

**Tab nav:**
- Tabs: text-only, `--text-tertiary` default, `--text-primary` active
- Active underline: `--blue-600`, `2px`
- Lazy-loaded sections via `?tab=` param (existing pattern)

**Section cards:**
```
bg: --bg-surface
border: --border-soft
shadow: --shadow-sm
border-radius: --radius-lg
padding: 24px
```

**Form fields:**
- Labels: `text-label-lg`, `--text-secondary`
- Helper text: `text-caption`, `--text-tertiary`
- Error text: `text-caption`, `#DC2626`

**Danger zone:**
- Section with `background: #FFF1F2`, `border: 1px solid #FECACA`
- Destructive button: red outlined, not red filled

---

## 8. Global CSS Changes

### 8.1 Base Reset

```css
/* Replace current globals.css base */
html, body {
  background: #FAFAFA;  /* was: var(--color-ink-950) = #060A14 */
  color: #09090B;
}

::selection {
  background: rgba(37, 99, 235, 0.15);
  color: #09090B;
}

/* Scrollbars — light mode */
* { scrollbar-color: #D4D4D8 transparent; }
*::-webkit-scrollbar-thumb { background: #D4D4D8; }
*::-webkit-scrollbar-thumb:hover { background: #A1A1AA; }
```

**Also update `--color-fg-*` tokens** — these are used via `style={{ color: "var(--color-fg-2)" }}` throughout sidebar.tsx, topbar.tsx, and other components. Must be remapped to light values:

```css
/* In @theme — replace dark fg ramp */
--color-fg-1: #09090B;   /* was #FAFAFA — primary text */
--color-fg-2: #3F3F46;   /* was #E4E4E7 — secondary text */
--color-fg-3: #71717A;   /* was #A1A1AA — tertiary/placeholders */
```

This remaps all existing `var(--color-fg-X)` usages automatically without touching individual components.

### 8.2 Class Replacements

```css
/* .glass → .card */
.card {
  position: relative;
  background: #FFFFFF;
  border: 1px solid #E4E4E7;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
}

/* .glass-strong → .card-elevated */
.card-elevated {
  background: #FFFFFF;
  border: 1px solid #D4D4D8;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
}

/* .bg-aurora → just bg-base */
.bg-base {
  background: #FAFAFA;
}

/* .input — light version */
.input {
  background: #FFFFFF;
  border: 1.5px solid #E4E4E7;
  border-radius: 8px;
  color: #09090B;
  padding: 9px 12px;
  font: 400 14px var(--font-sans);
  outline: none;
  transition: border-color 150ms, box-shadow 150ms;
}
.input::placeholder { color: #A1A1AA; }
.input:focus {
  border-color: #2563EB;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
}

/* .grad-text — drop gradient, use plain text */
.grad-text { color: #09090B; }

/* .eyebrow */
.eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #A1A1AA;
}
```

### 8.3 CSS Variables — @theme Changes

**Remove (no longer relevant in light theme):**
- `--color-ink-50` through `--color-ink-950` ramp (dark navy surfaces — unused in light mode)
- `--shadow-glow-blue`, `--shadow-glow-teal`, `--shadow-glow-orange` (glow shadows replaced by standard shadows)
- Keep `--color-brand-*` ramps (still used for semantic coloring)

**Add to @theme:**

```css
@theme {
  /* Light base */
  --color-bg-base:    #FAFAFA;
  --color-bg-surface: #FFFFFF;
  --color-bg-raised:  #F4F4F5;
  --color-bg-sunken:  #F0F0F1;

  /* Borders */
  --color-border-soft:   #E4E4E7;
  --color-border-medium: #D4D4D8;
  --color-border-strong: #A1A1AA;

  /* Text */
  --color-text-primary:     #09090B;
  --color-text-secondary:   #3F3F46;
  --color-text-tertiary:    #71717A;
  --color-text-placeholder: #A1A1AA;
  --color-text-disabled:    #D4D4D8;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.05);
}
```

---

## 9. Motion

Keep Framer Motion. Rules:

- **Nav active pill:** `layoutId="nav-pill"`, spring `stiffness:400, damping:36`
- **Lead list items:** `initial:{opacity:0, x:-8}`, `animate:{opacity:1, x:0}`, stagger 0.02s
- **Active lead indicator:** `layoutId="active-lead"`, spring
- **Tab filter underline:** `layoutId` per filter group, spring
- **Page enter:** `initial:{opacity:0}`, `animate:{opacity:1}`, 120ms ease-out-expo
- **Draft card enter:** `initial:{opacity:0, y:8, scale:0.97}`, `animate:{opacity:1, y:0, scale:1}`
- **Profile bottom sheet (mobile):** spring slide-up, `stiffness:400, damping:40`
- **NO ambient/infinite animations** on the dashboard shell

---

## 10. Mobile Specifics

- Bottom nav bar: 5 icons, `--bg-surface`, `border-top: --border-soft`, safe-area-inset-bottom
- Touch targets: minimum 44×44px
- Lead list → Chat: push transition (current `showChatOnMobile` pattern kept)
- Chat input area: `padding-bottom: calc(72px + env(safe-area-inset-bottom, 12px))`
- Profile sheet: bottom sheet with handle, `--bg-surface`, `border-top: --border-soft`, no `backdrop-blur` (removed for performance)
- Sidebar hidden on mobile (bottom nav replaces it)

---

## 11. Migration Map (Dark → Light)

| Old class / value | New class / value |
|---|---|
| `bg-[#09090B]`, `bg-[#0f1015]` | `bg-[#FAFAFA]` or `bg-white` |
| `bg-aurora` | `bg-[#FAFAFA]` |
| `.glass` | `.card` |
| `.glass-strong` | `.card-elevated` |
| `border-white/[0.06]` | `border-[#E4E4E7]` |
| `border-white/[0.08]` | `border-[#E4E4E7]` |
| `border-white/[0.12]` | `border-[#D4D4D8]` |
| `bg-white/[0.03]` | `bg-[#F4F4F5]` |
| `bg-white/[0.05]` | `bg-[#F4F4F5]` |
| `text-white` (primary) | `text-[#09090B]` |
| `text-white/70` | `text-[#3F3F46]` |
| `text-white/40` | `text-[#71717A]` |
| `text-white/20` | `text-[#A1A1AA]` |
| `bg-[rgba(11,18,34,0.97)]` (mobile sheet) | `bg-white` |
| `shadow-[0_0_8px_rgba(59,130,246,0.7)]` (glow) | `box-shadow: 0 2px 8px rgba(37,99,235,0.22)` |
| `animate-pulse` on dots | keep (teal LIVE dot, AI active) |
| `shadow-glow-blue` | `--shadow-blue` |

---

## 12. Files to Modify

**Priority 1 — Foundation:**
- `app/globals.css` — full rewrite of base, `.glass`, `.input`, `.bg-aurora`, scrollbars, color vars
- `components/app/sidebar.tsx` — white bg, new nav item states, user card upgrade button orange
- `components/app/topbar.tsx` — white bg, light input, remove gradient avatar
- `components/app/app-shell.tsx` — remove `bg-aurora`, warning banner to light red
- `components/app/mobile-nav.tsx` — white bg, border-top, blue active icons
- `app/globals.css` `@theme` block — add new tokens (project uses Tailwind v4 CSS-first config, no tailwind.config.ts)

**Priority 2 — Core Views:**
- `app/(app)/inbox/inbox-client.tsx` — full message bubble system, lead list, chat area
- `app/(app)/leads/leads-client.tsx` — table, header, filters, modal
- `app/(app)/agenda/agenda-client.tsx` — calendar grid, appointment cards
- `app/(app)/reports/reports-client.tsx` — KPI cards, charts config

**Priority 3 — Supporting:**
- `app/(app)/settings/settings-shell.tsx` — tab nav, form cards
- `components/ui/empty-state.tsx` — remove aurora/glow, zinc placeholder
- `components/ui/badge.tsx` — light semantic variants
- `components/ui/button.tsx` — orange CTA variant, secondary light variant
- `components/ui/glass.tsx` — replace with `card` / `card-elevated`
- `components/app/chat-bubble.tsx` — soft-card bubble system
- `app/(app)/layout.tsx` — no changes likely
- `components/motion/` — no changes

---

## 13. Out of Scope

- Landing page (`app/page.tsx`, `components/landing/`) — separate concern, different visual DNA
- Auth pages (`app/(auth)/`) — minor cleanup only, not full redesign
- Onboarding (`app/onboarding/`) — separate session
- Dark mode toggle — not in scope; this is a full light mode replacement
- Database or API changes — zero backend impact

---

## 14. Success Criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` 42/42 passing
- [ ] `pnpm build` succeeds
- [ ] No `rgba(255,255,255,0.X)` patterns remaining in app shell or core views
- [ ] No `#09090B` / `#0f1015` backgrounds remaining in dashboard shell
- [ ] Sidebar renders white with full labels and blue active pill
- [ ] Inbox chat shows soft card bubbles (lead=white card, agent=blue card, AI draft=teal card)
- [ ] All lead status badges use semantic light-mode tokens (not dark opacity)
- [ ] Mobile bottom nav renders correctly with safe-area insets
- [ ] Orange upgrade CTA visible in sidebar user card and topbar (trial users)
- [ ] IA LIVE dot in teal visible in inbox header
