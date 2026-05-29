"use client";

import { Suspense } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { MobileNav } from "@/components/app/mobile-nav";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface AppShellProps {
  children: React.ReactNode;
  hotCount?: number;
  unhealthyChannelsCount?: number;
}

function SidebarFallback() {
  return (
    <aside
      key="sidebar-fallback"
      className="hidden h-screen flex-col gap-4 border-r border-[#E4E4E7] bg-[#F4F4F5] p-4 md:flex z-20"
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

export function AppShell({ 
  children, 
  hotCount = 0,
  unhealthyChannelsCount = 0 
}: AppShellProps) {
  return (
    <>
      <div className="bg-[#F4F4F5] grid overflow-hidden md:grid-cols-[240px_1fr] h-[calc(100dvh-3.5rem)] md:h-screen">
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar hotCount={hotCount} />
        </Suspense>
        <div className="grid min-w-0 grid-rows-[auto_1fr]">
          <Topbar />
          <main className="relative min-h-0 overflow-hidden flex flex-col">
            <AnimatePresence>
              {unhealthyChannelsCount > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex-1 overflow-hidden relative">
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileNav />
    </>
  );
}
