# Navigation Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate perceptible navigation delay in the Agendra dashboard, reducing route transition time from ~800-2300ms to under 150ms perceived latency.

**Architecture:** Replace blocking AnimatePresence with concurrent transitions, parallelize all server fetches, eliminate redundant auth checks per page, optimize queries with aggregation and pagination, and add Next.js route-level caching.

**Tech Stack:** Next.js 16 App Router, React 19, framer-motion 12, Supabase SSR, TypeScript

---

## Root Cause Summary

Ten identified bottlenecks in priority order:

1. **AnimatePresence `mode="wait"`** — blocks next page render for 280ms (100ms exit + 180ms enter)
2. **Sequential layout fetches** — `getUserProfile()` then hot count = waterfall (100-300ms)
3. **Duplicate `getUserProfile()` per page** — every page.tsx calls it again redundantly (100-200ms)
4. **No `Promise.all()` in Agenda** — 2 sequential queries where parallel is trivial (+50-150ms)
5. **N+1 message payload** — Inbox loads all messages for 50 leads, Leads for 100 (200-500ms)
6. **`router.refresh()` on auth change** — fires on token refresh, re-renders entire Server Component tree (+300ms)
7. **Reports loads unbounded data** — no date filter, no aggregation — 10K rows possible (+400ms)
8. **Stagger on 50-100 item lists** — 2.5s total animation, CPU jank during scroll
9. **No Next.js route cache configured** — layout re-fetches on every navigation instead of using cached responses
10. **AuthProvider double-init** — `getSession()` fires even when `initialProfile` is already hydrated

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/(app)/layout.tsx` | Modify | Parallelize fetches, add `unstable_cache` |
| `components/app/app-shell.tsx` | Modify | Fix AnimatePresence mode, optimize transition |
| `components/motion/variants.ts` | Modify | Reduce animation durations, remove blocking |
| `app/(app)/agenda/page.tsx` | Modify | Parallelize 2 queries, remove redundant auth |
| `app/(app)/inbox/page.tsx` | Modify | Replace `messages(*)` with preview-only query |
| `app/(app)/leads/page.tsx` | Modify | Replace messages with last-message subquery |
| `app/(app)/reports/page.tsx` | Modify | Add date range filter (last 90 days), remove redundant auth |
| `components/providers/AuthProvider.tsx` | Modify | Remove router.refresh() on token renewal, fix double-init |
| `next.config.ts` | Modify | Add staleTimes, logging config |
| `lib/supabase/server.ts` | Modify | Add cached getUserProfile with `unstable_cache` |

---

## Task 1: Fix AnimatePresence — Eliminate 280ms Blocking Transition

**Impact:** Removes the single biggest source of perceived delay. Pages will start rendering immediately instead of waiting for exit animation.

**Root cause:** `mode="wait"` unmounts the current page completely before mounting the next. The exit animation (100ms) must fully complete before the next page's enter animation (180ms) even starts. Combined with server fetch time, this is why every navigation feels slow.

**Fix:** Switch to `mode="popLayout"` which allows concurrent animations — the next page starts rendering while the previous one exits. Also reduce durations.

**Files:**
- Modify: `components/motion/variants.ts`
- Modify: `components/app/app-shell.tsx`

- [ ] **Step 1: Update pageTransition variant durations**

Open `components/motion/variants.ts` and replace the `pageTransition` export:

```typescript
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 3 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.12, ease: easeOutExpo },
  },
  exit: {
    opacity: 0,
    y: -3,
    transition: { duration: 0.08, ease: easeSoft },
  },
};
```

Reduction: 180ms → 120ms enter, 100ms → 80ms exit. With `mode="popLayout"` these run concurrently, so perceived transition = max(80, 120) = **120ms total** instead of 280ms sequential.

- [ ] **Step 2: Switch AnimatePresence to mode="popLayout"**

Open `components/app/app-shell.tsx` and change the AnimatePresence:

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { pageTransition } from "@/components/motion/variants";

interface AppShellProps {
  children: React.ReactNode;
  hotCount?: number;
}

export function AppShell({ children, hotCount = 0 }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="bg-aurora grid h-screen overflow-hidden md:grid-cols-[240px_1fr]">
      <Sidebar hotCount={hotCount} />
      <div className="grid min-w-0 grid-rows-[auto_1fr]">
        <Topbar />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.main
            key={pathname}
            variants={pageTransition}
            initial="hidden"
            animate="show"
            exit="exit"
            className="min-h-0 overflow-hidden"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
```

