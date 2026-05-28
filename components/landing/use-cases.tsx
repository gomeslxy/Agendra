import {
  Briefcase,
  Dumbbell,
  GraduationCap,
  Home,
  Stethoscope,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { FadeUp } from "@/components/motion/fade-up";

interface Case {
  Icon: LucideIcon;
  t: string;
  d: string;
}

const CASES: Case[] = [
  { Icon: Stethoscope,   t: "Clínicas",     d: "Estética, odonto, dermato." },
  { Icon: Dumbbell,      t: "Academias",    d: "Avaliação grátis virou marcação." },
  { Icon: Home,          t: "Imobiliárias", d: "Visitas agendadas no automático." },
  { Icon: GraduationCap, t: "Cursos",       d: "Inscrições qualificadas em horas." },
  { Icon: Briefcase,     t: "Serviços B2B", d: "Reuniões com SQLs reais." },
  { Icon: Utensils,      t: "Restaurantes", d: "Reservas direto do Instagram." },
];

export function UseCases() {
  return (
    <section id="casos" className="relative py-24" aria-label="Casos de uso">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeUp>
          <div className="eyebrow mb-3">CASOS DE USO</div>
          <h2 className="mb-9 max-w-[720px] text-balance text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-0.02em]">
            Quem já vende por chat já pode usar.
          </h2>
        </FadeUp>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASES.map((c, i) => (
            <FadeUp key={c.t} delay={i * 0.06}>
              <div className="glass group flex h-full min-h-[160px] flex-col justify-between p-6 transition-transform duration-200 hover:-translate-y-1">
                <c.Icon size={22} className="text-[#14B8A6]" />
                <div>
                  <h3 className="mt-3 text-[#09090B] text-xl font-semibold">{c.t}</h3>
                  <div className="text-sm" style={{ color: "var(--color-fg-2)" }}>{c.d}</div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
