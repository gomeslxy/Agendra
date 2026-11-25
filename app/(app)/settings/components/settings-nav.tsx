"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Briefcase,
  Clock,
  Cpu,
  CreditCard,
  GitBranch,
  Loader2,
  MessageSquare,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import type { SettingsTabId } from "../types";

export const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
  category: "Geral" | "Inteligência" | "Integrações";
}[] = [
  { id: "account", label: "Conta & Empresa", icon: Users, category: "Geral" },
  { id: "rules", label: "Horários & Regras", icon: Clock, category: "Geral" },
  { id: "billing", label: "Assinatura", icon: CreditCard, category: "Geral" },
  { id: "brain", label: "Cérebro da IA", icon: Cpu, category: "Inteligência" },
  { id: "logs", label: "Mente da IA", icon: Zap, category: "Inteligência" },
  { id: "channels", label: "Canais", icon: MessageSquare, category: "Integrações" },
  { id: "services", label: "Serviços", icon: Briefcase, category: "Integrações" },
  { id: "automation", label: "Automação", icon: GitBranch, category: "Integrações" },
];

export function SettingsNav({ activeTab }: { activeTab: SettingsTabId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [optimisticTab, setOptimisticTab] = useState<SettingsTabId>(activeTab);

  useEffect(() => {
    setOptimisticTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const gcal = searchParams.get("gcal");
    const stripe = searchParams.get("stripe");

    if (gcal === "success") {
      toast.success("Google Calendar conectado com sucesso! 🎉");
      trackEvent("gcal_connected");
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (gcal === "error") {
      toast.error("Erro ao conectar Google Calendar. Tente novamente.");
      trackEvent("gcal_failed", { reason: "error" });
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (gcal === "denied") {
      toast.error("Conexão com Google Calendar cancelada.");
      trackEvent("gcal_failed", { reason: "denied" });
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (stripe === "success") {
      toast.success("Assinatura confirmada! Sua IA está turbinada. 🚀");
      trackEvent("stripe_success");
      fetch("/api/stripe/sync", { method: "POST" })
        .then(() => router.refresh())
        .catch(() => {});
      router.replace("/settings?tab=billing", { scroll: false });
    }
  }, [searchParams, router]);

  function navigateTab(nextTab: SettingsTabId) {
    if (nextTab === optimisticTab) return;
    setOptimisticTab(nextTab);
    startTransition(() => {
      router.push(`/settings?tab=${nextTab}`, { scroll: false });
    });
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Seções de configuração"
        className="lg:hidden relative w-full flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
      >
        {SETTINGS_TABS.map((t) => {
          const active = optimisticTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigateTab(t.id)}
              className={cn(
                "group relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-tight transition-all duration-200 outline-none cursor-pointer shrink-0",
                active ? "text-[#2563EB]" : "text-[#52525B] hover:text-[#18181B] hover:bg-[#F4F4F5]",
              )}
            >
              <t.icon
                size={16}
                className={cn(
                  "relative z-10",
                  active ? "text-[#2563EB]" : "text-[#71717A] group-hover:text-[#3F3F46]",
                )}
              />
              <span className="relative z-10">{t.label}</span>
              {active && isPending && <Loader2 size={12} className="relative z-10 animate-spin text-[#2563EB]" />}
              {active && (
                <motion.div
                  layoutId="active-tab-mobile-glow"
                  className="absolute inset-0 z-0 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <nav
        role="tablist"
        aria-label="Seções de configuração"
        className="hidden lg:flex flex-col w-64 shrink-0 gap-5 sticky top-7 select-none"
      >
        {(["Geral", "Inteligência", "Integrações"] as const).map((cat) => {
          const catTabs = SETTINGS_TABS.filter((t) => t.category === cat);
          return (
            <div key={cat} className="flex flex-col gap-1">
              <span className="px-4 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#71717A] mb-1.5">
                {cat}
              </span>
              {catTabs.map((t) => {
                const active = optimisticTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => navigateTab(t.id)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold tracking-tight transition-all duration-150 outline-none cursor-pointer text-left w-full",
                      active ? "text-[#09090B] font-bold" : "text-[#52525B] hover:text-[#18181B] hover:bg-white/50",
                    )}
                  >
                    {active && (
                      <motion.div
                        layoutId="active-tab-desktop-glow"
                        className="absolute inset-0 z-0 rounded-xl border border-[#E4E4E7] bg-white shadow-sm"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <t.icon
                      size={15}
                      className={cn(
                        "relative z-10",
                        active ? "text-[#2563EB]" : "text-[#71717A] group-hover:text-[#3F3F46]",
                      )}
                    />
                    <span className="relative z-10 flex-1">{t.label}</span>
                    {active && isPending && <Loader2 size={12} className="relative z-10 animate-spin text-[#2563EB]" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </>
  );
}
