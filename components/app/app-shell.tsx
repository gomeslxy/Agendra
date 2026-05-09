"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { MobileNav } from "@/components/app/mobile-nav";
import { pageTransition } from "@/components/motion/variants";

interface AppShellProps {
  children: React.ReactNode;
  hotCount?: number;
}

export function AppShell({ children, hotCount = 0 }: AppShellProps) {
  const pathname = usePathname();

  return (
    <>
      <div className="bg-aurora grid h-screen overflow-hidden md:grid-cols-[240px_1fr]">
        <Sidebar hotCount={hotCount} />
        <div className="grid min-w-0 grid-rows-[auto_1fr]">
          <Topbar />
          <div className="relative min-h-0 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.main
                key={pathname}
                variants={pageTransition}
                initial="hidden"
                animate="show"
                exit="exit"
                className="absolute inset-0 overflow-hidden"
              >
                {children}
              </motion.main>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <MobileNav />
    </>
  );
}
