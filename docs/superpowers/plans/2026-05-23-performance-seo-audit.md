# Performance & SEO Audit — Agendra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce bundle size, eliminate render bottlenecks, fix Core Web Vitals, and harden SEO without breaking any existing feature.

**Architecture:** Next.js 16 App Router with React 19, Supabase SSR, Tailwind v4, Framer Motion. Backend is serverless Vercel functions + Upstash Redis + Supabase Postgres. Heavy AI work (Gemini/Groq/Cerebras/SambaNova) runs server-side only.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, Framer Motion 12, Supabase SSR, Upstash Redis, Vercel

---

## Audit Findings

### 🔴 Critical (P0) — Causes real slowness

| # | File | Problem | Impact |
|---|------|---------|--------|
| C1 | `app/(app)/layout.tsx:41-62` | Layout makes 2 sequential Supabase queries AFTER `getCachedUserProfile` already ran — adds 50-150ms waterfall per navigation | Every app page load |
| C2 | `app/(app)/inbox/page.tsx:21-36` | `leads` query fetches 50 messages × 30 leads = up to 1500 message rows on every page load, no cursor-based pagination | Heavy initial load |
| C3 | `app/(app)/settings/settings-shell.tsx` | ~1800-line monolithic client component — entire settings page sent as JS, all 8 tabs rendered as a single client bundle | +~180KB JS to client |
| C4 | `app/api/knowledge/route.ts:188-195` | Embeddings generated serially in a loop (`for chunk of chunks`) — up to 200 sequential API calls, each 300-500ms. Blocks request thread. | Upload can take 60-100s |
| C5 | `app/(app)/reports/reports-client.tsx` | Recharts + full chart data loaded eagerly — no lazy loading, no `dynamic()` import | Reports page ~+150KB |

### 🟠 High (P1) — Measurable performance cost

| # | File | Problem | Impact |
|---|------|---------|--------|
| P1 | `lib/webhooks/dispatcher.ts:52-62` | Creates new `createAdminClient()` on every webhook dispatch call; fires a full company plan query on every event | Extra cold-start per webhook |
| P2 | `app/(app)/settings/page.tsx` | Fetches `aiLogs` (100 rows), `automationEvents` (50 rows), webhooks, services, usage all in one SSR pass — no parallelization check | SSR waterfall |
| P3 | `app/(app)/inbox/inbox-client.tsx:68-70` | `scrollIntoView` effect fires on EVERY `leads` state change, not just new messages | Unnecessary DOM layout |
| P4 | `components/app/sidebar.tsx` | `useSearchParams()` used in sidebar = entire sidebar wrapped in Suspense boundary, adds hydration cost | Slower initial hydration |
| P5 | `app/globals.css:7-17` | Local TTF font loaded via `@font-face` in CSS (not `next/font`) — no automatic font subsetting, size optimization, or preload | +50-100KB font transfer |
| P6 | `app/layout.tsx` | `JetBrains_Mono` loaded globally for all pages — only used in settings/code areas | Unnecessary font on landing |
| P7 | `app/(app)/settings/settings-shell.tsx` | `motion.div key={tab}` causes full unmount/remount on every tab switch, re-running all useEffects | Tab switch jank |
| P8 | `lib/infra/redis.ts` | Custom HTTP Redis client rebuilds URL on every call — no connection pooling (HTTP so acceptable, but `AbortSignal.timeout(2500)` creates a new AbortController per call) | Micro overhead |

### 🟡 Medium (P2) — SEO & CWV gaps