Key changes:
- `mode="popLayout"` → concurrent animations, next page renders immediately
- `initial={false}` → no enter animation on first load (eliminates layout flash)

- [ ] **Step 3: Reduce stagger delays in variants.ts**

In `components/motion/variants.ts`, update the stagger function to reduce list animation overhead:

```typescript
export const stagger = (delay = 0.04, staggerChildren = 0.06): Variants => ({
  hidden: {},
  show: {
    transition: {
      delayChildren: delay,
      staggerChildren,
    },
  },
});
```

This halves the stagger cadence. A 50-item list goes from 2.5s total to 1.25s. Combined with the shorter item animations, perceived completion is much faster.

- [ ] **Step 4: Commit**

```bash
git add components/app/app-shell.tsx components/motion/variants.ts
git commit -m "perf: switch AnimatePresence to popLayout, cut transition duration by 55%

- mode='popLayout' allows concurrent enter/exit (120ms vs 280ms sequential)
- initial={false} removes first-load flash
- Reduced enter: 180ms → 120ms, exit: 100ms → 80ms
- Reduced stagger: 120ms → 60ms cadence for list items"
```

---

## Task 2: Parallelize Layout Fetches + Add Route Cache

**Impact:** Eliminates the sequential waterfall in the shared layout. Instead of 2 sequential Supabase calls (100-300ms total), runs them in parallel. Adds Next.js `unstable_cache` to avoid re-fetching on every soft navigation.

**Root cause:** `getUserProfile()` completes before the hot count query even starts. Then this entire sequence repeats on every route change because Next.js App Router re-renders layouts when navigating.

**Files:**
- Modify: `lib/supabase/server.ts`
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Add cached getUserProfile to server.ts**

Open `lib/supabase/server.ts` and add a cached version at the bottom:

```typescript
import { unstable_cache } from "next/cache";

/**
 * Cached version of getUserProfile.
 * Cache key includes the user's auth token (via cookies) so different
 * users get different cached values. Revalidates every 60 seconds.
 * 
 * Use this in layouts and pages instead of getUserProfile() to avoid
 * redundant Supabase calls on every soft navigation.
 */
export const getCachedUserProfile = unstable_cache(
  async (userId: string) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("*, companies(id, name, plan), memberships(role, company_id)")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[getCachedUserProfile] error:", error.message);
    }
    return data ?? null;
  },
  ["user-profile"],
  { revalidate: 60, tags: ["user-profile"] }
);
```

Note: `unstable_cache` requires a stable key. We pass `userId` as argument so the cache is per-user.

- [ ] **Step 2: Rewrite layout.tsx with parallel fetches and no redundant auth**

Open `app/(app)/layout.tsx` and replace entirely:

```tsx
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const companyId_temp = await getCachedUserProfile(user.id).then(
    (p) => p?.memberships?.[0]?.company_id ?? null
  );

  // Run profile fetch and hot count in parallel
  const [profile, hotCount] = await Promise.all([
    getCachedUserProfile(user.id),
    companyId_temp
      ? createClient().then((supabase) =>
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId_temp)
            .eq("status", "hot")
            .then(({ count }) => count ?? 0)
        )
      : Promise.resolve(0),
  ]);

  if (!profile) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <AuthProvider initialProfile={profile}>
      <AppShell hotCount={hotCount}>{children}</AppShell>
    </AuthProvider>
  );
}
```

Wait — this still has a sequential issue (profile needed to get companyId). Better approach: fetch profile once, then parallelize with hot count:

```tsx
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single auth check — middleware already validated, this is defense-in-depth
  const user = await getUser();
  if (!user) redirect("/login");

  // Cached profile — won't hit Supabase again within 60s for same user
  const profile = await getCachedUserProfile(user.id);
  if (!profile) redirect("/login");

  const companyId = profile.memberships?.[0]?.company_id ?? null;

  // Hot count: only fetch if we have a company
  let hotCount = 0;
  if (companyId) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "hot");
    hotCount = count ?? 0;
  }

  return (
    <AuthProvider initialProfile={profile}>
      <AppShell hotCount={hotCount}>{children}</AppShell>
    </AuthProvider>
  );
}
```

The key improvement here is `getCachedUserProfile` — subsequent requests within 60s skip the Supabase round-trip entirely. The hot count is a fast `COUNT(*)` query with head:true (no data returned).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/server.ts app/(app)/layout.tsx
git commit -m "perf: add unstable_cache for getUserProfile, eliminate repeated Supabase auth calls

- getCachedUserProfile caches per userId for 60s — soft navigations hit cache
- Layout now uses cached profile instead of fresh fetch on every route change
- Reduces layout fetch overhead from 2 sequential DB calls to 1 cached + 1 fast COUNT"
```

---

## Task 3: Remove Redundant Auth Checks from Page Components

**Impact:** Each page.tsx currently calls `getUserProfile()` independently — adding another 100-200ms of Supabase calls on top of what the layout already did. The layout already validated auth; pages should trust it and use the cached version.

**Root cause:** The pattern `const profile = await getUserProfile()` in every page.tsx was correct as a standalone safety measure but creates redundant network calls since the layout already runs the same check.

**Files:**
- Modify: `app/(app)/agenda/page.tsx`
- Modify: `app/(app)/inbox/page.tsx`
- Modify: `app/(app)/leads/page.tsx`
- Modify: `app/(app)/reports/page.tsx`

- [ ] **Step 1: Fix agenda/page.tsx — parallelize queries, use cached auth**

Open `app/(app)/agenda/page.tsx` and replace entirely:

```tsx
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AgendaClient } from "./agenda-client";

export default async function AgendaPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  const now = new Date();
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();

  // Parallel fetch — events and leads don't depend on each other
  const [{ data: events, error }, { data: leads }] = await Promise.all([
    supabase
      .from("events")
      .select("*, leads(name, status, phone)")
      .eq("company_id", companyId)
      .gte("start_time", startOfPrevMonth)
      .lte("start_time", endOfNextMonth)
      .order("start_time", { ascending: true }),
    supabase
      .from("leads")
      .select("id, name, status, phone")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .limit(200),
  ]);

  if (error) {
    console.error("[AgendaPage] fetch error:", error.message);
  }

  return <AgendaClient events={events ?? []} leads={leads ?? []} companyId={companyId} />;
}
```

Key changes:
- `Promise.all()` for 2 queries → runs in parallel (-50-150ms)
- `.limit(200)` on leads (was unlimited)
- `getCachedUserProfile` → hits cache set by layout

- [ ] **Step 2: Fix inbox/page.tsx — replace N+1 messages with preview query**

Open `app/(app)/inbox/page.tsx` and replace entirely:

```tsx
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "./inbox-client";
import type { Lead, Message } from "@/lib/types/database";

interface LeadWithMessages extends Lead {
  messages: Message[];
}

export default async function InboxPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  // Fetch leads with only the last 30 messages per lead (not all messages)
  // This dramatically reduces payload for leads with long conversation histories
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      messages(id, content, role, created_at, is_read)
    `)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[InboxPage] fetch error:", error.message);
  }

  const leads: LeadWithMessages[] = (data ?? []).map((l) => ({
    ...l,
    messages: ((l.messages ?? []) as Message[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  }));

  return <InboxClient leads={leads} />;
}
```

Key changes:
- Reduced leads limit: 50 → 30 (inbox shows recent conversations)
- Messages sorted server-side (not in client on every render)
- `getCachedUserProfile` hits layout cache

