"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Plus, Search, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";
import { NotificationBell } from "@/components/app/notification-bell";
import { getInitials } from "@/lib/utils";
import { calculateTrialStatus, calculateTrialProgress } from "@/lib/billing/plans";

const PLAN_LABEL: Record<string, string> = {
  trial: "Teste Grátis",
  free: "Teste Grátis",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

interface TopbarProps {
  cta?: { label: string; href?: string };
}

export function Topbar({ cta }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, signOut, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onLeadsPage = pathname.startsWith("/leads");

  const displayName = profile?.full_name ?? profile?.email?.split("@")[0] ?? "Usuário";
  const companyName = profile?.companies?.name ?? "Minha empresa";
  const planType = profile?.companies?.plan_type ?? "trial";
  const displayPlan = PLAN_LABEL[planType] ?? "Teste Grátis";
  const initials = getInitials(displayName);
  const { remaining, elapsed } = calculateTrialStatus(profile?.companies?.created_at);
  const trialProgress = calculateTrialProgress(elapsed);
  const isTrial = planType === "trial" || planType === "free";

  // Reset search when leaving /leads
  useEffect(() => {
    if (!onLeadsPage) setQuery("");
  }, [onLeadsPage]);

  // Live search ONLY while user is on /leads.
  useEffect(() => {
    if (!onLeadsPage) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    debounceRef.current = setTimeout(() => {
      const target = trimmed ? `/leads?q=${encodeURIComponent(trimmed)}` : "/leads";
      router.replace(target);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, router, onLeadsPage]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const trimmed = query.trim();
    const target = trimmed ? `/leads?q=${encodeURIComponent(trimmed)}` : "/leads";
    router.push(target);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-3 border-b border-[#E4E4E7] bg-white px-4 py-2.5 md:gap-4 md:px-6 md:py-3"
      >
        {/* Mobile: logo */}
        <Link href="/inbox" className="flex-shrink-0 md:hidden">
          <Image src="/assets/agendra-logo.svg" alt="Agendra" width={88} height={22} priority />
        </Link>

        {/* Desktop: search bar */}
        <div className="relative hidden max-w-[420px] flex-1 md:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
          <input
            placeholder="Buscar leads, conversas, agendamentos…"
            className="w-full h-[34px] bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg pl-9 pr-8 text-[13px] text-[#09090B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#3F3F46]"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Notification Bell */}
          {loading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-[#F4F4F5]" />
          ) : profile?.id ? (
            <NotificationBell userId={profile.id} />
          ) : null}

          {/* Novo fluxo — desktop only */}
          <Link href={cta?.href ?? "/settings#flows"} className="hidden md:block">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              {cta?.label || "Novo fluxo"}
            </Button>
          </Link>

          {/* Mobile: profile avatar */}
          <button
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-bold text-[#2563EB] md:hidden"
            onClick={() => setShowProfile(true)}
            aria-label="Abrir perfil"
          >
            {loading ? "…" : initials}
          </button>
        </div>
      </motion.div>

      {/* Profile bottom sheet — mobile only */}
      <AnimatePresence>
        {showProfile && (
          <>
            <motion.div
              key="profile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/30 md:hidden"
              onClick={() => setShowProfile(false)}
            />
            <motion.div
              key="profile-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed bottom-0 left-0 right-0 z-[61] md:hidden rounded-t-3xl border-t border-[#E4E4E7] bg-white p-6 shadow-[0_-8px_32px_rgba(0,0,0,0.10)]"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              {/* Handle */}
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#E4E4E7]" />

              {loading ? (
                <div className="h-24 animate-pulse rounded-xl bg-[#F4F4F5]" />
              ) : (
                <>
                  {/* User info */}
                  <div className="mb-5 flex items-center gap-3">
                    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-sm font-bold text-[#2563EB]">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#09090B]">{displayName}</div>
                      <div className="truncate text-[12px] text-[#71717A]">{companyName}</div>
                      <div className="font-mono text-[11px] text-[#71717A]">{displayPlan}</div>
                    </div>
                  </div>

                  {/* Trial bar */}
                  {isTrial && (
                    <div className="mb-5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium">
                        <span className="text-[#71717A]">Trial em progresso</span>
                        <span className="text-[#2563EB]">{remaining} dias restantes</span>
                      </div>
                      <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#E4E4E7]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${trialProgress}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full bg-[#2563EB]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-3">
                    {planType !== "business" && (
                      <Link href="/planos" className="w-full" onClick={() => setShowProfile(false)}>
                        <Button
                          variant="orange"
                          size="sm"
                          className="w-full justify-center text-[11px] h-10 rounded-xl"
                          id="mobile-profile-upgrade-btn"
                        >
                          <Zap size={13} />
                          Upgrade para Pro
                        </Button>
                      </Link>
                    )}
                    <div className="h-px bg-[#E4E4E7]" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center gap-2 text-[12px] font-semibold h-10 rounded-xl
                        text-[#DC2626] hover:text-[#B91C1C]
                        bg-[#FEF2F2] border border-[#FECACA]
                        hover:bg-[#FEE2E2] hover:border-[#FCA5A5]
                        transition-all duration-150"
                      id="mobile-profile-logout-btn"
                      aria-label="Sair da conta"
                      onClick={async () => {
                        setShowProfile(false);
                        await signOut();
                      }}
                    >
                      <LogOut size={15} />
                      Sair da conta
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
