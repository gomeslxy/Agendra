"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope,
  Dumbbell,
  Home as HomeIcon,
  Briefcase,
  Star,
  ArrowRight,
  Terminal,
  Check,
  Brain,
} from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import Link from "next/link";

interface SegmentData {
  id: string;
  name: string;
  Icon: React.ElementType;
  roiTitle: string;
  roiSub: string;
  testimonial: {
    quote: string;
    author: string;
    role: string;
  };
  aiInstructions: {
    systemPrompt: string;
    knowledges: string[];
  };
  ctaText: string;
}

const SEGMENTS: SegmentData[] = [
  {
    id: "clinicas",
    name: "Clínicas & Consultórios",
    Icon: Stethoscope,
    roiTitle: "3.2× mais consultas agendadas",
    roiSub: "Respostas imediatas impedem que leads comprem do concorrente enquanto esperam atendimento.",
    testimonial: {
      quote: "A Agendra se pagou no primeiro dia de uso. Três leads do Instagram viraram consultas em menos de 10 minutos, sem eu precisar encostar no celular. Perfeito para preencher a agenda.",
      author: "Dra. Ana Ferreira",
      role: "Clínica de Estética · São Paulo",
    },
    aiInstructions: {
      systemPrompt: "Você é a secretária virtual inteligente da Clínica BellaPelle. Seu objetivo é qualificar leads interessados em procedimentos estéticos (Toxina Botulínica, Clareamento, Bioestimuladores) e agendar uma avaliação inicial gratuita diretamente na agenda da Dra. Ana. Seja extremamente acolhedora e educada.",
      knowledges: [
        "Clareamento Dental: R$ 890 (parcelado em até 10x)",
        "Toxina Botulínica: Avaliação necessária (procedimento personalizado)",
        "Horários disponíveis: Sincronizados com o Google Calendar em tempo real",
      ],
    },
    ctaText: "Aumentar consultas da clínica",
  },
  {
    id: "academias",
    name: "Academias & Studios",
    Icon: Dumbbell,
    roiTitle: "Filtro inteligente de curiosos",
    roiSub: "Atendimento imediato a novos inscritos de anúncios, filtrando quem realmente quer treinar.",
    testimonial: {
      quote: "Antes perdíamos muitos alunos porque demorávamos para responder no WhatsApp. Agora, a IA responde em 4 segundos e nos entrega apenas os alunos quentes. Nossa agenda de aulas experimentais está lotada há semanas.",
      author: "Rodrigo Melo",
      role: "Academia Fit Prime · Curitiba",
    },
    aiInstructions: {
      systemPrompt: "Você é o atendente virtual dinâmico da Academia FitPrime. Ajude novos interessados a escolher o plano ideal (Musculação, Crossfit, Funcional) e agende uma aula experimental gratuita. Mantenha um tom motivador e enérgico.",
      knowledges: [
        "Aula Experimental: Musculação ou Crossfit sem custo",
        "Planos: Mensal R$ 149, Semestral R$ 119/mês",
        "Regra: Sempre peça o telefone do lead antes de fechar o agendamento",
      ],
    },
    ctaText: "Lotar aulas experimentais",
  },
  {
    id: "imobiliarias",
    name: "Imobiliárias & Corretores",
    Icon: HomeIcon,
    roiTitle: "Visitas qualificadas no automático",
    roiSub: "Qualifique orçamento, localização e número de quartos antes de enviar o lead ao corretor.",
    testimonial: {
      quote: "A integração com o Google Calendar é perfeita. A IA qualifica o lead, entende o que ele procura e já agenda a visita física no imóvel de forma autônoma. Zero conflitos, zero trabalho manual.",
      author: "Juliana Costa",
      role: "Imobiliária Costa & Silva · Rio de Janeiro",
    },
    aiInstructions: {
      systemPrompt: "Você é a assessora imobiliária inteligente da Costa & Silva Imóveis. Seu objetivo é entender se o lead deseja alugar ou comprar, qual o orçamento disponível, a região de interesse e agendar uma visita física aos imóveis do catálogo.",
      knowledges: [
        "Perfil do lead: Exigir faturamento/renda compatível",
        "Visitas: Agendar somente com antecedência de 24h",
        "Corretores: Distribuição round-robin automatizada por região",
      ],
    },
    ctaText: "Agendar visitas automáticas",
  },
  {
    id: "b2b",
    name: "Serviços B2B & Vendas",
    Icon: Briefcase,
    roiTitle: "SQLs quentes para seus vendedores",
    roiSub: "Filtre leads sem fit e garanta que seus vendedores só façam reuniões com tomadores de decisão.",
    testimonial: {
      quote: "Nossa equipe comercial gastava 70% do tempo qualificando leads frios. Com a Agendra, os leads chegam já triados, com orçamento validado e reunião agendada na conta do SDR correspondente.",
      author: "Juliana Mendes",
      role: "CEO da GrowthLabs · Belo Horizonte",
    },
    aiInstructions: {
      systemPrompt: "Você é a assistente de qualificação comercial (SDR virtual) da GrowthLabs. Qualifique os leads que baixaram materiais ricos. Identifique o cargo, faturamento da empresa e dores comerciais antes de oferecer a call de diagnóstico de 15 min.",
      knowledges: [
        "ICP ideal: Sócio, Diretor ou Gerente de Vendas/Marketing",
        "Filtro: Faturamento anual acima de R$ 500k",
        "Meta: Agendar call de demonstração de 15 minutos",
      ],
    },
    ctaText: "Qualificar leads B2B",
  },
];

