// app/onboarding/components/steps/step-metas.tsx
"use client";

import type { OnboardingData, PrimaryMetric } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const METRICS: { value: PrimaryMetric; label: string; desc: string; emoji: string }[] = [
  { value: "leads", label: "Volume de leads", desc: "Quero captar mais contatos", emoji: "📈" },
  { value: "appointments", label: "Agendamentos", desc: "Quero lotar minha agenda", emoji: "📅" },
  { value: "conversions", label: "Conversões", desc: "Quero fechar mais vendas", emoji: "💰" },
  { value: "revenue", label: "Receita", desc: "Quero aumentar o faturamento", emoji: "🚀" },
];

const TEAM_OPTIONS = [
  { value: 1, label: "Só eu" },
  { value: 3, label: "2–5" },
  { value: 10, label: "6–20" },
  { value: 30, label: "20+" },
];

const FOLLOWUP_DELAYS = [
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "1 dia" },
  { value: 48, label: "2 dias" },
];

const FOLLOWUP_RETRIES = [
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
];

export function StepMetas({ data, onChange }: StepProps) {
  const followupEnabled = data.enable_followup ?? true;

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
          Principal métrica de sucesso
        </label>
        <div className="flex flex-col gap-1.5">
          {METRICS.map(({ value, label, desc, emoji }) => (
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
              <span className="text-base">{emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs opacity-75">{desc}</p>
              </div>
              {data.primary_metric === value && (
                <span className="text-[#2563EB] font-bold text-sm">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Follow-up automático */}
      <div className="flex flex-col gap-3 border border-[#E4E4E7] rounded-2xl p-4 bg-[#FAFAFA]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#09090B]">Follow-up automático</p>
            <p className="text-xs text-[#71717A]">A IA reentra em contato com leads que pararam de responder.</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ enable_followup: !followupEnabled })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              followupEnabled ? "bg-[#2563EB]" : "bg-[#D4D4D8]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                followupEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {followupEnabled && (
          <div className="flex flex-col gap-3 pt-2 border-t border-[#E4E4E7]">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#71717A]">Aguardar antes de reencontrar</label>
              <div className="flex gap-2 flex-wrap">
                {FOLLOWUP_DELAYS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onChange({ followup_delay_hours: value })}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      (data.followup_delay_hours ?? 24) === value
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                        : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#71717A]">Máximo de tentativas</label>
              <div className="flex gap-2">
                {FOLLOWUP_RETRIES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onChange({ followup_max_retries: value })}
                    className={`rounded-lg border px-4 py-1.5 text-xs font-medium transition ${
                      (data.followup_max_retries ?? 2) === value
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                        : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
