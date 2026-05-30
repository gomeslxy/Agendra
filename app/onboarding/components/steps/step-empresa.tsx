// app/onboarding/components/steps/step-empresa.tsx
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
  "Barbearia",
  "Imobiliária",
  "Consultoria",
  "Educação",
  "Advocacia",
  "E-commerce",
  "Agência",
  "Academia / Fitness",
  "Psicologia",
  "Odontologia",
  "Nutrição",
  "Personal Trainer",
  "Outro",
];

const inputCls =
  "w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-3 text-sm text-[#09090B] placeholder:text-[#A1A1AA] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 transition-all";

export function StepEmpresa({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Nome */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Nome da empresa <span className="text-[#DC2626]">*</span>
        </label>
        <input
          type="text"
          placeholder="Ex: Studio Bella"
          value={data.company_name ?? ""}
          onChange={(e) => onChange({ company_name: e.target.value })}
          className={inputCls}
        />
      </div>

      {/* Nicho */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
          Segmento / Nicho <span className="text-[#DC2626]">*</span>
        </label>
        <select
          value={data.niche ?? ""}
          onChange={(e) => onChange({ niche: e.target.value })}
          className={inputCls}
        >
          <option value="" disabled>Selecione...</option>
          {NICHES.map((n) => (
            <option key={n} value={n.toLowerCase()}>{n}</option>
          ))}
        </select>
      </div>

      {/* Cidade + Telefone */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
            Cidade
          </label>
          <input
            type="text"
            placeholder="São Paulo"
            value={data.city ?? ""}
            onChange={(e) => onChange({ city: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
            Telefone
          </label>
          <input
            type="tel"
            placeholder="(11) 91234-5678"
            value={data.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      {/* Porte */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#3F3F46] uppercase tracking-widest">
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