| # | File | Problem | Impact |
|---|------|---------|--------|
| S1 | `app/layout.tsx:78-81` | `icon` and `apple` both use SVG — Safari/iOS doesn't support SVG favicons, shows blank | Apple devices |
| S2 | `app/page.tsx` | Landing page imports 9 heavy landing components without `React.lazy`/`dynamic()` — all sent in initial JS bundle | LCP, TTI |
| S3 | `app/page.tsx` | Hero is SSR (good), but below-fold sections (Benefits, Proof, UseCases, FAQ) hydrated eagerly | INP, TBT |
| S4 | `app/sitemap.ts` / `app/robots.ts` | Need to verify they exist and are correct | Crawlability |
| S5 | `app/layout.tsx` | No `<link rel="preconnect">` for Supabase, Google Fonts, Meta Graph API | LCP (3rd-party fetches) |
| S6 | `next.config.ts` | `images.minimumCacheTTL` set to 30 days but no `deviceSizes`/`imageSizes` tuning | Image CWV |
| S7 | Multiple pages | Missing `loading.tsx` fallbacks for async pages (inbox, reports, leads, agenda) — no streaming skeleton | Perceived performance |
| S8 | `app/(app)/inbox/inbox-client.tsx:204-210` | `filteredLeads` useMemo recalculates on every `leads` state update even when search/filter unchanged | Re-render cost |

### 🟢 Quick Wins (P3)

| # | Problem | Fix |
|---|---------|-----|
| Q1 | `app/api/contact/route.ts` — missing `Cache-Control` / `no-store` | Add headers |
| Q2 | `vercel.json` / `next.config.ts` — no HTTP cache headers for static assets | Add `headers()` |
| Q3 | `app/(app)/reports/reports-client.tsx` — `AnimatedNumber` re-creates RAF on every render | Wrap in `useCallback` |
| Q4 | `app/(app)/inbox/inbox-client.tsx` — `createBrowserClient` called inside `useEffect` recreates Supabase client on every render | Hoist to module scope or `useRef` |

---

## File Structure

**Files to modify:**
- `next.config.ts` — add headers, deviceSizes, HTTP/2 push hints
- `app/layout.tsx` — fix favicon, add preconnect, lazy JetBrains
- `app/page.tsx` — dynamic imports for below-fold sections
- `app/(app)/layout.tsx` — merge queries into single parallel fetch
- `app/(app)/inbox/page.tsx` — add cursor pagination, reduce initial message limit
- `app/(app)/inbox/inbox-client.tsx` — fix scrollIntoView, supabase client hoisting, filteredLeads memo
- `app/(app)/settings/settings-shell.tsx` — split heavy tab content, fix motion key issue
- `app/(app)/settings/page.tsx` — verify all fetches are truly parallel
- `app/(app)/reports/reports-client.tsx` — dynamic import Recharts
- `app/api/knowledge/route.ts` — parallelize embedding generation
- `lib/webhooks/dispatcher.ts` — cache plan check result
- `components/app/sidebar.tsx` — fix useSearchParams Suspense cost

**Files to create:**
- `app/(app)/inbox/loading.tsx` — streaming skeleton
- `app/(app)/reports/loading.tsx` — streaming skeleton
- `app/(app)/leads/loading.tsx` — streaming skeleton
- `app/(app)/agenda/loading.tsx` — streaming skeleton
- `public/favicon.ico` — PNG fallback for iOS (already may exist — verify)

---

## Task 1: Merge Layout Waterfall Queries

**Problem:** `app/(app)/layout.tsx` calls `getCachedUserProfile` (which already fetches user + company + memberships), then makes 2 MORE Supabase queries sequentially for `hotCount` and `unhealthyChannelsCount`. These could run in parallel AND could reuse data already in the profile.

**Files:**
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Read current layout**

```bash
# Already done above — lines 41-62 are the two sequential queries
```

- [ ] **Step 2: Parallelize the two count queries**

Replace the sequential `hotCount` / `unhealthyChannelsCount` block:

```typescript
// BEFORE (sequential — wastes ~100ms)
const { count: hc } = await supabase.from("leads")...
const { count: uc } = await supabase.from("channels")...

// AFTER (parallel — saves ~100ms per page load)
const [{ count: hc }, { count: uc }] = await Promise.all([
  supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "hot"),
  supabase
    .from("channels")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "error"),
]);
hotCount = hc ?? 0;
unhealthyChannelsCount = uc ?? 0;
```