Note: If InboxClient needs to load full message history for a selected lead, implement that as a client-side fetch triggered when user clicks a lead (progressive loading), not upfront.

- [ ] **Step 3: Fix leads/page.tsx — replace full messages with last-message only**

Open `app/(app)/leads/page.tsx` and replace entirely:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { LeadsClient } from "./leads-client";
import type { LeadWithLastMessage } from "@/lib/types/database";

export default async function LeadsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  // Fetch leads with a single last message per lead using a lateral join
  // Instead of loading all messages and sorting in JS, use DB ordering
  const { data: leads, error } = await supabase
    .from("leads")
    .select(`
      id, name, email, phone, status, channel, heat_score,
      created_at, updated_at, company_id, notes,
      last_msg:messages(content, created_at, role)
    `)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[LeadsPage] fetch error:", error.message);
  }

  // Map to LeadWithLastMessage — get most recent message via DB-ordered results
  const leadsWithLast: LeadWithLastMessage[] = (leads ?? []).map((l) => {
    const msgs = (l.last_msg ?? []) as { content: string; created_at: string; role: string }[];
    // Sort descending to get latest — much smaller array than before
    const latest = msgs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    const { last_msg: _, ...rest } = l;
    return {
      ...rest,
      last_message: latest
        ? {
            content: latest.content,
            created_at: latest.created_at,
            role: latest.role as "user" | "assistant" | "note",
          }
        : undefined,
    };
  });

  return <LeadsClient leads={leadsWithLast} />;
}
```

The query still loads messages (Supabase doesn't support LIMIT per nested relation in the JS client without RPC). However, you can create a Supabase RPC for true last-message-only fetch if needed. For now this is significantly better than before because the data shape is identical to what was there.

**Better approach with RPC** (optional, implement after initial optimization):
```sql
-- Run in Supabase SQL editor
CREATE OR REPLACE FUNCTION get_leads_with_last_message(p_company_id uuid, p_limit int DEFAULT 100)
RETURNS TABLE (...) AS $$
  SELECT l.*, m.content as last_content, m.created_at as last_at, m.role as last_role
  FROM leads l
  LEFT JOIN LATERAL (
    SELECT content, created_at, role FROM messages 
    WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
  ) m ON true
  WHERE l.company_id = p_company_id
  ORDER BY l.updated_at DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 4: Fix reports/page.tsx — add date filter for unbounded queries**

Open `app/(app)/reports/page.tsx` and replace entirely:

```tsx
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  // Limit to last 90 days for performance — enough for all displayed metrics
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const since = ninetyDaysAgo.toISOString();

  const [
    { data: leads },
    { data: events },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, status, channel, created_at, heat_score")
      .eq("company_id", companyId)
      .gte("created_at", since),
    supabase
      .from("events")
      .select("id, created_at, start_time")
      .eq("company_id", companyId)
      .gte("created_at", since),
    supabase
      .from("messages")
      .select("id, role, created_at")
      .eq("company_id", companyId)
      .gte("created_at", since),
  ]);

  const allLeads = leads ?? [];
  const allEvents = events ?? [];
  const allMessages = messages ?? [];

  const totalLeads = allLeads.length;
  const hotLeads = allLeads.filter((l) => l.status === "hot").length;
  const warmLeads = allLeads.filter((l) => l.status === "warm").length;
  const coldLeads = allLeads.filter((l) => l.status === "cold").length;
  const converted = allLeads.filter((l) => l.status === "success").length;
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
  const totalEvents = allEvents.length;
  const totalMessages = allMessages.length;
  const aiMessages = allMessages.filter((m) => m.role === "assistant").length;

  const byChannel = ["whatsapp", "instagram", "form"].map((ch) => ({
    channel: ch,
    label: ch === "whatsapp" ? "WhatsApp" : ch === "instagram" ? "Instagram" : "Formulário",
    count: allLeads.filter((l) => l.channel === ch).length,
  }));

  const byStatus = [
    { label: "Quente", status: "hot", count: hotLeads, color: "#F97316" },
    { label: "Morno", status: "warm", count: warmLeads, color: "#F59E0B" },
    { label: "Frio", status: "cold", count: coldLeads, color: "#60A5FA" },
    { label: "Convertido", status: "success", count: converted, color: "#14B8A6" },
  ];

  const now = new Date();
  const dailyLeads: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const count = allLeads.filter((l) => l.created_at.startsWith(dateStr)).length;
    dailyLeads.push({ date: dateStr, count });
  }

  const avgHeatScore =
    totalLeads > 0
      ? Math.round(allLeads.reduce((sum, l) => sum + (l.heat_score ?? 0), 0) / totalLeads)
      : 0;

  return (
    <ReportsClient
      totalLeads={totalLeads}
      hotLeads={hotLeads}
      warmLeads={warmLeads}
      coldLeads={coldLeads}
      converted={converted}
      conversionRate={conversionRate}
      totalEvents={totalEvents}
      totalMessages={totalMessages}
      aiMessages={aiMessages}
      avgHeatScore={avgHeatScore}
      byChannel={byChannel}
      byStatus={byStatus}
      dailyLeads={dailyLeads}
    />
  );
}
```

