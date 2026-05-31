"use client";

import {
  CalendarCheck,
  Filter,
  MessageCircle,
  Zap,
  Brain,
  Repeat,
  LayoutDashboard,
} from "lucide-react";
import { FadeUp } from "@/components/motion/fade-up";
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid";

const ITEMS = [
  { 
    Icon: Zap,           
    t: "Resposta em 4 segundos",     
    d: "O lead recebe atenção imediata, no momento em que está mais propenso a comprar. Velocidade que liquida a concorrência.",
    span: "md:col-span-4"
  },
  { 
    Icon: Brain, 
    t: "Cérebro da IA",   
    d: "Suba PDFs, preços e dados da sua empresa. A IA responde dúvidas complexas como um especialista.",
    span: "md:col-span-2"
  },
  { 
    Icon: Filter,        
    t: "Filtro de Curiosos",  
    d: "A IA qualifica o lead de forma humanizada e direciona para o comercial apenas quem realmente tem interesse.",
    span: "md:col-span-2"
  },
  { 
    Icon: CalendarCheck, 
    t: "Agendamento Direto",
    d: "Sincronização em tempo real com seu Google Calendar ou Outlook. Sem conflitos, sem trabalho manual.",
    span: "md:col-span-4"
  },
  { 
    Icon: Repeat,     
    t: "Follow-up Proativo",  
    d: "O lead sumiu da conversa? A IA envia acompanhamentos inteligentes para resgatar a oportunidade de venda.",
    span: "md:col-span-3"
  },
  { 
    Icon: LayoutDashboard,   
    t: "Painel de Vendas Único",         
    d: "Monitore os agendamentos, o histórico de conversas e as estatísticas de conversão em tempo real.",
    span: "md:col-span-3"
  },
];

export function Benefits() {
  return (
    <section id="recursos" className="relative py-24" aria-label="Benefícios e recursos">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeUp>
          <div className="eyebrow mb-3">BENEFÍCIOS</div>
          <h2 className="mb-12 max-w-[720px] text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Trabalho de equipe inteira, <br />
            <span className="text-[#2563EB]">sem contratar ninguém.</span>
          </h2>
        </FadeUp>

        <BentoGrid>
          {ITEMS.map((b, i) => (
            <BentoCard
              key={b.t}
              index={i}
              title={b.t}
              description={b.d}
              icon={<b.Icon size={24} />}
              className={b.span}
            />
          ))}
        </BentoGrid>
      </div>
    </section>
  );
}