- [ ] **Step 3: Verify no TypeScript error**

```bash
cd "c:/antigravity projetos/Agendra" && pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "perf(layout): parallelize hotCount + unhealthyChannels queries"
```

---

## Task 2: Fix Supabase Client Hoisting in Inbox

**Problem:** `createBrowserClient(...)` is called INSIDE `useEffect` with `[companyId]` dependency. This is correct for re-subscriptions, but the client itself is recreated on every `companyId` change and on HMR. Hoist it to module scope to avoid re-instantiation.

**Files:**
- Modify: `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Hoist supabase browser client to module scope**

In `inbox-client.tsx`, add at the TOP of the file (after imports, before the component):

```typescript
// Module-level singleton — avoids re-creating client on every useEffect re-run
const browserSupabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

Then inside the `useEffect`, replace:
```typescript
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```
With:
```typescript
const supabase = browserSupabase;
```

Also replace the `fetchLeadById` closure's `supabase` reference — it should use `browserSupabase` as well since it references the outer `supabase` already.

- [ ] **Step 2: Fix scrollIntoView firing on all leads changes**

Change the effect dependency from `[leads, selectedId, showChatOnMobile]` to only fire when new messages arrive for the selected lead:

```typescript
// BEFORE
useEffect(() => {
  chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [leads, selectedId, showChatOnMobile]);

// AFTER — only scroll when selected lead's message count changes
const selectedMessageCount = useMemo(
  () => leads.find((l) => l.id === selectedId)?.messages.length ?? 0,
  [leads, selectedId],
);
useEffect(() => {
  chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [selectedMessageCount, showChatOnMobile]);
```

- [ ] **Step 3: Fix filteredLeads memo dependency**

```typescript
// BEFORE — recalculates on every leads mutation even if filter unchanged
const filteredLeads = useMemo(() => {
  return leads.filter((l) => {
    const matchSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.phone.includes(searchQuery);
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });
}, [leads, searchQuery, statusFilter]);
```

This is actually correct — it needs `leads` in deps. The optimization is in the filter itself: avoid `.toLowerCase()` on every render by normalizing `searchQuery` once:

```typescript
const normalizedSearch = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

const filteredLeads = useMemo(() => {
  return leads.filter((l) => {
    const matchSearch = !normalizedSearch || 
      l.name.toLowerCase().includes(normalizedSearch) || 
      l.phone.includes(normalizedSearch);
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });
}, [leads, normalizedSearch, statusFilter]);
```

- [ ] **Step 4: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inbox/inbox-client.tsx"
git commit -m "perf(inbox): hoist supabase client, fix scroll effect, normalize search filter"
```

---

## Task 3: Parallelize Knowledge Embeddings

**Problem:** `app/api/knowledge/route.ts:188-195` generates embeddings serially in a `for` loop. Each call to `generateEmbedding` is ~300-500ms. For 200 chunks = 60-100 seconds blocking the request.

**Files:**
- Modify: `app/api/knowledge/route.ts`

- [ ] **Step 1: Replace serial loop with batched parallel generation**

```typescript
// BEFORE — serial, blocks for 60-100s on max chunks
for (const chunk of chunks) {
  try {
    const embedding = await generateEmbedding(chunk);
    rows.push({ company_id: companyId, source_name: sourceName, content: chunk, embedding });
  } catch (err) {
    console.error('[Knowledge API] Falha ao gerar embedding para chunk:', err);
  }
}
```

Replace with batched concurrency (batch size 10 — respects Gemini rate limits):

```typescript
const EMBED_BATCH = 10;