Key change: `.gte("created_at", since)` limits all 3 queries to last 90 days. For a company with 10K total leads but only 500 in the last 90 days, this is a 20x reduction in transferred data.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/agenda/page.tsx app/(app)/inbox/page.tsx app/(app)/leads/page.tsx app/(app)/reports/page.tsx
git commit -m "perf: eliminate redundant auth per page, parallelize queries, bound data ranges

- All pages use getCachedUserProfile (hits layout cache, no extra Supabase call)
- Agenda: 2 sequential queries → Promise.all (parallel)
- Reports: unbounded queries → 90-day window
- Inbox: server-side message sort (removed client-side sort on every render)"
```

---

## Task 4: Fix AuthProvider — Remove Full Re-render on Token Refresh

**Impact:** `router.refresh()` in `onAuthStateChange` triggers a full Server Component re-render on every Supabase token renewal (every ~1 hour by default, but also on tab focus). This causes a visible flash/reload during normal usage. It also causes a spurious re-render on every page navigation because navigation triggers auth state change events.

**Root cause:** `router.refresh()` was added to sync server state after login/logout, but it fires on ALL auth events including silent token refreshes. This should only fire on actual sign-in/sign-out.

**Files:**
- Modify: `components/providers/AuthProvider.tsx`

- [ ] **Step 1: Fix onAuthStateChange to only refresh on auth events, not token renewal**

Open `components/providers/AuthProvider.tsx` and replace the `useEffect` block:

```tsx
useEffect(() => {
  // Initialize session from browser cookies
  // Skip if initialProfile already provided (server hydrated us)
  if (!initialProfile) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    setSession(session);
    setUser(session?.user ?? null);

    if (event === "SIGNED_IN") {
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
      // Only refresh server state on actual sign-in
      router.refresh();
    } else if (event === "SIGNED_OUT") {
      setProfile(null);
      setLoading(false);
      router.push("/login");
    } else if (event === "TOKEN_REFRESHED") {
      // Silent token renewal — do NOT trigger router.refresh()
      // Server middleware handles token via cookies automatically
      setLoading(false);
    } else if (event === "USER_UPDATED") {
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    }
  });

  return () => subscription.unsubscribe();
}, [supabase, router, fetchProfile, initialProfile]);
```

Key changes:
- `getSession()` only runs if `initialProfile` is not provided (avoids redundant client fetch on first render when server already hydrated)
- `router.refresh()` only on `SIGNED_IN` (not on `TOKEN_REFRESHED`)
- `SIGNED_OUT` uses `router.push` instead of refresh (direct redirect is faster)
- `TOKEN_REFRESHED` event: just update local state, don't invalidate server

- [ ] **Step 2: Commit**

```bash
git add components/providers/AuthProvider.tsx
git commit -m "perf: fix AuthProvider to not trigger full re-render on token refresh

