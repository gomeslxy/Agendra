// app/onboarding/components/steps/step-canais.tsx
"use client";

import type { OnboardingData } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const CHANNELS: { value: "whatsapp" | "instagram" | "form"; label: string; emoji: string }[] = [
  { value: "whatsapp", label: "WhatsApp", emoji: "💬" },
  { value: "instagram", label: "Instagram DM", emoji: "📸" },
  { value: "form", label: "Formulário Web", emoji: "📋" },
];

export function StepCanais({ data, onChange }: StepProps) {
  const selected = data.channels ?? [];

  function toggleChannel(ch: "whatsapp" | "instagram" | "form") {
    const next = selected.includes(ch)
      ? selected.filter((c) => c !== ch)
      : [...selected, ch];
    onChange({ channels: next });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Canais */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Canais onde seus leads chegam
        </label>
        <div className="flex flex-col gap-1.5">
          {CHANNELS.map(({ value, label, emoji }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleChannel(value)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                selected.includes(value)
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              <span className="text-lg">{emoji}</span>
              <span className="text-sm font-medium">{label}</span>
              <span className="ml-auto text-xs opacity-50">
                {selected.includes(value) ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* CRM */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Usa algum CRM hoje?
        </label>
        <div className="flex gap-2">
          {[
            { value: true, label: "Sim" },
            { value: false, label: "Não" },
          ].map(({ value, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ uses_crm: value, crm_name: value ? data.crm_name : undefined })}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
                data.uses_crm === value
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                  : "border-[#E4E4E7] bg-white text-[#71717A] hover:border-[#D4D4D8] hover:bg-[#F4F4F5] hover:text-[#3F3F46]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {data.uses_crm && (
          <input
            type="text"
            placeholder="Qual CRM? (ex: RD Station, HubSpot)"
            value={data.crm_name ?? ""}
            onChange={(e) => onChange({ crm_name: e.target.value })}
            className="w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#09090B] placeholder:text-[#A1A1AA] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
          />
        )}
      </div>
    </div>
  );
}
