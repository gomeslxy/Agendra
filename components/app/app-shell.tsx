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
    <aside className="hidden h-screen flex-col gap-4 border-r border-white/[0.08] bg-[rgba(11,18,34,0.55)] p-4 md:flex">
      <div className="h-7 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="flex flex-col gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-white/[0.04]" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="mt-auto h-16 w-full animate-pulse rounded-xl bg-white/[0.04]" />
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
      <div className="bg-aurora grid h-screen overflow-hidden md:grid-cols-[240px_1fr]">
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
                    href="/settings"
                    className="flex items-center gap-3 bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 hover:bg-red-500/15 transition-colors group"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <span className="text-[12px] font-bold text-red-200">Atenção Necessária</span>
                      <span className="text-[11px] text-red-300/70">
                        {unhealthyChannelsCount === 1 
                          ? "Um canal de WhatsApp está desconectado ou com erro." 
                          : `${unhealthyChannelsCount} canais de WhatsApp estão com problemas de conexão.`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-red-400 group-hover:text-red-300 transition-colors">
                      Resolver Agora
                      <ChevronRight size={14} />
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