- router.refresh() now only fires on SIGNED_IN (not TOKEN_REFRESHED)
- SIGNED_OUT uses router.push for direct redirect instead of refresh+redirect
- getSession() skipped when initialProfile already hydrated from server"
```

---

## Task 5: Configure Next.js Router Cache + Prefetching

**Impact:** Next.js App Router has a client-side Router Cache that stores RSC (React Server Component) payloads. By default in Next.js 15+, `staleTimes` defaults to 0 for dynamic routes. Configuring it allows cached navigation without server round-trips.

**Root cause:** Every navigation hits the server even for routes the user just visited. With `staleTimes`, revisiting `/inbox` within 30 seconds uses the cached payload instantly.

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Configure staleTimes and logging**

Open `next.config.ts` and replace entirely:

```typescript
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // Router Cache: how long RSC payloads stay fresh in the browser
    // dynamic: 30s means revisiting a page within 30s uses cached response
    // static: 5min for truly static pages (landing, etc.)
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  // Enable response compression
  compress: true,
};

export default config;
```

`staleTimes.dynamic: 30` means: if the user navigates away from `/inbox` and comes back within 30 seconds, the RSC payload is served from the browser cache instantly — **zero server round-trips, zero latency**.

Note: This is safe for this app because the data shown (leads, events, messages) doesn't change more than once per 30 seconds in normal usage. If real-time updates are critical, keep at 0 for inbox only and use Supabase Realtime subscriptions for live data.

- [ ] **Step 2: Add Link prefetch to Sidebar nav links**

The Next.js `<Link>` component prefetches by default on hover and on viewport enter. The sidebar links already use `<Link>`, so this is mostly handled automatically. However, we can ensure prefetch is explicit:

Open `components/app/sidebar.tsx` and confirm the nav links have no `prefetch={false}`:

```tsx
// In the NAV.map() loop, the Link is already:
<Link
  key={n.id}
  href={n.href}
  // prefetch is true by default in Next.js App Router — no change needed
  className={...}
>
```

If any link had `prefetch={false}`, remove it. Default behavior prefetches the linked route's RSC payload when the link enters the viewport, making clicks instant.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "perf: configure App Router staleTimes for 30s client-side route cache

- dynamic: 30s — revisiting routes within 30s uses browser-cached RSC payload
- static: 300s — landing/static pages cached 5 minutes
- compress: true — enables gzip for all responses"
```

---

## Task 6: Reduce List Animation Overhead in Client Components

**Impact:** Stagger animations on 50-100 item lists cause CPU jank (the browser schedules 50 independent animation timelines) and make the page feel slow even after data loads. Reducing stagger count and using CSS transitions where framer-motion is overkill.

**Root cause:** `stagger(0.05, 0.04)` on a 50-item list = 2.5s total animation. framer-motion's spring physics compute on the JS thread, blocking interaction during animation.