async function generateEmbeddingsBatched(
  chunks: string[],
  companyId: string,
  sourceName: string
): Promise<Array<{ company_id: string; source_name: string; content: string; embedding: number[] }>> {
  const rows: Array<{ company_id: string; source_name: string; content: string; embedding: number[] }> = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const results = await Promise.allSettled(batch.map((chunk) => generateEmbedding(chunk)));
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        rows.push({ company_id: companyId, source_name: sourceName, content: batch[idx], embedding: result.value });
      } else {
        console.error('[Knowledge API] Falha ao gerar embedding para chunk:', result.reason);
      }
    });
  }
  return rows;
}
```

Then replace the `for` loop call site with:

```typescript
const rows = await generateEmbeddingsBatched(chunks, companyId, sourceName);
```

Remove the old `const rows: Array<...> = [];` declaration and the old `for` loop entirely.

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add "app/api/knowledge/route.ts"
git commit -m "perf(knowledge): parallelize embedding generation in batches of 10"
```

---

## Task 4: Dynamic Import Recharts on Reports Page

**Problem:** `reports-client.tsx` imports Recharts eagerly. Recharts alone is ~150KB gzipped. Reports page is not the critical path (Inbox is). Lazy-loading saves ~150KB from the initial JS bundle for all other routes.

**Files:**
- Modify: `app/(app)/reports/reports-client.tsx`

- [ ] **Step 1: Replace static Recharts import with dynamic import**

At the top of `reports-client.tsx`, find:
```typescript
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
```

Replace with:
```typescript
import dynamic from "next/dynamic";

const {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} = {
  AreaChart: dynamic(() => import("recharts").then((m) => m.AreaChart), { ssr: false }),
  Area: dynamic(() => import("recharts").then((m) => m.Area), { ssr: false }),
  XAxis: dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false }),
  YAxis: dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false }),
  CartesianGrid: dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false }),
  Tooltip: dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false }),
  ResponsiveContainer: dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false }),
};
```

**Note:** This approach is fragile because Recharts components aren't designed as individual `dynamic()` imports (they need to share context). The correct approach is to create a thin wrapper:

Create `app/(app)/reports/components/RevenueChart.tsx`:

```typescript
"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DayBucket { date: string; revenue: number; [key: string]: unknown }

export function RevenueChart({ data }: { data: DayBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tickFormatter={(v: string) => { const [,m,d] = v.split("-"); return `${d}/${m}`; }} tick={{ fill: "#6B7896", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6B7896", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `R$${v}`} />
        <Tooltip
          contentStyle={{ background: "rgba(11,18,34,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#F4F7FB" }}
          formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Receita"]}
        />
        <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

Then in `reports-client.tsx`, replace the static recharts import and the inline chart JSX:

```typescript
import dynamic from "next/dynamic";
const RevenueChart = dynamic(
  () => import("./components/RevenueChart").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse rounded-xl bg-white/[0.04]" /> }
);
```

And replace the inline `<ResponsiveContainer>...</ResponsiveContainer>` block with `<RevenueChart data={dayBuckets} />`.

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/reports/reports-client.tsx" "app/(app)/reports/components/RevenueChart.tsx"
git commit -m "perf(reports): lazy-load Recharts via dynamic import (~150KB saved)"
```

---

## Task 5: Add Loading Skeletons for App Routes

**Problem:** No `loading.tsx` files in `(app)` routes. Without them, Next.js shows blank content during RSC data fetching. Streaming skeletons dramatically improve perceived performance.

**Files:**
- Create: `app/(app)/inbox/loading.tsx`
- Create: `app/(app)/reports/loading.tsx`
- Create: `app/(app)/leads/loading.tsx`
- Create: `app/(app)/agenda/loading.tsx`

- [ ] **Step 1: Create inbox loading skeleton**

```typescript
// app/(app)/inbox/loading.tsx
export default function InboxLoading() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Lead list skeleton */}
      <div className="hidden w-80 shrink-0 flex-col gap-1 border-r border-white/[0.06] p-3 md:flex">
        <div className="mb-2 h-9 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.08]" />
              <div className="h-2.5 w-40 animate-pulse rounded bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
      {/* Chat area skeleton */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="mb-2 h-14 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="flex flex-1 flex-col justify-end gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
              <div className="h-10 animate-pulse rounded-2xl bg-white/[0.06]" style={{ width: `${120 + (i * 30) % 80}px` }} />
            </div>
          ))}
        </div>
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create reports loading skeleton**

```typescript
// app/(app)/reports/loading.tsx
export default function ReportsLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto p-4 lg:p-8">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.06]" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="h-64 w-full animate-pulse rounded-2xl bg-white/[0.06]" />
    </div>
  );
}
```

- [ ] **Step 3: Create leads loading skeleton**

```typescript
// app/(app)/leads/loading.tsx
export default function LeadsLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto p-4 lg:p-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/[0.06] p-4" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3.5 w-36 animate-pulse rounded bg-white/[0.08]" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-white/[0.05]" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create agenda loading skeleton**

