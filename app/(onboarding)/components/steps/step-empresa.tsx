// app/(onboarding)/components/steps/step-empresa.tsx
"use client";

import type { OnboardingData, BusinessSize } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const SIZES: { value: BusinessSize; label: string; desc: string }[] = [
  { value: "solo", label: "Só eu", desc: "Trabalho sozinho(a)" },
  { value: "small", label: "Pequena", desc: "2 a 10 pessoas" },
  { value: "medium", label: "Média", desc: "11 a 50 pessoas" },
  { value: "large", label: "Grande", desc: "Mais de 50" },
];

const NICHES = [
  "Clínica / Saúde",
  "Salão de Beleza",
  "Imobiliária",
  "Consultoria",
  "Educação",
  "Advocacia",
  "E-commerce",
  "Agência",
  "Academia / Fitness",
  "Outro",
];

export function StepEmpresa({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Nome */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Nome da empresa
        </label>
        <input
          type="text"
          placeholder="Ex: Studio Bella"
          value={data.company_name ?? ""}
          onChange={(e) => onChange({ company_name: e.target.value })}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        />
      </div>

      {/* Nicho */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Segmento / Nicho
        </label>
        <select
          value={data.niche ?? ""}
          onChange={(e) => onChange({ niche: e.target.value })}
          className="w-full rounded-xl border border-white/[0.08] bg-[rgb(11,18,34)] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        >
          <option value="" disabled>Selecione...</option>
          {NICHES.map((n) => (
            <option key={n} value={n.toLowerCase()}>{n}</option>
          ))}
        </select>
      </div>

      {/* Porte */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Porte da operação
        </label>
        <div className="grid grid-cols-2 gap-2">
          {SIZES.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ size: value })}
              className={`flex flex-col rounded-xl border p-3 text-left transition ${
                data.size === value
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs opacity-60">{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