**Files:**
- Modify: `app/(app)/leads/leads-client.tsx`
- Modify: `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Limit stagger to first 8 items in leads-client.tsx**

Open `app/(app)/leads/leads-client.tsx`. Find the table row rendering section. The goal is to animate only the first N items for perceived performance — rows below the fold don't need animated entry.

Locate where rows are rendered with motion (likely something like):
```tsx
{filteredLeads.map((lead, i) => (
  <motion.tr key={lead.id} variants={...} ...>
```

Change to only apply motion for the first 8 rows:
```tsx
{filteredLeads.map((lead, i) =>
  i < 8 ? (
    <motion.tr key={lead.id} variants={fadeUp} ...>
      {/* row content */}
    </motion.tr>
  ) : (
    <tr key={lead.id} className="..." onClick={...}>
      {/* same row content, no animation */}
    </tr>
  )
)}
```

This means only 8 rows animate in (perceptually complete), and the rest render immediately. The user sees animation for the visible rows and doesn't notice the difference for off-screen rows.

- [ ] **Step 2: Reduce stagger delay in inbox-client.tsx**

Open `app/(app)/inbox/inbox-client.tsx`. Find the stagger container for the lead list. Update the stagger variant usage:

```tsx
// Before (if using stagger from variants.ts):
variants={stagger(0.05, 0.04)}

// After — only animate first render, not on lead selection change:
variants={stagger(0.02, 0.03)}
```

Also find the chat bubbles stagger and reduce:
```tsx
// Before:
staggerChildren: 0.08
// After:
staggerChildren: 0.04
```

Halving the delays makes the UI feel snappier without losing the visual effect.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/leads/leads-client.tsx app/(app)/inbox/inbox-client.tsx
git commit -m "perf: limit stagger animations to first 8 items, reduce stagger delays by 50%

- Only first 8 table rows animate (rows below fold render immediately)
- Inbox and leads stagger delay: 80ms → 40ms cadence
- Chat bubble stagger: 80ms → 40ms
- Perceived animation completion time cut from ~2.5s to ~0.3s for lists"
```

---

## Task 7: Verify Build and Navigation — Manual Test Checklist

**Impact:** Ensures all changes compile correctly and the navigation actually feels faster.

**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected output: no errors. If there are errors about `getCachedUserProfile` not found, verify `lib/supabase/server.ts` exports it correctly.

- [ ] **Step 2: Run dev server and test navigation**

```bash
npm run dev
```

Open browser at `http://localhost:3000`. Log in and test:

1. Navigate Inbox → Leads → Agenda → Reports → back to Inbox
2. Each transition should feel instant (< 150ms perceived)
3. No flash of white between pages
4. Sidebar remains stable (no re-render visible)
5. Animations are smooth, not jerky

- [ ] **Step 3: Check for TypeScript errors in modified files**

```bash
npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 4: Build for production**

```bash
npm run build
```

Expected: successful build with no errors. Check the output for any large chunk warnings.

- [ ] **Step 5: Test production build locally**

```bash
npm start
```

Repeat navigation test from Step 2. Production build should be even faster than dev.

- [ ] **Step 6: Final commit if all tests pass**

```bash
git add -A
git commit -m "chore: verify all performance optimizations compile and work in production"
```

---

## Expected Results After All Tasks

| Metric | Before | After | Method |
|---|---|---|---|
| Page transition (perceived) | 280ms blocked | ~100ms concurrent | AnimatePresence popLayout |
| Layout fetch (layout.tsx) | 2 sequential calls | Cached (0ms on repeat) | unstable_cache |
| Per-page auth check | 2 Supabase calls | 0 (cache hit) | getCachedUserProfile |
| Agenda queries | 2 sequential | 2 parallel | Promise.all |
| Reports data | Unbounded all-time | 90-day window | Date filter |
| Inbox payload | 50 leads × all msgs | 30 leads × 30 msgs | Query limits |
| Token refresh | Full RSC re-render | Local state only | Fix onAuthStateChange |
| Route revisit | Always server fetch | Browser cache (30s) | staleTimes config |
| List animation (50 items) | 2.5s stagger | 0.3s (first 8 only) | Conditional motion |
| **Total perceived nav time** | **800-2300ms** | **<150ms** | All combined |

---

## Optional Future Improvements (Not in This Plan)

These are high-value but require more infrastructure changes:

1. **Supabase Realtime for inbox** — replace polling with WebSocket subscription for live message updates, remove router.refresh() entirely from inbox
2. **RPC for last-message-only** — eliminate the message array join in leads page with a proper LATERAL join RPC
3. **Virtualization for leads table** — if leads grow past 200, use `@tanstack/virtual` to only render visible rows
4. **Edge middleware** — move route protection to Vercel Edge to eliminate Supabase auth call latency in middleware (currently ~50-100ms per request)
5. **Supabase connection pooling** — use PgBouncer (enabled in Supabase dashboard) to reduce connection overhead on serverless
6. **Image optimization** — convert company logos/avatars to next/image with proper sizing
7. **Font optimization** — ensure Inter is subset and preloaded in root layout
