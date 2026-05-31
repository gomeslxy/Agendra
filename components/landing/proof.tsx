"use client";

import { motion } from "framer-motion";
import { Glass } from "@/components/ui/glass";
import { StaggerGroup } from "@/components/motion/stagger-group";
import { fadeUp } from "@/components/motion/variants";

const STATS = [
  { v: "100", s: "%", l: "SINC. COM AGENDA", color: "#F97316" }, // brand-orange-500
  { v: "4",   s: "s", l: "RESPOSTA MÉDIA",    color: "#14B8A6" }, // brand-teal-500
  { v: "15",  s: "min", l: "SETUP INICIAL",   color: "#2563EB" }, // brand-blue-600
  { v: "24/7", s: "", l: "DISPONIBILIDADE",   color: "#09090B" }, // fg-1
];

export function Proof() {
  return (
    <section className="relative py-12 border-y border-[#E4E4E7] bg-white" aria-label="Estatísticas de resultado">
      <div className="mx-auto max-w-[1200px] px-6">
        <StaggerGroup className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <motion.div
              key={s.l}
              variants={fadeUp}
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <Glass className="p-5 flex flex-col items-center text-center bg-[#FAFAFA] border-[#E4E4E7] shadow-sm rounded-xl">
                <div
                  className="text-[clamp(32px,4vw,44px)] font-extrabold leading-none tracking-[-0.03em]"
                  style={{ color: s.color }}
                >
                  {s.v}
                  {s.s && <span className="text-xl font-bold ml-0.5" style={{ color: "var(--color-fg-3)" }}>{s.s}</span>}
                </div>
                <div className="mt-1.5 font-mono text-[9px] font-bold tracking-wider text-[#71717A] uppercase">
                  {s.l}
                </div>
              </Glass>
            </motion.div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
