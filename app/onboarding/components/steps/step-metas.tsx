// app/onboarding/components/steps/step-metas.tsx
"use client";

import type { OnboardingData, PrimaryMetric } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const METRICS: { value: PrimaryMetric; label: string; desc: string }[] = [
  { value: "leads", label: "Volume de leads", desc: "Quero captar mais contatos" },
  { value: "appointments", label: "Agendamentos", desc: "Quero lotar minha agenda" },
  { value: "conversions", label: "Conversões", desc: "Quero fechar mais vendas" },
  { value: "revenue", label: "Receita", desc: "Quero aumentar o faturamento" },
];

const TEAM_OPTIONS = [
  { value: 1, label: "Só eu" },
  { value: 3, label: "2–5" },
  { value: 10, label: "6–20" },
  { value: 30, label: "20+" },
];

export function StepMetas({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Equipe */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Tamanho da equipe comercial
        </label>
        <div className="grid grid-cols-4 gap-2">
          {TEAM_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ team_size: value })}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                data.team_size === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Métrica */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Sua principal métrica de sucesso
        </label>
        <div className="flex flex-col gap-1.5">
          {METRICS.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ primary_metric: value })}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                data.primary_metric === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs opacity-75">{desc}</p>
              </div>
              {data.primary_metric === value && (
                <span className="ml-auto text-[#2563EB] font-bold text-sm">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
