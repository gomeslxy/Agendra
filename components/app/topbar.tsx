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
  const displayPlan = PLAN_LABEL[planType] ?? (profile?.companies?.plan ?? "Teste Grátis");
  const initials = getInitials(displayName);
  const { remaining, elapsed } = calculateTrialStatus(profile?.companies?.created_at);
  const trialProgress = calculateTrialProgress(elapsed);
  const isTrial = planType === "trial" || planType === "free";

  // Reset search when leaving /leads
  useEffect(() => {
    if (!onLeadsPage) setQuery("");
  }, [onLeadsPage]);

  // Live search ONLY while user is on /leads.
  // On other pages, typing must not yank the user away — they push on Enter.
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

  // Enter to submit search from any page
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
        className="flex items-center gap-3 border-b border-white/[0.08] bg-[rgba(11,18,34,0.55)] px-4 py-3 md:gap-4 md:px-6 md:py-3.5 backdrop-blur-xl"
      >
        {/* Mobile: logo */}
        <Link href="/inbox" className="flex-shrink-0 md:hidden">
          <Image src="/assets/agendra-logo.svg" alt="Agendra" width={88} height={22} priority />
        </Link>

        {/* Desktop: search bar */}
        <div className="relative hidden max-w-[420px] flex-1 md:block">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-fg-3)" }}
          />
          <input
            placeholder="Buscar leads, conversas, agendamentos…"
            className="input !rounded-xl !py-2 !pl-9 !pr-8 !text-[13px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-fg-3)" }}
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* IA status badge — desktop only */}
          <div className="hidden items-center gap-1.5 rounded-full border border-[#14B8A6]/30 bg-[#14B8A6]/10 px-2.5 py-1 text-xs font-semibold text-brand-teal-300 md:flex">
            <span className="relative flex h-1.5 w-1.5">
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full bg-brand-teal-400"
                animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-teal-400" />
            </span>
            IA ativa
          </div>

          {/* Notification Bell */}
          {profile?.id && <NotificationBell userId={profile.id} />}

          {/* Novo fluxo — desktop only */}
          <Link href={cta?.href ?? "/settings#flows"} className="hidden md:block">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              {cta?.label || "Novo fluxo"}
            </Button>
          </Link>

          {/* Mobile: profile avatar */}
          <button
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#14B8A6] text-xs font-bold text-white md:hidden"
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
              className="fixed inset-0 z-[60] bg-black/60 md:hidden"
              onClick={() => setShowProfile(false)}
            />
            <motion.div
              key="profile-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed bottom-0 left-0 right-0 z-[61] md:hidden rounded-t-3xl border-t border-white/[0.1] bg-[rgba(11,18,34,0.97)] p-6 backdrop-blur-2xl"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              {/* Handle */}
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />

              {loading ? (
                <div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
              ) : (
                <>
                  {/* User info */}
                  <div className="mb-5 flex items-center gap-3">
                    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#14B8A6] text-sm font-bold text-white">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{displayName}</div>
                      <div className="truncate text-[12px]" style={{ color: "var(--color-fg-3)" }}>
                        {companyName}
                      </div>
                      <div className="font-mono text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                        {displayPlan}
                      </div>
                    </div>
                  </div>

                  {/* Trial bar */}
                  {isTrial && (
                    <div className="mb-5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium">
                        <span className="text-white/40">Trial em progresso</span>
                        <span className="text-brand-blue-400">{remaining} dias restantes</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${trialProgress}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full bg-gradient-to-r from-brand-blue-600 to-brand-teal-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Link href="/planos" className="flex-1" onClick={() => setShowProfile(false)}>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-center border-brand-blue-500/20 bg-brand-blue-500/10 text-brand-blue-400 hover:bg-brand-blue-500/20"
                      >
                        <Zap size={14} />
                        Upgrade
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 border border-white/[0.08] text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      onClick={async () => {
                        setShowProfile(false);
                        await signOut();
                      }}
                    >
                      <LogOut size={14} />
                      Sair
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
