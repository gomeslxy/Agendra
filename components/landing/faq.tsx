import { FadeUp } from "@/components/motion/fade-up";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "A Agendra funciona em quais canais?",
    a: "Atualmente, a Agendra integra-se nativamente com WhatsApp e Instagram (Direct). Também fornecemos widgets para sites e suporte a formulários de captura de leads.",
  },
  {
    q: "Como a IA sabe os horários disponíveis?",
    a: "Nós nos conectamos diretamente ao seu calendário (Google Calendar ou Outlook). A IA verifica a disponibilidade em tempo real e nunca marca reuniões em horários ocupados.",
  },
  {
    q: "A IA pode responder dúvidas técnicas sobre o meu serviço?",
    a: "Sim. Você faz o upload do seu 'Cérebro' (documentos, manuais, lista de preços) e a Agendra usa essas informações para responder com precisão, seguindo o tom de voz da sua marca.",
  },
  {
    q: "O que acontece se o lead fizer uma pergunta que a IA não sabe responder?",
    a: "A Agendra é treinada para ser honesta. Se ela encontrar algo fora do seu escopo de conhecimento, ela notifica sua equipe humana imediatamente para assumir a conversa.",
  },
  {
    q: "É difícil de configurar?",
    a: "Não. A maioria dos nossos clientes coloca a Agendra para rodar em menos de 15 minutos. Basta conectar o WhatsApp e subir seus dados básicos.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative py-24">
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
