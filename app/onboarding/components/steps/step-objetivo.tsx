// app/onboarding/components/steps/step-objetivo.tsx
"use client";

import type { OnboardingData, BusinessGoal, BusinessMaturity } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const GOALS: { value: BusinessGoal; label: string; emoji: string }[] = [
  { value: "capture", label: "Captar leads", emoji: "🎯" },
  { value: "nurture", label: "Nutrir contatos", emoji: "🌱" },
  { value: "qualify", label: "Qualificar leads", emoji: "🔍" },
  { value: "convert", label: "Converter em vendas", emoji: "💰" },
  { value: "follow", label: "Acompanhar pós-venda", emoji: "🤝" },
];

const MATURITIES: { value: BusinessMaturity; label: string; desc: string }[] = [
  { value: "beginner", label: "Iniciante", desc: "Estou começando agora" },
  { value: "intermediate", label: "Intermediário", desc: "Já tenho algum processo" },
  { value: "advanced", label: "Avançado", desc: "Processo estruturado" },
];

export function StepObjetivo({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Objetivo */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Objetivo principal
        </label>
        <div className="flex flex-col gap-1.5">
          {GOALS.map(({ value, label, emoji }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ goal: value })}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                data.goal === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              <span className="text-lg">{emoji}</span>
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Maturidade */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Maturidade comercial
        </label>
        <div className="grid grid-cols-3 gap-2">
          {MATURITIES.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ maturity: value })}
              className={`flex flex-col rounded-xl border p-3 text-left transition ${
                data.maturity === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
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
