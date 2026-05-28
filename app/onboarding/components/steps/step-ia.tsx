// app/onboarding/components/steps/step-ia.tsx
"use client";

import type { OnboardingData, AiTone } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const TONES: { value: AiTone; label: string; example: string }[] = [
  { value: "friendly", label: "Amigável", example: '"Olá! Que bom te ver aqui 😊"' },
  { value: "formal", label: "Formal", example: '"Prezado cliente, como posso ajudar?"' },
  { value: "direct", label: "Direto", example: '"Como posso te ajudar?"' },
  { value: "warm", label: "Caloroso", example: '"Seja muito bem-vindo! Vamos lá?"' },
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

export function StepIA({ data, onChange }: StepProps) {
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
          Nome da sua IA
        </label>
        <input
          type="text"
          placeholder="Ex: Sofia, Ana, Max..."
          value={data.ai_name ?? ""}
          onChange={(e) => onChange({ ai_name: e.target.value })}
          className="w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#09090B] placeholder:text-[#A1A1AA] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
        />
      </div>

      {/* Tom */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Tom de comunicação
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TONES.map(({ value, label, example }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ai_tone: value })}
              className={`flex flex-col rounded-xl border p-3 text-left transition ${
                data.ai_tone === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              <span className="text-sm font-semibold">{label}</span>
              <span className="mt-0.5 text-xs opacity-75 leading-snug">{example}</span>
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
          className="w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#09090B] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
        >
          {TIMEZONES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Horário de funcionamento */}
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
    </div>
  );
}