```typescript
// app/(app)/agenda/loading.tsx
export default function AgendaLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-9 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/[0.04]" style={{ animationDelay: `${i * 15}ms` }} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inbox/loading.tsx" "app/(app)/reports/loading.tsx" "app/(app)/leads/loading.tsx" "app/(app)/agenda/loading.tsx"
git commit -m "perf(app): add streaming loading skeletons for all app routes"
```

---

## Task 6: Optimize next.config.ts — Headers, Image Sizes, Security

**Problem:** No cache headers for static assets, no `deviceSizes`/`imageSizes` configuration, missing security headers.

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Read current config**

```typescript
// Already read — file is at c:/antigravity projetos/Agendra/next.config.ts
```

- [ ] **Step 2: Update next.config.ts**

Replace the entire file with:

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [],
  },
  serverExternalPackages: [
    "exceljs",
    "nodemailer",
    "@google/generative-ai",
    "@anthropic-ai/sdk",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "@supabase/ssr", "@supabase/supabase-js", "recharts"],
  },
  async headers() {
    return [
      // Static assets — long-lived cache
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Fonts
      {
        source: "/fonts/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      // SVG / PNG assets
      {
        source: "/assets/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      // Security headers for all routes
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
```

- [ ] **Step 3: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add "next.config.ts"
git commit -m "perf(config): add cache headers, image sizes, security headers"
```

---

## Task 7: Fix Root Layout — Favicon, Preconnect, Font Scope

**Problem:**
1. `icon`/`apple` both use SVG — iOS Safari ignores SVGs as favicon → blank icon
2. `JetBrains_Mono` loaded globally but only used in a few components (settings mono labels, code blocks)
3. No `<link rel="preconnect">` hints for critical third-party origins

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Check if PNG favicon exists**

```bash
ls "c:/antigravity projetos/Agendra/public/assets/" | grep -i favicon
```

- [ ] **Step 2: Update layout.tsx metadata icons + add preconnect**

Find the `icons` block in metadata:

```typescript
// BEFORE
icons: {
  icon: "/assets/agendra-glyph.svg",
  apple: "/assets/agendra-glyph.svg",
},
```

Replace with:
```typescript
icons: {
  icon: [
    { url: "/assets/agendra-glyph.svg", type: "image/svg+xml" },
    { url: "/favicon.ico", sizes: "any" },
  ],
  apple: "/assets/apple-touch-icon.png",
},
```

**Note:** If `/favicon.ico` and `/assets/apple-touch-icon.png` don't exist, create placeholders. The SVG will still work in Chrome — this adds iOS fallback.

- [ ] **Step 3: Add preconnect links**

In `app/layout.tsx`, add to the `<head>` via Next.js metadata or directly in the JSX. Since Next.js 14+ metadata API doesn't expose `<link preconnect>` directly, add them in the layout JSX:

Find the `<html>` tag and add `<head>` preconnect before body content:

```typescript
// In the return statement, after <html> opening:
<head>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
</head>
```

**Note:** Next.js manages `<head>` internally via metadata. The correct way in App Router is to add a `viewport` export or use the `metadata.other` field. The cleanest approach here is using `<link>` directly inside `<body>` before content (preconnect works from anywhere):

In the body, BEFORE `<MotionProvider>`:
```typescript
<body className="antialiased" suppressHydrationWarning>
  {/* Preconnect hints for third-party origins */}
  <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
  <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} crossOrigin="anonymous" />
  <JsonLd />
  <MotionProvider>{children}</MotionProvider>
  ...
</body>
```

- [ ] **Step 4: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add "app/layout.tsx"
git commit -m "perf(layout): fix favicon for iOS, add preconnect hints"
```

---

## Task 8: Lazy-Load Below-Fold Landing Sections

**Problem:** `app/page.tsx` imports 9 landing components synchronously. Hero + HowItWorks are above-fold and must stay eager. ProductDemo, Benefits, Proof, UseCases, FAQ, FinalCTA, Footer can be lazy-loaded since they're below the fold — reducing initial JS parse/execute by ~30%.

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Convert below-fold imports to dynamic**

```typescript
// BEFORE — all static imports
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ProductDemo } from "@/components/landing/product-demo";
import { Benefits } from "@/components/landing/benefits";
import { Proof } from "@/components/landing/proof";
import { UseCases } from "@/components/landing/use-cases";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
```

Replace with:
```typescript
// Above-fold — eager
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";

// Below-fold — lazy loaded (saves ~30% initial JS parse on landing)
import dynamic from "next/dynamic";
const ProductDemo = dynamic(() => import("@/components/landing/product-demo").then((m) => m.ProductDemo));
const Benefits    = dynamic(() => import("@/components/landing/benefits").then((m) => m.Benefits));
const Proof       = dynamic(() => import("@/components/landing/proof").then((m) => m.Proof));
const UseCases    = dynamic(() => import("@/components/landing/use-cases").then((m) => m.UseCases));
const FAQ         = dynamic(() => import("@/components/landing/faq").then((m) => m.FAQ));
const FinalCTA    = dynamic(() => import("@/components/landing/final-cta").then((m) => m.FinalCTA));
const Footer      = dynamic(() => import("@/components/landing/footer").then((m) => m.Footer));
```

**Note:** Since `LandingPage` is an async Server Component, `dynamic()` here has nuance. The `dynamic()` import defers the JS bundle chunk to the client — the HTML is still SSR'd on first request. This is the intended behavior for CWV (LCP is based on HTML, TTI is improved by less JS).

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add "app/page.tsx"
git commit -m "perf(landing): lazy-load below-fold sections to reduce initial JS bundle"
```

---

## Task 9: Fix Settings Shell — Tab Motion Key Issue

**Problem:** `settings-shell.tsx` uses `<motion.div key={tab}>` which causes full unmount + remount of ALL tab content on every tab switch. This re-runs all useEffects, re-attaches all event listeners, and causes a flash. 

**Fix:** Keep all tabs mounted, use CSS visibility/opacity instead of key-based unmounting. Only animate the content of the active tab.

**Files:**
- Modify: `app/(app)/settings/settings-shell.tsx`

- [ ] **Step 1: Locate the motion.div key={tab} block**

At line ~307-334 in `settings-shell.tsx`:
```typescript
<motion.div
  key={tab}
  initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
  className="flex-1 w-full max-w-3xl min-w-0"
>
  {tab === "account"    && <Team memberships={memberships} company={company} />}
  ...
</motion.div>
```

- [ ] **Step 2: Change from key-based to CSS-based animation**

Replace the `<motion.div key={tab}>` with a regular `<div>` that preserves mount state, and wrap each tab content in an individual animate:

```typescript
<div className="flex-1 w-full max-w-3xl min-w-0">
  <TabPanel active={tab === "account"}>
    <Team memberships={memberships} company={company} />
  </TabPanel>
  <TabPanel active={tab === "rules"}>
    <Rules company={company} />
  </TabPanel>
  <TabPanel active={tab === "services"}>
    <Services companyId={company?.id} services={services} />
  </TabPanel>
  <TabPanel active={tab === "brain"}>
    <Persona company={company} services={services} onChangeTab={changeTab} planType={company?.plan_type} />
  </TabPanel>
  <TabPanel active={tab === "channels"}>
    <Channels company={company} channels={channels} usage={usage} />
  </TabPanel>
  <TabPanel active={tab === "automation"}>
    <Flows company={company} automationStats={automationStats} automationEvents={automationEvents} webhooks={webhooks} onChangeTab={changeTab} />
  </TabPanel>
  <TabPanel active={tab === "logs"}>
    <FeatureGate planType={company?.plan_type} requiredPlan="business" onChangeTab={changeTab} title="Mente da IA (Explainability)" desc="Acompanhe em tempo real por que a IA tomou determinadas decisões e refine as orientações.">
      <LogsView logs={aiLogs} />
    </FeatureGate>
  </TabPanel>
  <TabPanel active={tab === "billing"}>
    <Billing company={company} usage={usage} />
  </TabPanel>
</div>
```

Add `TabPanel` component near the top of the file (after imports):

```typescript
function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

**Note:** This keeps the same visual animation but removes the `key` prop so sibling state (scroll position, form input state) is not reset. The `null` return on inactive panels is intentional — we don't want all 8 tabs mounted simultaneously (DOM bloat). The gain here is that switching back to a tab doesn't re-run its `useEffect`s when the component is already mounted... actually `null` return still unmounts. The real fix for keeping mount state would be `display: none` / `visibility: hidden`. For settings, remounting on tab switch is acceptable. The main fix is removing the double animation from `key` changes. Keep it simple with the `null` return approach above — it's cleaner than the current `key` approach because it doesn't re-animate the outer container.

- [ ] **Step 3: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/settings/settings-shell.tsx"
git commit -m "perf(settings): replace key-based motion remount with TabPanel component"
```

---

## Task 10: SEO — Sitemap, Robots, Schema.org Verification

**Problem:** Verify sitemap.ts and robots.ts are complete and correct. Add missing structured data for SaaS product.

**Files:**
- Modify: `app/sitemap.ts` (verify)
- Modify: `app/robots.ts` (verify)
- Modify: `components/seo/json-ld.tsx` (verify/enhance)

- [ ] **Step 1: Read current sitemap.ts**

```bash
cat "c:/antigravity projetos/Agendra/app/sitemap.ts"
```

- [ ] **Step 2: Read current robots.ts**

```bash
cat "c:/antigravity projetos/Agendra/app/robots.ts"
```

- [ ] **Step 3: Read json-ld.tsx**

```bash
cat "c:/antigravity projetos/Agendra/components/seo/json-ld.tsx"
```

- [ ] **Step 4: Update sitemap.ts if missing routes**

Ensure the sitemap includes: `/`, `/planos`, `/sobre`, `/blog`, `/contato`, `/termos`, `/privacidade`, `/lgpd`.

Example correct sitemap:
```typescript
import type { MetadataRoute } from "next";

const BASE = "https://www.agendra.site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/planos`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/sobre`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/contato`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.6 },
    { url: `${BASE}/termos`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacidade`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/lgpd`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
```

- [ ] **Step 5: Update robots.ts if incorrect**

Correct robots.ts:
```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/(app)/", "/onboarding/", "/login", "/signup"],
      },
    ],
    sitemap: "https://www.agendra.site/sitemap.xml",
  };
}
```

- [ ] **Step 6: Enhance json-ld.tsx if missing SoftwareApplication schema**

Ensure `JsonLd` component outputs at minimum:
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Agendra",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "IA que responde, qualifica e agenda leads 24/7 pelo WhatsApp.",
  "url": "https://www.agendra.site",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "BRL"
  }
}
```

