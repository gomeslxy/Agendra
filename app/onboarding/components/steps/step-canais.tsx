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
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
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
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
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
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
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
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
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
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
        )}
      </div>
    </div>
  );
}
