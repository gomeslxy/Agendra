// app/(onboarding)/components/steps/step-metas.tsx
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
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
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
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Métrica */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
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
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs opacity-50">{desc}</p>
              </div>
              {data.primary_metric === value && (
                <span className="ml-auto text-violet-400 text-sm">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
