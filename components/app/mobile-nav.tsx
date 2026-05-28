"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, Calendar, Inbox, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

const MOBILE_NAV = [
  { id: "inbox",    label: "Inbox",      icon: Inbox,    href: "/inbox" },
  { id: "agenda",   label: "Agenda",     icon: Calendar, href: "/agenda" },
  { id: "leads",    label: "Leads",      icon: Users,    href: "/leads" },
  { id: "reports",  label: "Relatórios", icon: BarChart3, href: "/reports" },
  { id: "settings", label: "Config",     icon: Settings, href: "/settings" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-[#E4E4E7]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {MOBILE_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <motion.div
              key={item.id}
              className="flex flex-1"
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <Link
                href={item.href}
                onClick={() => trackEvent("nav_click", { target: item.id })}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 px-2 py-3 text-[10px] font-medium transition-colors",
                  active ? "text-[#2563EB]" : "text-[#A1A1AA]",
                )}
              >
                <div className="relative">
                  <item.icon
                    size={20}
                    className={cn(
                      "transition-colors duration-150",
                      active ? "text-[#2563EB]" : "text-[#A1A1AA]",
                    )}
                  />
                  {active && (
                    <motion.span
                      layoutId="mobile-nav-dot"
                      className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-[#2563EB]"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    />
                  )}
                </div>
                {item.label}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </nav>
  );
}