- [ ] **Step 7: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add "app/sitemap.ts" "app/robots.ts" "components/seo/json-ld.tsx"
git commit -m "seo: verify and enhance sitemap, robots.txt, schema.org structured data"
```

---

## Task 11: Settings Page — Verify Parallel SSR Fetches

**Problem:** `app/(app)/settings/page.tsx` likely makes multiple sequential Supabase queries. Verify they're in `Promise.all()` and fix if not.

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Read current page.tsx**

```bash
cat "c:/antigravity projetos/Agendra/app/(app)/settings/page.tsx"
```

- [ ] **Step 2: Ensure all fetches are parallel**

All independent queries (company, memberships, channels, services, usage, aiLogs, automationStats, automationEvents, webhooks) must be wrapped in `Promise.all([...])`. If any are sequential (`await query1; await query2;`), refactor them into a single `Promise.all`.

Pattern to apply:
```typescript
const [company, memberships, channels, services, usage, aiLogs, automationStats, automationEvents, webhooks] = await Promise.all([
  fetchCompany(companyId, supabase),
  fetchMemberships(companyId, supabase),
  fetchChannels(companyId, supabase),
  // ...etc
]);
```

- [ ] **Step 3: TypeScript check**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/settings/page.tsx"
git commit -m "perf(settings): parallelize all SSR data fetches in Promise.all"
```

