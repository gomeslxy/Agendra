"use client";

import {
  BarChart3,
  CalendarCheck,
  Filter,
  MessageCircle,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { FadeUp } from "@/components/motion/fade-up";
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid";

const ITEMS = [
  { 
    Icon: Zap,           
    t: "Resposta em 4 segundos",     
    d: "O lead recebe atenção instantânea, antes mesmo de pensar em procurar a concorrência. Velocidade que converte.",
    span: "md:col-span-4"
  },
  { 
    Icon: MessageCircle, 
    t: "Tom da sua marca",   
    d: "Personalidade consistente em cada interação.",
    span: "md:col-span-2"
  },
  { 
    Icon: Filter,        
    t: "Qualificação Automática",  
    d: "A Agendra identifica leads prontos para fechar e descarta os curiosos.",
    span: "md:col-span-2"
  },
  { 
    Icon: CalendarCheck, 
    t: "Agendamento Direto",
    d: "Sincronização em tempo real com seu Google Calendar. Sem conflitos, sem trabalho manual.",
    span: "md:col-span-4"
  },
  { 
    Icon: BarChart3,     
    t: "Métricas Reais",  
    d: "Dashboards precisos sobre conversão e performance.",
    span: "md:col-span-3"
  },
  { 
    Icon: ShieldCheck,   
    t: "Segurança Bancária",         
    d: "Criptografia de ponta a ponta e total conformidade com a LGPD.",
    span: "md:col-span-3"
  },
];

export function Benefits() {
  return (
    <section id="recursos" className="relative py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeUp>
          <div className="eyebrow mb-3">BENEFÍCIOS</div>
          <h2 className="mb-12 max-w-[720px] text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Trabalho de equipe inteira, <br />
            <span className="text-brand-blue-400">sem contratar ninguém.</span>
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
