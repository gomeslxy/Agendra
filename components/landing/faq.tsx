import { FadeUp } from "@/components/motion/fade-up";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Preciso de um número de WhatsApp novo para usar o Agendra?",
    a: "Não. Você pode utilizar o seu número comercial atual normalmente. A nossa integração utiliza conexões seguras oficiais da Meta que mantêm suas conversas ativas e não interferem no uso cotidiano.",
  },
  {
    q: "Como a IA sabe quais são os horários disponíveis na minha agenda?",
    a: "Nós nos conectamos diretamente ao seu calendário (Google Calendar ou Outlook). A IA consulta as datas e horários livres em tempo real e nunca agenda compromissos em horários já ocupados ou bloqueados por você.",
  },
  {
    q: "A IA pode responder dúvidas específicas do meu produto ou serviço?",
    a: "Sim. Você faz o upload do seu 'Cérebro da IA' (arquivos PDF, regras de negócio, tabelas de preço ou links do seu site) e a IA responde as dúvidas técnicas com precisão absoluta, no tom de voz da sua marca.",
  },
  {
    q: "O que acontece se a IA não souber responder uma pergunta complexa?",
    a: "A IA é configurada para fazer o transbordo para humanos de forma natural. Ela responde educadamente ao lead (\"Vou confirmar essa informação com meu time...\") e notifica sua equipe instantaneamente pelo painel para que um atendente assuma o chat.",
  },
  {
    q: "É muito difícil de configurar?",
    a: "Não. A maioria dos nossos clientes coloca o Agendra para funcionar em menos de 15 minutos. A interface é visual, simples e não exige nenhuma linha de código ou conhecimento técnico.",
  },
  {
    q: "Como funcionam os 7 dias grátis? Preciso inserir cartão de crédito?",
    a: "O teste de 7 dias é totalmente gratuito e livre de barreiras. Você não precisa inserir dados de cartão de crédito para começar a usar. Se após o período você decidir não continuar, sua conta é pausada automaticamente, sem qualquer cobrança.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative py-24" aria-label="Dúvidas frequentes">
      <div className="mx-auto max-w-[800px] px-6">
        <FadeUp>
          <div className="eyebrow mb-3 text-center">DÚVIDAS FREQUENTES</div>
          <h2 className="mb-12 text-center text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Perguntas comuns sobre a Agendra
          </h2>
        </FadeUp>

        <FadeUp delay={0.1}>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className="border-white/10">
                <AccordionTrigger className="text-left text-lg font-medium hover:no-underline hover:text-brand-blue-400">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-fg-2 leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeUp>
      </div>
    </section>
  );
}
