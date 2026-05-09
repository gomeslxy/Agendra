"use client";

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

  const displayName = profile?.full_name ?? profile?.email?.split("@")[0] ?? "Usuário";
  const companyName = profile?.companies?.name ?? "Minha empresa";
  const plan = profile?.companies?.plan ?? "trial";
  const initials = getInitials(displayName);

  const planLabel: Record<string, string> = {
    trial: "Trial · 14 dias",
    starter: "Plano Starter",
    pro: "Plano Pro",
    enterprise: "Enterprise",
  };

  return (
    <aside
      className="hidden h-screen flex-col gap-4 border-r border-white/[0.08] bg-[rgba(11,18,34,0.55)] p-4 backdrop-blur-xl md:flex"
    >
      <Link href="/inbox" className="flex items-center gap-2.5 px-2 py-1.5">
        <Image src="/assets/agendra-logo.svg" alt="Agendra" width={104} height={26} priority />
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
      <div className="mt-auto rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
        {loading ? (
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
                  {planLabel[plan] ?? plan}
                </div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Link href="/settings#billing" className="flex-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                >
                  <IconZap size={13} />
                  Upgrade
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                aria-label="Sair"
                onClick={signOut}
                title="Sair"
              >
                <IconLogout size={14} style={{ color: "var(--color-fg-3)" }} />
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