export function SegmentShowcase() {
  const [activeTab, setActiveTab] = useState<string>("clinicas");

  const activeSegment = SEGMENTS.find((s) => s.id === activeTab) || SEGMENTS[0];

  const handleTabChange = (id: string) => {
    trackEvent("nav_click", { location: "segment_showcase", target: id });
    setActiveTab(id);
  };

  return (
    <section id="segmentos" className="relative py-24 bg-[#FAFAFA]" aria-label="Casos de uso e depoimentos por segmento">
      <div className="mx-auto max-w-[1200px] px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="eyebrow mb-3 block">QUEM USA</span>
          <h2 className="mb-4 text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em] text-[#09090B]">
            Feito sob medida para o seu segmento
          </h2>
          <p className="text-[clamp(16px,1.2vw,18px)] text-[#3F3F46] leading-relaxed">
            Selecione sua área e veja como a Agendra converte seus leads de anúncios em vendas reais, sem sobrecarregar sua equipe.
          </p>
        </div>

        {/* Dynamic Selector Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-[#E4E4E7] bg-white p-1.5 shadow-sm">
            {SEGMENTS.map((s) => {
              const Icon = s.Icon;
              const isActive = s.id === activeTab;
              return (
                <button
                  key={s.id}
                  onClick={() => handleTabChange(s.id)}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? "text-white"
                      : "text-[#3F3F46] hover:bg-[#F4F4F5] hover:text-[#09090B]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-segment-pill"
                      className="absolute inset-0 rounded-full bg-brand-blue-600 shadow-[0_4px_12px_rgba(37,99,235,0.25)]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    <Icon size={14} className="inline-block mr-1" />
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Core Showcase Display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-stretch"
          >
            {/* Left Column: ROI, Testimonial & Custom CTA */}
            <div className="flex flex-col justify-between">
              <Glass className="p-8 h-full flex flex-col justify-between border-[#E4E4E7] bg-white shadow-sm rounded-2xl relative overflow-hidden">
                <div className="relative z-10">
                  {/* Accent tag */}
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#99F6E4] bg-[#F0FDFA] px-3 py-1 mb-5">
                    <Brain size={12} className="text-[#0D9488]" />
                    <span className="font-mono text-[9px] font-bold text-[#0D9488] uppercase">RESULTADO GARANTIDO</span>
                  </div>

                  <h3 className="text-2xl font-bold tracking-tight text-[#09090B] mb-3">
                    {activeSegment.roiTitle}
                  </h3>
                  <p className="text-sm text-[#3F3F46] leading-relaxed mb-8">
                    {activeSegment.roiSub}
                  </p>

                  {/* Testimonial Block */}
                  <div className="border-l-2 border-brand-orange-500 pl-4 py-1 mb-8">
                    <div className="flex gap-0.5 mb-2.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={14} className="fill-[#F97316] text-[#F97316]" />
                      ))}
                    </div>
                    <blockquote className="text-sm text-[#3F3F46] leading-relaxed italic mb-3">
                      &ldquo;{activeSegment.testimonial.quote}&rdquo;
                    </blockquote>
                    <div>
                      <cite className="not-italic text-xs font-bold text-[#09090B] block">
                        {activeSegment.testimonial.author}
                      </cite>
                      <span className="text-[11px] text-[#71717A]">
                        {activeSegment.testimonial.role}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto relative z-10 pt-4">
                  <Link href="/signup">
                    <Button variant="orange" className="w-full sm:w-auto px-8 group rounded-full font-semibold shadow-md hover:shadow-lg transition-all duration-200">
                      {activeSegment.ctaText}
                      <ArrowRight size={16} className="ml-2 inline-block transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                  <p className="mt-3 text-[10px] text-[#71717A] pl-1">
                    ✓ Teste grátis de 7 dias · Sem cartão de crédito
                  </p>
                </div>
              </Glass>
            </div>

            {/* Right Column: AI Brain Interactive Preview (Aha! Moment) */}
            <div className="flex flex-col h-full">
              <div className="border border-[#E4E4E7] bg-white rounded-2xl p-6 shadow-sm h-full flex flex-col justify-between relative overflow-hidden">
                {/* Visual grid header */}
                <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-600">
                      <Brain size={13} />
                    </div>
                    <span className="text-xs font-bold text-[#09090B]">Cérebro da IA · Configuração</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-[10px] text-[#71717A] uppercase font-bold">ATIVA</span>
                  </div>
                </div>

                {/* Prompt block inside terminal styling */}
                <div className="flex-1 flex flex-col gap-4">
                  <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 font-mono text-[11px] leading-relaxed text-[#3F3F46]">
                    <div className="flex items-center gap-2 border-b border-[#E4E4E7] pb-2 mb-2 text-[#71717A]">
                      <Terminal size={12} />
                      <span className="font-bold">INSTRUÇÕES DO SISTEMA (SYSTEM PROMPT)</span>
                    </div>
                    <p className="whitespace-pre-line">
                      {activeSegment.aiInstructions.systemPrompt}
                    </p>
                  </div>

                  {/* Fed PDF Knowledge representation */}
                  <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
                    <span className="text-[10px] font-mono font-bold text-[#71717A] uppercase tracking-wider block mb-2.5">
                      🧠 DADOS INJETADOS NO CÉREBRO DA IA (PDF / REGRAS):
                    </span>
                    <div className="flex flex-col gap-2">
                      {activeSegment.aiInstructions.knowledges.map((k, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-[#3F3F46]">
                          <Check size={12} className="text-brand-teal-500 mt-0.5 flex-shrink-0" />
                          <span>{k}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom detail banner */}
                <div className="mt-5 pt-4 border-t border-[#E4E4E7] text-[11px] text-[#71717A] flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-teal-500" />
                  <span>Suba qualquer PDF ou site. A IA lê e responde conforme seu script em segundos.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
