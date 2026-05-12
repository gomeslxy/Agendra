"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles, ArrowRight, Clock, Loader2, Zap, X, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GridBeam } from "@/components/ui/grid-beam";
import { Spotlight } from "@/components/ui/spotlight";
import { createClient } from "@/lib/supabase/client";
import { 
  calculateTrialStatus, 
  calculateTrialProgress,
  STRIPE_PRICE_IDS,
  PLANS_META
} from "@/lib/billing/plans";

// ─── Constants are now imported from @/lib/billing/plans ───────────────────────
const plans = PLANS_META;
const PRICE_IDS = STRIPE_PRICE_IDS;
type PlanKey = keyof typeof PRICE_IDS;

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlanosPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // Auth / company state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [companyCreatedAt, setCompanyCreatedAt] = useState<string | null>(null);

  // Post-checkout states
  const [syncing, setSyncing] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showCancelNotice, setShowCancelNotice] = useState(false);

  // Check session on mount
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoggedIn(false);
        setAuthLoading(false);
        return;
      }

      setIsLoggedIn(true);

      // Fetch company data
      const { data: membership } = await supabase
        .from("memberships")
        .select("company_id, companies(plan_type, subscription_status, created_at, cancel_at_period_end, current_period_end)")
        .eq("user_id", user.id)
        .single();

      const company = Array.isArray(membership?.companies)
        ? membership?.companies[0]
        : membership?.companies;

      if (company) {
        setCurrentPlan(company.plan_type ?? "trial");
        setIsSubscribed(company.subscription_status === "active");
        setIsCanceling(!!company.cancel_at_period_end);
        setPeriodEnd(company.current_period_end);
        const createdAt = (company as any).created_at ?? null;
        setCompanyCreatedAt(createdAt);

        // Only show trial banner if not yet subscribed
        if (company.subscription_status !== "active") {
          const { remaining } = calculateTrialStatus(createdAt);
          setTrialDaysRemaining(remaining);
        }
      }

      setAuthLoading(false);
    }

    init();
  }, []);

  // ── Auto-Sync pós-checkout ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeResult = params.get('stripe');
    if (!stripeResult) return;

    // Limpar URL
    window.history.replaceState({}, '', '/planos');

    if (stripeResult === 'cancel') {
      setShowCancelNotice(true);
      setTimeout(() => setShowCancelNotice(false), 5000);
      return;
    }

    if (stripeResult === 'success') {
      setSyncing(true);

      const syncWithRetry = async (retries = 4) => {
        try {
          const res = await fetch('/api/stripe/sync', { method: 'POST' });
          const data = await res.json();

          if (data.synced && data.plan && data.plan !== 'trial') {
            setCurrentPlan(data.plan);
            setIsSubscribed(true);
            setTrialDaysRemaining(null);
            setSyncing(false);
            setShowCelebration(true);
          } else if (retries > 0) {
            // Webhook pode não ter chegado ainda, tentar novamente
            setTimeout(() => syncWithRetry(retries - 1), 2500);
          } else {
            setSyncing(false);
            // Mostrar celebração mesmo assim — webhook pode estar atrasado
            setShowCelebration(true);
          }
        } catch {
          if (retries > 0) {
            setTimeout(() => syncWithRetry(retries - 1), 2500);
          } else {
            setSyncing(false);
            setShowCelebration(true);
          }
        }
      };

      syncWithRetry();
    }
  }, []);

  // Checkout handler for logged-in users
  const handleCheckout = async (planId: PlanKey) => {
    const priceId = PRICE_IDS[planId][isAnnual ? "annual" : "monthly"];
    
    // DEBUG LOG
    console.log(`[Stripe] Redirecionando para ${planId} (${isAnnual ? 'Anual' : 'Mensal'})`);
    console.log(`[Stripe] Price ID: ${priceId}`);

    try {
      setLoadingPlan(planId);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, planType: planId }),
      });
      
      const data = await res.json();
      console.log('[DEBUG FRONTEND] Resposta do Servidor:', { status: res.status, data });

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro na resposta do servidor');
      }
      
      if (data.url) {
        console.log('[DEBUG FRONTEND] Sucesso! Redirecionando...');
        window.location.href = data.url;
      } else {
        throw new Error('URL de redirecionamento não encontrada');
      }
    } catch (err: any) {
      console.error("[DEBUG FRONTEND] Erro capturado:", err);
      alert(err.message || "Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const trialElapsed = companyCreatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(companyCreatedAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="bg-[#0b1222] min-h-screen flex flex-col text-white selection:bg-brand-blue/30 relative">
      <Header />

      {/* ── Celebração Premium ── */}
      <AnimatePresence>
        {showCelebration && (
          <SubscriptionCelebration
            planName={plans.find(p => p.id === currentPlan)?.name ?? currentPlan ?? 'Pro'}
            onDismiss={() => setShowCelebration(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Syncing Overlay ── */}
      <AnimatePresence>
        {syncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-2 border-brand-blue-500/30 border-t-brand-blue-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-brand-blue-400" />
                </div>
              </div>
              <p className="text-sm font-semibold text-white/70">Ativando seu plano...</p>
              <p className="text-xs text-white/30">Sincronizando com o Stripe</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cancel Notice ── */}
      <AnimatePresence>
        {showCancelNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0A0A0A]/90 backdrop-blur-xl px-5 py-3 shadow-2xl"
          >
            <X className="w-4 h-4 text-white/40" />
            <span className="text-sm text-white/70">Checkout cancelado. Nenhuma cobrança foi feita.</span>
            <button onClick={() => setShowCancelNotice(false)} className="text-white/30 hover:text-white/60 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 pt-28 pb-24 px-4 sm:px-6 md:px-12 relative overflow-hidden z-10">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#3b82f6" />
        <GridBeam className="absolute inset-0 pointer-events-none opacity-40" />

        <div className="max-w-6xl mx-auto relative z-10">

          {/* ── Trial Banner: apenas para usuários logados e não assinantes ── */}
          <AnimatePresence>
            {/* ── Banner de Cancelamento ── */}
            {!authLoading && isLoggedIn && isCanceling && periodEnd && (
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-10 rounded-2xl border border-brand-orange-500/30 bg-brand-orange-500/5 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange-500/20">
                  <Clock className="w-5 h-5 text-brand-orange-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-brand-orange-300">Sua assinatura será encerrada em breve</h4>
                  <p className="text-xs text-brand-orange-300/70 mt-0.5">
                    Seu plano <strong>{currentPlan?.toUpperCase()}</strong> expira em <strong>{new Date(periodEnd).toLocaleDateString()}</strong>. Você voltará ao plano Trial após esta data.
                  </p>
                </div>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="border-brand-orange-500/30 text-brand-orange-400 hover:bg-brand-orange-500/10"
                  onClick={() => window.location.href = "/settings?tab=billing"}
                >
                  Gerenciar
                </Button>
              </motion.div>
            )}

            {!authLoading && isLoggedIn && !isSubscribed && trialDaysRemaining !== null && trialDaysRemaining >= 0 && (
              <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "mb-10 rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4",
                  trialDaysRemaining <= 2
                    ? "bg-red-500/10 border-red-500/30"
                    : trialDaysRemaining <= 4
                    ? "bg-amber-400/10 border-amber-400/30"
                    : "bg-brand-blue/10 border-brand-blue/30"
                )}
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  trialDaysRemaining <= 2 ? "bg-red-500/20" : "bg-brand-blue/20"
                )}>
                  <Clock className={cn("w-5 h-5", trialDaysRemaining <= 2 ? "text-red-400" : "text-brand-blue-300")} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm sm:text-base text-white">
                    {trialDaysRemaining === 0
                      ? "⚠️ Seu período de teste encerrou."
                      : trialDaysRemaining === 1
                      ? "⚡ Último dia de teste!"
                      : `Você está no período de teste — ${trialDaysRemaining} dias restantes`}
                  </p>
                  <p className="text-xs sm:text-sm text-white/50 mt-0.5">
                    Teste iniciado há {trialElapsed} dia{trialElapsed !== 1 ? "s" : ""}. 
                    {trialDaysRemaining === 0
                      ? " Assine agora para continuar usando a Agendra."
                      : " Assine agora e garanta acesso completo sem interrupções."}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full sm:w-40 shrink-0">
                  <div className="flex justify-between text-[10px] text-white/40 mb-1.5">
                    <span>Dia {7 - (trialDaysRemaining ?? 0)}</span>
                    <span>7 dias</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        trialDaysRemaining !== null && trialDaysRemaining <= 2 ? "bg-red-400" : "bg-brand-blue-500"
                      )}
                      style={{ width: `${calculateTrialProgress(7 - (trialDaysRemaining ?? 0))}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Header Section ───────────────────────────── */}
          <div className="text-center mb-12 sm:mb-16 space-y-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.04] px-3 py-1.5 backdrop-blur mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-blue shadow-[0_0_10px_#3b82f6] animate-pulse" />
                <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-widest text-white/60">
                  PREÇOS SIMPLES E TRANSPARENTES
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4 text-balance">
                Planos para escalar o seu{" "}
                <br className="hidden md:block" />
                <span className="bg-gradient-to-r from-[#3b82f6] to-teal-400 bg-clip-text text-transparent">
                  atendimento
                </span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">
                Sem taxas ocultas, sem fidelidade. Cancele quando quiser.
              </p>
            </motion.div>

            {/* Billing Toggle */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="inline-flex items-center bg-white/[0.03] backdrop-blur-md border border-white/[0.08] p-1.5 rounded-2xl mx-auto"
            >
              <button
                onClick={() => setIsAnnual(false)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                  !isAnnual ? "bg-white/[0.08] text-white border border-white/[0.1]" : "text-white/40 hover:text-white"
                )}
              >
                Mensal
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={cn(
                  "relative px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                  isAnnual ? "bg-brand-blue/20 text-[#93c5fd] border border-brand-blue/30" : "text-white/40 hover:text-white"
                )}
              >
                Anual
                <span className="absolute -top-3 -right-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-white/20 whitespace-nowrap shadow-lg">
                  -25%
                </span>
              </button>
            </motion.div>
          </div>

          {/* ── Pricing Cards ─────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => {
              const isPlanActive = isLoggedIn && isSubscribed && currentPlan === plan.id;
              const isButtonLoading = loadingPlan === plan.id;

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: i * 0.12 + 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "relative rounded-2xl sm:rounded-3xl border flex flex-col transition-all duration-500 group overflow-hidden",
                    plan.recommended
                      ? "border-[#3b82f6]/40 bg-gradient-to-b from-[#3b82f6]/[0.07] to-transparent shadow-[0_0_50px_rgba(59,130,246,0.12)] md:-translate-y-4"
                      : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14]",
                    isPlanActive && "border-emerald-400/40 bg-gradient-to-b from-emerald-400/[0.05] to-transparent"
                  )}
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  {plan.recommended && !isPlanActive && (
                    <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/60 to-transparent" />
                  )}
                  {plan.recommended && !isPlanActive && (
                    <div className="flex justify-center pt-3">
                      <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#3b82f6] to-teal-500 text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20 shadow-lg">
                        <Sparkles className="w-3 h-3" />
                        MAIS ESCOLHIDO
                      </span>
                    </div>
                  )}
                  {isPlanActive && (
                    <div className="flex justify-center pt-3">
                      <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-400/30">
                        ✓ SEU PLANO ATUAL
                      </span>
                    </div>
                  )}

                  <div className={cn("p-6 sm:p-8 flex flex-col flex-1 relative z-10", (plan.recommended || isPlanActive) && "pt-4")}>
                    {/* Plan info */}
                    <div className="mb-6">
                      <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">{plan.name}</h3>
                      <p className="text-sm text-white/45 leading-relaxed min-h-[40px]">{plan.desc}</p>

                      <div className="mt-5 flex items-baseline gap-2">
                        <span className="text-sm font-medium text-white/30">R$</span>
                        <span className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                          {isAnnual ? plan.annual : plan.monthly}
                        </span>
                        <span className="text-sm text-white/30">/mês</span>
                      </div>

                      <div className="mt-2.5 h-6">
                        {isAnnual && (
                          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md border border-emerald-400/20 inline-flex items-center">
                            Faturado R$ {plan.annual * 12}/ano
                          </span>
                        )}
                      </div>
                    </div>

                    {/* CTA Button */}
                    <div className="mb-7">
                      {authLoading ? (
                        <div className="h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] animate-pulse" />
                      ) : isLoggedIn ? (
                        <button
                          disabled={(isPlanActive && !isCanceling) || isButtonLoading || loadingPlan !== null}
                          onClick={() => handleCheckout(plan.id)}
                          className={cn(
                            "w-full h-12 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2",
                            isPlanActive && !isCanceling
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 cursor-default"
                              : plan.recommended
                              ? "bg-white text-[#0b1222] hover:bg-white/90 shadow-[0_0_25px_rgba(255,255,255,0.15)] hover:shadow-[0_0_35px_rgba(255,255,255,0.25)] active:scale-[0.98]"
                              : "bg-white/[0.05] border border-white/[0.1] text-white hover:bg-white/[0.1] active:scale-[0.98]",
                            (isButtonLoading || (loadingPlan !== null && loadingPlan !== plan.id)) && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          {isButtonLoading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Redirecionando...</>
                          ) : isPlanActive ? (
                            isCanceling ? "Reativar Plano" : "Plano Atual"
                          ) : (
                            <>Assinar {plan.name} <ArrowRight className="w-4 h-4" /></>
                          )}
                        </button>
                      ) : (
                        <Link
                          href={`/signup?plan=${plan.id}&billing=${isAnnual ? "annual" : "monthly"}`}
                          className={cn(
                            "w-full h-12 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2",
                            plan.recommended
                              ? "bg-white text-[#0b1222] hover:bg-white/90 shadow-[0_0_25px_rgba(255,255,255,0.15)] hover:shadow-[0_0_35px_rgba(255,255,255,0.25)]"
                              : "bg-white/[0.05] border border-white/[0.1] text-white hover:bg-white/[0.1]"
                          )}
                        >
                          Começar grátis <ArrowRight className="w-4 h-4" />
                        </Link>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/[0.06] mb-6" />

                    {/* Feature list */}
                    <ul className="space-y-3.5 flex-1">
                      <li className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.1] flex items-center justify-center">
                          <Zap className="w-3 h-3 text-[#93c5fd]" />
                        </div>
                        <span className="font-semibold text-sm text-white">{plan.leads}</span>
                      </li>
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mt-0.5">
                            <Check className="w-3 h-3 text-white/60" />
                          </div>
                          <span className="text-[13px] text-white/60 leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ── Footer Note ──────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="text-center mt-12 space-y-2"
          >
            {!isLoggedIn && (
              <p className="text-sm text-white/40">
                Todos os planos incluem <span className="text-white/70 font-medium">7 dias grátis</span> para testar. Sem cartão de crédito.
              </p>
            )}
            <p className="text-xs text-white/25">
              Cobranças processadas com segurança via Stripe. Cancele a qualquer momento.
            </p>
          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── Celebration Component ──────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

function SubscriptionCelebration({ planName, onDismiss }: { planName: string; onDismiss: () => void }) {
  const particles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      delay: Math.random() * 0.6,
      duration: 2 + Math.random() * 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 5 + Math.random() * 7,
      rotation: Math.random() * 360,
      xDrift: (Math.random() - 0.5) * 120,
    }))
  , []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] flex items-center justify-center"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-xl"
        onClick={onDismiss}
      />

      {/* Confetti */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: '-2%',
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{
            y: '110vh',
            x: p.xDrift,
            opacity: [1, 1, 0],
            rotate: p.rotation + 720,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        />
      ))}

      {/* Glass Card */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 10 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 25 }}
        className="relative z-10 max-w-md w-full mx-4 rounded-3xl border border-white/20 bg-white/[0.06] backdrop-blur-2xl p-8 sm:p-10 text-center shadow-[0_0_80px_rgba(59,130,246,0.12)]"
      >
        {/* Glow ring */}
        <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-emerald-500/20 via-transparent to-brand-blue-500/10 pointer-events-none" />

        {/* Animated Check */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 400, damping: 12 }}
          className="relative mx-auto mb-7 h-24 w-24"
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 blur-xl opacity-50 animate-pulse" />
          <div className="relative h-full w-full rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.4)]">
            <motion.div
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <Check className="w-12 h-12 text-white" strokeWidth={3} />
            </motion.div>
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-2xl sm:text-3xl font-bold text-white mb-3"
        >
          Assinatura Ativada! 🎉
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-sm sm:text-base text-white/50 mb-2 leading-relaxed"
        >
          O plano{' '}
          <span className="font-bold text-brand-blue-400">{planName}</span>{' '}
          está ativo. Você agora tem acesso completo à Agendra.
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-xs text-white/25 mb-8"
        >
          Seus limites e funcionalidades foram atualizados automaticamente.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <a
            href="/inbox"
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-brand-blue-600 to-brand-blue-500 text-white font-semibold text-sm hover:brightness-110 transition-all shadow-[0_0_25px_rgba(59,130,246,0.3)] hover:shadow-[0_0_35px_rgba(59,130,246,0.5)] active:scale-[0.98]"
          >
            Ir para o Dashboard <ArrowRight className="w-4 h-4" />
          </a>
          <button
            onClick={onDismiss}
            className="flex-1 h-12 rounded-xl border border-white/10 bg-white/[0.04] text-white/60 font-medium text-sm hover:bg-white/[0.08] hover:text-white/80 transition-all active:scale-[0.98]"
          >
            Continuar aqui
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
