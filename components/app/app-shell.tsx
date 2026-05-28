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
      className="glass hidden h-screen flex-col gap-4 !rounded-none !border-y-0 !border-l-0 border-r border-white/[0.08] bg-[rgba(11,18,34,0.35)] p-4 md:flex shadow-2xl z-20"
    >
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
      <div className="bg-aurora grid overflow-hidden md:grid-cols-[240px_1fr] h-[calc(100dvh-3.5rem)] md:h-screen">
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
                    className="flex items-center gap-3 bg-red-500/[0.06] backdrop-blur-md border-b border-red-500/15 px-6 py-2.5 hover:bg-red-500/[0.10] transition-colors group relative overflow-hidden"
                  >
                    {/* Glowing highlight strip */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
                    
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 ring-1 ring-red-500/30 animate-pulse">
                      <AlertTriangle size={12} />
                    </div>
                    <div className="flex flex-1 flex-col min-w-0">
                      <span className="text-[12px] font-bold text-red-200">Atenção Necessária</span>
                      <span className="text-[11px] text-red-300/70 truncate">
                        {unhealthyChannelsCount === 1 
                          ? "Um canal de WhatsApp está desconectado ou com erro de conexão." 
                          : `${unhealthyChannelsCount} canais de WhatsApp estão com problemas de conexão.`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-red-400 group-hover:text-red-300 transition-colors shrink-0">
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
