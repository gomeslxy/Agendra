"use client";

import { Suspense } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { MobileNav } from "@/components/app/mobile-nav";

interface AppShellProps {
  children: React.ReactNode;
  hotCount?: number;
}

function SidebarFallback() {
  return (
    <aside className="hidden h-screen flex-col gap-4 border-r border-white/[0.08] bg-[rgba(11,18,34,0.55)] p-4 md:flex">
      <div className="h-7 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-white/[0.04]" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </aside>
  );
}

// Page transitions live in `app/(app)/template.tsx` so each route segment
// re-mounts cleanly without an AnimatePresence "exit" gate that blocked
// new content from appearing.
// Suspense around Sidebar: it uses useSearchParams (Next 15+ requirement).
export function AppShell({ children, hotCount = 0 }: AppShellProps) {
  return (
    <>
      <div className="bg-aurora grid h-screen overflow-hidden md:grid-cols-[240px_1fr]">
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar hotCount={hotCount} />
        </Suspense>
        <div className="grid min-w-0 grid-rows-[auto_1fr]">
          <Topbar />
          <main className="relative min-h-0 overflow-hidden">{children}</main>
        </div>
      </div>
      <MobileNav />
    </>
  );
}