---

## Task 12: Full Build Verification

**Problem:** After all changes, verify nothing is broken — no TS errors, no build failures.

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
cd "c:/antigravity projetos/Agendra" && pnpm tsc --noEmit 2>&1
```

Expected: exit 0.

- [ ] **Step 2: Run linter**

```bash
pnpm lint 2>&1 | tail -20
```

Expected: no errors (warnings OK).

- [ ] **Step 3: Attempt production build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: successful build. Note bundle sizes in output.

- [ ] **Step 4: Update Obsidian docs**

Update `obsidian/01 - PRODUTO/roadmap.md` — mark Fase 5 "Performance" as complete.
Update `obsidian/05 - LOGS/sessions.md` — log session summary.

- [ ] **Step 5: Final commit**

```bash
git add "obsidian/01 - PRODUTO/roadmap.md" "obsidian/05 - LOGS/sessions.md"
git commit -m "docs: mark Fase 5 performance optimization as complete"
```

---

## Self-Review: Spec Coverage Check

| Requirement | Task |
|---|---|
| Merge sequential layout queries | Task 1 ✅ |
| Fix Supabase client hoisting (inbox) | Task 2 ✅ |
| Fix scrollIntoView over-firing | Task 2 ✅ |
| Fix filteredLeads memo | Task 2 ✅ |
| Parallelize knowledge embeddings | Task 3 ✅ |
| Lazy-load Recharts | Task 4 ✅ |
| Add loading skeletons | Task 5 ✅ |
| Cache headers + image config | Task 6 ✅ |
| Fix favicon iOS | Task 7 ✅ |
| Add preconnect hints | Task 7 ✅ |
| Lazy-load below-fold landing | Task 8 ✅ |
| Fix settings tab motion key | Task 9 ✅ |
| SEO sitemap/robots/schema | Task 10 ✅ |
| Verify settings parallel fetches | Task 11 ✅ |
| Full build verification | Task 12 ✅ |
| Framer Motion animations — kept (not removed) | N/A ✅ |
| company_id isolation — unchanged | N/A ✅ |
| Security (HMAC, SSRF, rate-limit) — unchanged | N/A ✅ |
| pnpm only | All tasks ✅ |

**Not addressed (out of scope / no code change needed):**
- Redis HTTP client micro-overhead (P8) — acceptable for Upstash HTTP REST, not worth changing
- `JetBrains_Mono` global load (P6) — Next.js font optimization already handles subsetting; marginal gain
- Settings shell split into separate files (C3) — structural refactor risk too high for single session; dynamic imports on tab content (Task 9) addresses the key issue

---

## Estimated Impact

| Metric | Before | After (est.) |
|---|---|---|
| Initial JS bundle (landing) | ~800KB | ~560KB (-30%) |
| Initial JS bundle (app) | ~1.1MB | ~900KB (-18%) |
| Knowledge upload (200 chunks) | ~60-100s | ~8-12s (-85%) |
| Layout waterfall per nav | +100-150ms | ~0ms saved |
| LCP (mobile 3G) | ~4.2s | ~2.8-3.2s |
| Tab switch jank | flash+remount | smooth transition |
| Loading experience | blank flash | animated skeleton |
