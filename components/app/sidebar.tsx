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
      className="hidden h-screen flex-col gap-4 border-r border-[#E4E4E7] bg-[#FAFAFA] p-4 md:flex z-20"
    >
      <Link href="/inbox" className="flex items-center gap-2 px-2 py-1.5 shrink-0 select-none">
        <Image src="/assets/agendra-logo.svg" alt="Agendra" width={96} height={24} priority />
        <span className="relative flex h-1.5 w-1.5" title="AI ACTIVE">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#14B8A6] animate-pulse" />
        </span>
      </Link>

      <nav className="relative flex flex-col gap-0.5">
        {NAV.map((n, idx) =>
          n.kind === "section" ? (
            <div
              key={`s-${idx}`}
              className="mt-2 px-2.5 pt-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71717A]"
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
                    active
                      ? "text-[#1D4ED8] font-semibold"
                      : "text-[#71717A] border border-transparent hover:bg-[#F4F4F5] hover:text-[#3F3F46]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]"
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
      <div className="mt-auto rounded-xl border border-[#E4E4E7] bg-white p-3 shadow-sm transition-all duration-200 hover:bg-[#F4F4F5] relative overflow-hidden group/user z-10 shrink-0">
        {!mounted || loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-[#F4F4F5]" />
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2.5">
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-bold text-[#2563EB]">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[#09090B]">{displayName}</div>
                <div className="truncate font-mono text-[10px] text-[#71717A]">
                  {companyName} · {displayPlan}
                </div>
              </div>
            </div>
            {(planType === "trial" || planType === "free") && (
              <div className="mb-2.5 space-y-1 px-0.5">
                <div className="flex items-center justify-between text-[9px] font-medium">
                  <span className="text-[#71717A]">Trial ativo</span>
                  <span className="font-mono text-[9px] text-[#71717A]">
                    {(() => {
                      const { remaining } = calculateTrialStatus(profile?.companies?.created_at);
                      return `${remaining}d restantes`;
                    })()}
                  </span>
                </div>
                <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#E4E4E7]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: (() => {
                        const { elapsed } = calculateTrialStatus(profile?.companies?.created_at);
                        return `${calculateTrialProgress(elapsed)}%`;
                      })()
                    }}
                    transition={{ duration: 1 }}
                    className="h-full bg-[#2563EB]"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {planType !== "business" && (
                <Link href="/planos">
                  <Button
                    variant="orange"
                    size="sm"
                    className="w-full justify-center text-[10px] h-7 rounded-lg"
                  >
                    <IconZap size={10} />
                    {planType === "trial" ? "Assinar" : "Upgrade"}
                  </Button>
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 px-2.5 h-8 rounded-lg text-[11px] font-semibold
                  text-[#DC2626] hover:text-[#B91C1C]
                  bg-[#FEF2F2] border border-[#FECACA]
                  hover:bg-[#FEE2E2] hover:border-[#FCA5A5]
                  transition-all duration-150"
                onClick={signOut}
                id="sidebar-logout-btn"
                aria-label="Sair da conta"
              >
                <IconLogout size={14} />
                Sair da conta
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
