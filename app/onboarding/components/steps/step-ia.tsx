// app/onboarding/components/steps/step-ia.tsx
"use client";

import { useState } from "react";
import type { OnboardingData, AiTone } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

// Tones aligned 1:1 with engine TONE_BLUEPRINTS (cold/warm/hot)
const TONES: { value: AiTone; label: string; badge: string; example: string }[] = [
  {
    value: "cold",
    label: "Formal",
    badge: "Corporativo",
    example: "\"Prezado cliente, segue a disponibilidade para esta semana.\"",
  },
  {
    value: "warm",
    label: "Acolhedor",
    badge: "Equilibrado",
    example: "\"Oi! Que bom falar com você 😊 Vamos ver o melhor horário?\"",
  },
  {
    value: "hot",
    label: "Persuasivo",
    badge: "Vendas",
    example: "\"Perfeito! Só tenho 2 vagas hoje ⚡ Posso garantir a sua?\"",
  },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Campo_Grande", label: "Campo Grande (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4)" },
  { value: "America/Boa_Vista", label: "Boa Vista (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
];

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const DEFAULT_HOURS: Record<string, [string, string]> = {
  mon: ["09:00", "18:00"],
  tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"],
  thu: ["09:00", "18:00"],
  fri: ["09:00", "18:00"],
};

const SLOT_DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30" },
  { value: 120, label: "2 horas" },
];

const BUFFER_OPTIONS = [
  { value: 0, label: "Sem intervalo" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
];

const inputCls =
  "w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#09090B] placeholder:text-[#A1A1AA] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all";

const textareaCls =
  "w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#09090B] placeholder:text-[#A1A1AA] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all resize-none";

export function StepIA({ data, onChange }: StepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const wh = data.working_hours ?? DEFAULT_HOURS;
  const activeDays = Object.keys(wh);

  function toggleDay(key: string) {
    const next = { ...wh };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = ["09:00", "18:00"];
    }
    onChange({ working_hours: Object.keys(next).length > 0 ? next : DEFAULT_HOURS });
  }

  function setTime(field: 0 | 1, value: string) {
    const next: Record<string, [string, string]> = {};
    for (const [day, range] of Object.entries(wh)) {
      next[day] = field === 0 ? [value, range[1]] : [range[0], value];
    }
    onChange({ working_hours: next });
  }

  const firstEntry = Object.values(wh)[0] ?? ["09:00", "18:00"];

  return (
    <div className="flex flex-col gap-5">
      {/* Nome da IA */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Nome da sua IA <span className="text-[#DC2626]">*</span>
        </label>
        <input
          type="text"
          placeholder="Ex: Sofia, Ana, Max..."
          value={data.ai_name ?? ""}
          onChange={(e) => onChange({ ai_name: e.target.value })}
          className={inputCls}
        />
        <p className="text-xs text-[#A1A1AA]">Seu cliente vai ver esse nome em todas as conversas.</p>
      </div>

      {/* Tom */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Tom de comunicação <span className="text-[#DC2626]">*</span>
        </label>
        <div className="flex flex-col gap-1.5">
          {TONES.map(({ value, label, badge, example }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ai_tone: value })}
              className={`flex flex-col rounded-xl border px-4 py-3 text-left transition ${
                data.ai_tone === value
                  ? "border-[#2563EB] bg-[#EFF6FF]"
                  : "border-[#E4E4E7] bg-white hover:border-[#D4D4D8] hover:bg-[#F4F4F5]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-semibold ${data.ai_tone === value ? "text-[#1D4ED8]" : "text-[#09090B]"}`}>
                  {label}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  data.ai_tone === value
                    ? "bg-[#2563EB] text-white"
                    : "bg-[#F4F4F5] text-[#71717A]"
                }`}>
                  {badge}
                </span>
              </div>
              <span className={`text-xs leading-snug italic ${data.ai_tone === value ? "text-[#3B82F6]" : "text-[#A1A1AA]"}`}>
                {example}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Fuso horário */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Fuso horário
        </label>
        <select
          value={data.timezone ?? "America/Sao_Paulo"}
          onChange={(e) => onChange({ timezone: e.target.value })}
          className={inputCls}
        >
          {TIMEZONES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Dias de funcionamento */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Dias de atendimento
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleDay(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                activeDays.includes(key)
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-1">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-[#71717A]">Início</label>
            <input
              type="time"
              value={firstEntry[0]}
              onChange={(e) => setTime(0, e.target.value)}
              className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
            />
          </div>
          <span className="text-[#A1A1AA] mt-5">–</span>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-[#71717A]">Fim</label>
            <input
              type="time"
              value={firstEntry[1]}
              onChange={(e) => setTime(1, e.target.value)}
              className="rounded-xl border border-[#E4E4E7] bg-white px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Duração dos atendimentos */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Duração padrão de cada atendimento
        </label>
        <div className="flex gap-2 flex-wrap">
          {SLOT_DURATIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ slot_duration_minutes: value })}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                (data.slot_duration_minutes ?? 60) === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Intervalo entre atendimentos */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Intervalo entre atendimentos
        </label>
        <div className="flex gap-2 flex-wrap">
          {BUFFER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ buffer_minutes: value })}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                (data.buffer_minutes ?? 0) === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Configurações avançadas */}
      <div className="border-t border-[#F4F4F5] pt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-[#71717A] hover:text-[#3F3F46] transition flex items-center gap-1"
        >
          <span>{showAdvanced ? "▲" : "▼"}</span>
          Personalizar instruções da IA {showAdvanced ? "(fechar)" : "(opcional)"}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-4 mt-4">
            {/* Instruções extras */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
                Instruções adicionais para a IA
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Sempre perguntar se o cliente tem plano de saúde. Mencionar que temos estacionamento gratuito."
                value={data.extra_instructions ?? ""}
                onChange={(e) => onChange({ extra_instructions: e.target.value })}
                className={textareaCls}
              />
              <p className="text-xs text-[#A1A1AA]">Regras específicas do seu negócio que a IA deve sempre seguir.</p>
            </div>

            {/* Proibições */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
                O que a IA NÃO deve fazer
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Nunca mencionar concorrentes. Nunca prometer desconto sem aprovação."
                value={data.ai_forbidden ?? ""}
                onChange={(e) => onChange({ ai_forbidden: e.target.value })}
                className={textareaCls}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
