"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PLANS_META } from "@/lib/billing/plans";

const plans = PLANS_META;

export function PricingTable() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="planos-home" className="relative py-24 bg-[#FAFAFA]" aria-label="Nossos Planos">
      <div className="mx-auto max-w-[1200px] px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-3 py-1.5 shadow-sm mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-pulse" />
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-widest text-[#71717A]">
              PREÇOS SIMPLES E TRANSPARENTES
            </span>
          </div>

          <h2 className="text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em] mb-4 text-[#09090B]">
            Um investimento que se paga no primeiro agendamento
          </h2>
          <p className="text-[#71717A] max-w-xl mx-auto leading-relaxed text-sm sm:text-base">
            Escolha o plano ideal para o tamanho do seu negócio. Sem contratos ou taxas ocultas. Cancele quando quiser.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 inline-flex items-center bg-[#F4F4F5] border border-[#E4E4E7] p-1 rounded-2xl mx-auto">
            <button
              onClick={() => setIsAnnual(false)}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer",
                !isAnnual
                  ? "bg-white text-[#09090B] shadow-sm border border-[#E4E4E7]"
                  : "text-[#71717A] hover:text-[#09090B]"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={cn(
                "relative px-5 py-2 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer",
                isAnnual
                  ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-semibold"
                  : "text-[#71717A] hover:text-[#09090B]"
              )}
            >
              Anual
              <span className="absolute -top-3.5 -right-2.5 bg-[#10B981] text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-[#CEEAD6] shadow-sm whitespace-nowrap">
                -25%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto items-stretch">
          {plans.map((plan, i) => {
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "relative rounded-3xl border flex flex-col transition-all duration-300 overflow-hidden bg-white p-7 sm:p-8",
                  plan.recommended
                    ? "border-[#2563EB] shadow-[0_12px_36px_rgba(37,99,235,0.06)] md:-translate-y-2.5"
                    : "border-[#E4E4E7] hover:border-[#D4D4D8] shadow-sm hover:shadow-md"
                )}
              >
                {/* Visual Accent */}
                {plan.recommended && (
                  <div className="absolute top-0 inset-x-0 flex justify-center mt-3 z-10">
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-[#2563EB] to-[#14B8A6] text-white text-[10px] font-bold px-3 py-0.5 rounded-full border border-[#CEEAD6] shadow-sm uppercase tracking-wide">
                      <Sparkles className="w-2.5 h-2.5" />
                      MAIS ESCOLHIDO
                    </span>
                  </div>
                )}

                <div className={cn("flex flex-col flex-1", plan.recommended && "pt-4")}>
                  {/* Plan Meta */}
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-[#09090B] mb-1.5">{plan.name}</h3>
                    <p className="text-xs text-[#71717A] leading-relaxed min-h-[36px]">
                      {plan.desc}
                    </p>

                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-[#71717A]">R$</span>
                      <span className="text-4xl font-bold tracking-tight text-[#09090B]">
                        {isAnnual ? plan.annual : plan.monthly}
                      </span>
                      <span className="text-xs text-[#71717A]">/mês</span>
                    </div>

                    <div className="mt-2 h-5">
                      {isAnnual && (
                        <span className="text-[10px] font-semibold text-[#10B981] bg-[#E6F4EA] px-2 py-0.5 rounded border border-[#CEEAD6] inline-flex items-center">
                          Faturado R$ {plan.annual * 12}/ano
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div className="mb-6">
                    <Link
                      href={`/signup?plan=${plan.id}&billing=${isAnnual ? "annual" : "monthly"}`}
                      className={cn(
                        "w-full h-11 rounded-xl font-bold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 active:scale-[0.98]",
                        plan.recommended
                          ? "bg-[#F97316] text-white hover:bg-[#EA580C] shadow-[0_4px_14px_rgba(249,115,22,0.25)]"
                          : "bg-white border border-[#E4E4E7] text-[#09090B] hover:bg-[#F4F4F5]"
                      )}
                    >
                      Começar grátis
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-[#E4E4E7] mb-5" />

                  {/* Features */}
                  <ul className="space-y-3 flex-1">
                    <li className="flex items-center gap-2.5">
                      <div className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center">
                        <Zap className="w-2.5 h-2.5 text-[#2563EB]" />
                      </div>
                      <span className="font-semibold text-xs text-[#09090B]">
                        {plan.leads}
                      </span>
                    </li>
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <div className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-[#F4F4F5] border border-[#E4E4E7] flex items-center justify-center mt-0.5">
                          <Check className="w-2.5 h-2.5 text-[#71717A]" />
                        </div>
                        <span className="text-[12px] text-[#3F3F46] leading-relaxed">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="text-center mt-12 space-y-1.5">
          <p className="text-xs text-[#71717A]">
            Todos os planos incluem <span className="text-[#09090B] font-bold">7 dias grátis</span> para testar. Sem necessidade de cartão de crédito.
          </p>
          <p className="text-[11px] text-[#A1A1AA]">
            Assinaturas seguras processadas via Stripe. Cancele e alterne entre planos quando quiser.
          </p>
        </div>
      </div>
    </section>
  );
}
