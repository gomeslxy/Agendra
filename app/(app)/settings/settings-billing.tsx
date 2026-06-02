"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Loader2, Zap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { STRIPE_PRICE_IDS, PLANS_META } from "@/lib/billing/plans";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import type { PlanType } from "@/lib/billing/plans";

interface Company {
  plan_type?: PlanType | null;
  subscription_status?: string | null;
}

export function Billing({ company, usage, isReadOnly = false }: { company: Company | null; usage: any; isReadOnly?: boolean }) {
  const [loading, setLoading] = React.useState<string | null>(null);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [isAnnual, setIsAnnual] = React.useState(true);

  const handleCheckout = async (priceId: string, planType: string) => {
    try {
      setLoading(planType);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, planType }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
      toast.error("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  // [FIX CRIT-3] Real Stripe Billing Portal
  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error("Portal error:", err);
      toast.error("Erro ao abrir gerenciamento de assinatura. Tente novamente.");
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPlan = company?.plan_type || "trial";
  const subscriptionStatus = company?.subscription_status;
  const isSubscriptionActive = subscriptionStatus === "active";
  // [FIX M3] past_due também bloqueia novo checkout — cliente deve ir ao portal
  const isSubscriptionManageable = subscriptionStatus === "active" || subscriptionStatus === "past_due";

  // [FIX ARCH-1] Price IDs agora vêm do single source of truth
  const plans = PLANS_META.map((p) => ({
    ...p,
    priceId: STRIPE_PRICE_IDS[p.id][isAnnual ? "annual" : "monthly"],
  }));

  const leadsUsed = usage?.usage?.leads || 0;
  const leadsMax = usage?.limits?.maxLeads || 150;
  const leadsPct = Math.min(100, Math.round((leadsUsed / leadsMax) * 100));

  const cancelAtPeriodEnd = usage?.cancelAtPeriodEnd;
  const currentPeriodEnd = usage?.currentPeriodEnd;

  const trialDaysRemaining = usage?.trialDaysRemaining ?? null;
  // Genuine trial: plan is trial AND no active/past_due/canceled subscription
  const isOnTrial = currentPlan === "trial" &&
    (!subscriptionStatus || subscriptionStatus === "trial");

  return (
    <div className="flex flex-col gap-6 pb-12">
      {isReadOnly && (
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-xs text-[#92400E] shadow-sm">
          ⚠️ <strong>Apenas Leitura:</strong> Você não possui permissões administrativas. As configurações estão em modo de visualização.
        </div>
      )}
      {/* Banner de Trial */}
      {isOnTrial && (
        <Card className={cn(
          trialDaysRemaining === 0 ? "border-[#FECACA] bg-[#FFF1F2]" : "border-[#BFDBFE] bg-[#EFF6FF]"
        )}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-full",
              trialDaysRemaining === 0 ? "bg-[#FEE2E2] text-[#DC2626]" : "bg-[#DBEAFE] text-[#2563EB]"
            )}>
              <Clock size={16} />
            </div>
            <div className="flex-1">
              <p className={cn(
                "text-sm font-semibold",
                trialDaysRemaining === 0 ? "text-[#DC2626]" : "text-[#1D4ED8]"
              )}>
                {trialDaysRemaining === 0
                  ? "Período de teste expirado"
                  : trialDaysRemaining === 1
                  ? "Último dia do período de teste!"
                  : `${trialDaysRemaining} dias restantes no trial`}
              </p>
              <p className={cn(
                "text-xs mt-0.5",
                trialDaysRemaining === 0 ? "text-[#DC2626]/70" : "text-[#1D4ED8]/70"
              )}>
                {trialDaysRemaining === 0
                  ? "Assine agora para reativar a IA."
                  : "Assine antes do término para não perder o acesso."}
              </p>
            </div>
            {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
              <div className="shrink-0 flex flex-col items-center">
                <span className="text-3xl font-black text-[#1D4ED8] tabular-nums leading-none">{trialDaysRemaining}</span>
                <span className="text-[9px] text-[#2563EB]/60 uppercase tracking-wider">{trialDaysRemaining === 1 ? "dia" : "dias"}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Banner de Cancelamento */}
      {cancelAtPeriodEnd && currentPeriodEnd && (
        <Card className="border-brand-orange-500/30 bg-brand-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-brand-orange-500/20 text-[#F97316]">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#C2410C]">Sua assinatura foi cancelada</p>
              <p className="text-xs text-[#C2410C]/70">
                Seu acesso ao plano <strong>{currentPlan.toUpperCase()}</strong> continuará ativo até o dia <strong><SafeClientOnly fallback="—">{new Date(currentPeriodEnd).toLocaleDateString("pt-BR")}</SafeClientOnly></strong>. Após essa data, você voltará ao plano Trial.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Barra de Uso */}
      <Card className="bg-[#FAFAFA] border-brand-teal-500/10">
        <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1 w-full">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[13px] font-semibold text-[#09090B]">Consumo de Leads ({currentPlan.toUpperCase()})</span>
              <span className="text-xs font-mono text-[#3F3F46]">{leadsUsed} / {leadsMax}</span>
            </div>
            <div className="h-2 w-full bg-[#FAFAFA] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${leadsPct}%` }}
                className={cn("h-full rounded-full", leadsPct > 85 ? "bg-brand-orange-500 shadow-glow-orange/20" : "bg-brand-teal-400 shadow-glow-teal/20")}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            {leadsPct > 85 && (
              <p className="text-[11px] text-[#F97316] mt-2 font-medium">Você está perto do limite do seu plano. Faça upgrade para não pausar a IA.</p>
            )}
          </div>
          {isSubscriptionManageable ? (
            <Button
              variant="secondary"
              size="sm"
              className="whitespace-nowrap"
              disabled={portalLoading || isReadOnly}
              onClick={handleManageSubscription}
            >
              {portalLoading ? <><Loader2 size={14} className="animate-spin mr-1.5" />Abrindo...</> : "Gerenciar Assinatura"}
            </Button>
          ) : !isReadOnly ? (
            <Link href="/planos">
              <Button
                variant="secondary"
                size="sm"
                className="whitespace-nowrap bg-brand-blue-500/10 text-[#2563EB] hover:bg-brand-blue-500/20 border-brand-blue-500/20"
              >
                <Zap size={13} className="mr-1.5" />
                Fazer Upgrade
              </Button>
            </Link>
          ) : (
            <Badge variant="cold" className="text-[10px] px-2.5 py-1 border border-[#E4E4E7] bg-[#FAFAFA] text-[#71717A]">
              Apenas Leitura
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Preços */}
      <div className="flex flex-col items-center mb-4">
        <div className="flex items-center gap-3 p-1 rounded-full border border-[#E4E4E7] bg-[#FAFAFA]">
          <button
            onClick={() => setIsAnnual(false)}
            className={cn("px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors", !isAnnual ? "bg-[#F4F4F5] text-[#09090B]" : "text-[#71717A]")}
          >
            Mensal
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={cn("px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors flex items-center gap-1.5", isAnnual ? "bg-[#F4F4F5] text-[#0D9488]" : "text-[#71717A]")}
          >
            Anual <Badge variant="hot" className="text-[9px] px-1 py-0 h-4">-25%</Badge>
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          // [FIX M3] past_due com mesmo plano também desabilita novo checkout
          const isActive = isSubscriptionActive && currentPlan === p.id;
          const isPastDueSamePlan = subscriptionStatus === "past_due" && currentPlan === p.id;
          const isButtonLoading = loading === p.id;

          return (
            <motion.div
              key={p.id}
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 overflow-hidden",
                p.recommended ? "border-brand-blue-500/50 bg-brand-blue-500/5" : "border-[#E4E4E7] bg-[#FAFAFA]",
                isActive && "border-brand-teal-500/50"
              )}
            >
              {p.recommended && (
                <div className="absolute top-0 right-0 left-0 flex justify-center transform -translate-y-px">
                  <div className="bg-[#2563EB] text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-b-lg">
                    Recomendado
                  </div>
                </div>
              )}

              <div className="mt-4 mb-2">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="text-[12px] text-[#71717A] h-8">{p.desc}</p>
              </div>

              <div className="my-4 flex items-baseline gap-1">
                <span className="text-3xl font-black">R$ {isAnnual ? p.annual : p.monthly}</span>
                <span className="text-xs text-[#71717A]">/mês</span>
              </div>

              {isAnnual && (
                <div className="text-[11px] text-[#71717A] mb-6">Faturado R$ {p.annual * 12}/ano</div>
              )}
              {!isAnnual && (
                <div className="text-[11px] text-[#71717A] mb-6 invisible">Espaço</div>
              )}

              <Button
                variant={isActive ? "ghost" : p.recommended ? "blue" : "secondary"}
                className={cn("w-full mb-6 font-bold", p.recommended && "shadow-glow-blue/20")}
                disabled={isActive || isPastDueSamePlan || loading !== null || isReadOnly}
                onClick={() => handleCheckout(p.priceId, p.id)}
              >
                {isButtonLoading ? "Processando..." : isActive ? "Plano Atual" : "Assinar " + p.name}
              </Button>

              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0D9488]">
                  <Check size={14} /> {p.leads}
                </div>
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-[#3F3F46]">
                    <Check size={14} className="mt-0.5 text-[#A1A1AA] shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
