"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { IconLogout, IconZap } from "@/components/icons";
import { NAV } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { getInitials, cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { calculateTrialStatus, calculateTrialProgress } from "@/lib/billing/plans";

function isActive(href: string, pathname: string, searchParams: URLSearchParams) {
  try {
    const url = new URL(href, "http://x");
    if (url.pathname !== pathname) return false;
    const tab = url.searchParams.get("tab");
    if (tab) return searchParams.get("tab") === tab;
    return !searchParams.get("tab");
  } catch {
    return false;
  }
}

export function Sidebar({ hotCount = 0 }: { hotCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, signOut, loading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const displayName = profile?.full_name ?? profile?.email?.split("@")[0] ?? "Usuário";
  const companyName = profile?.companies?.name ?? "Minha empresa";
  const planType = profile?.companies?.plan_type ?? "trial";
  const initials = getInitials(displayName);

  const planLabel: Record<string, string> = {
    trial: "Teste Grátis",
    free: "Teste Grátis",
    starter: "Starter",
    pro: "Pro",
    business: "Business",
  };

  const displayPlan = planLabel[planType] ?? "Teste Grátis";

  return (
    <aside
      key="sidebar"
      className="glass hidden h-screen flex-col gap-4 !rounded-none !border-y-0 !border-l-0 border-r border-white/[0.08] bg-[rgba(11,18,34,0.35)] p-4 md:flex shadow-2xl z-20"
    >
      <Link href="/inbox" className="flex items-center gap-2 px-2 py-1.5 shrink-0 select-none">
        <Image src="/assets/agendra-logo.svg" alt="Agendra" width={96} height={24} priority />
        <span className="relative flex h-1.5 w-1.5" title="AI ACTIVE">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-teal-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-teal-500" />
        </span>
      </Link>

      <nav className="relative flex flex-col gap-0.5">
        {NAV.map((n, idx) =>
          n.kind === "section" ? (
            <div
              key={`s-${idx}`}
              className="mt-2 px-2.5 pt-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "var(--color-fg-3)" }}
            >
              {n.label}
            </div>
          ) : (
            (() => {
              const active = isActive(n.href, pathname, searchParams);
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => trackEvent("nav_click", { target: n.id })}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-colors duration-150",
                    active ? "text-white" : "border border-transparent hover:bg-white/[0.04] hover:text-white",
                  )}
                  style={active ? undefined : { color: "var(--color-fg-2)" }}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/14"
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
              );
            })()
          ),
        )}
      </nav>

      {/* User card */}
      <div className="mt-auto rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 transition-all duration-200 hover:bg-white/[0.03] hover:border-white/[0.08] relative overflow-hidden group/user z-10 shrink-0">
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#2563EB]/10 to-transparent transition-opacity duration-300 group-hover/user:via-[#2563EB]/30 pointer-events-none" />
        {!mounted || loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
        ) : (
          <>
            <div className="mb-2.5 flex items-center gap-2.5">
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#14B8A6] text-xs font-bold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{displayName}</div>
                <div
                  className="truncate font-mono text-[10px]"
                  style={{ color: "var(--color-fg-3)" }}
                >
                  {companyName}
                </div>
                <div
                  className="font-mono text-[10px]"
                  style={{ color: "var(--color-fg-3)" }}
                >
                  {displayPlan}
                </div>
              </div>
            </div>
            {(planType === "trial" || planType === "free") && (
              <div className="mb-3 space-y-1 px-0.5">
                <div className="flex items-center justify-between text-[10px] font-medium text-white/40">
                  <span>Trial ativo</span>
                  <span className="font-mono text-[9px] text-brand-blue-400">
                    {(() => {
                      const { remaining } = calculateTrialStatus(profile?.companies?.created_at);
                      return `${remaining}d restantes`;
                    })()}
                  </span>
                </div>
                <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ 
                      width: (() => {
                        const { elapsed } = calculateTrialStatus(profile?.companies?.created_at);
                        return `${calculateTrialProgress(elapsed)}%`;
                      })()
                    }}
                    transition={{ duration: 1 }}
                    className="h-full bg-brand-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-1.5">
              {planType !== "business" && (
                <Link href="/planos" className="flex-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border-white/[0.08] text-[11px] h-7 rounded-lg transition-all duration-200"
                  >
                    <IconZap size={11} />
                    {planType === "trial" ? "Assinar" : "Upgrade"}
                  </Button>
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="px-2 h-7 rounded-lg hover:bg-white/[0.04]"
                aria-label="Sair"
                onClick={signOut}
                title="Sair"
              >
                <IconLogout size={13} style={{ color: "var(--color-fg-3)" }} />
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
