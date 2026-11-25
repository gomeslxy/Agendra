"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { updatePersona } from "../actions";
import { Field, ReadOnlyBanner } from "../components/settings-shared";
import type { SettingsCompany } from "../types";

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Campo_Grande", label: "Campo Grande (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
];

const DAYS_CONFIG = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const DEFAULT_WH: Record<string, [string, string]> = {
  mon: ["09:00", "18:00"],
  tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"],
  thu: ["09:00", "18:00"],
  fri: ["09:00", "18:00"],
};

const SLOT_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2 horas" },
];

function WorkingHoursEditor({
  value,
  onChange,
}: {
  value: Record<string, [string, string]>;
  onChange: (v: Record<string, [string, string]>) => void;
}) {
  const activeDays = Object.keys(value);

  function toggleDay(key: string) {
    const next = { ...value };
    if (next[key]) {
      if (Object.keys(next).length === 1) {
        toast.warning("Mantenha ao menos 1 dia ativo. Para pausar tudo, use o controle de pausa da IA.");
        return;
      }
      delete next[key];
    } else {
      const anyDay = Object.values(value)[0] ?? ["09:00", "18:00"];
      next[key] = [anyDay[0], anyDay[1]];
    }
    onChange(next);
  }

  function setDayTime(day: string, field: 0 | 1, v: string) {
    const current = value[day] ?? ["09:00", "18:00"];
    const next = { ...value };
    next[day] = field === 0 ? [v, current[1]] : [current[0], v];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {DAYS_CONFIG.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleDay(key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              activeDays.includes(key)
                ? "border-brand-blue-500/50 bg-brand-blue-500/10 text-[#09090B]"
                : "border-[#E4E4E7] bg-[#FAFAFA] text-[#71717A] hover:text-[#3F3F46]",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {activeDays.length > 0 && (
        <div className="flex flex-col gap-2">
          {DAYS_CONFIG.filter((d) => activeDays.includes(d.key)).map(({ key, label }) => {
            const [start, end] = value[key] ?? ["09:00", "18:00"];
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[11px] w-8 shrink-0 text-[#71717A] font-medium">{label}</span>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setDayTime(key, 0, e.target.value)}
                  className="flex-1 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-2 py-1.5 text-xs text-[#09090B] outline-none focus:border-[#2563EB]"
                />
                <span className="text-[#A1A1AA] text-xs">–</span>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setDayTime(key, 1, e.target.value)}
                  className="flex-1 rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] px-2 py-1.5 text-xs text-[#09090B] outline-none focus:border-[#2563EB]"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RulesHoursTab({
  company,
  isReadOnly = false,
}: {
  company: SettingsCompany | null;
  isReadOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pc = company?.persona_config ?? {};
  const [workingHours, setWorkingHours] = useState<Record<string, [string, string]>>(
    pc.working_hours ?? DEFAULT_WH,
  );
  const [escalationThreshold, setEscalationThreshold] = useState(pc.escalation_threshold ?? 25);
  const [autoEscalate, setAutoEscalate] = useState(pc.auto_escalate ?? false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("working_hours", JSON.stringify(workingHours));
    formData.set("escalation_threshold", String(escalationThreshold));
    formData.set("auto_escalate", String(autoEscalate));

    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await updatePersona(formData);
        setSaved(true);
        toast.success("Regras operacionais salvas!");
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao salvar regras";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {isReadOnly && <ReadOnlyBanner />}
      <fieldset disabled={isReadOnly} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>Regras Operacionais</CardTitle>
            <CardDescription>Quando a IA age, quando escala e como se organiza.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[13px] font-bold">Escalar lead frio para humano</div>
                  <div className="text-[11px] mt-0.5 text-[#71717A]">
                    IA pausa atendimento automaticamente quando score cai abaixo do limite
                  </div>
                </div>
                <Switch checked={autoEscalate} onChange={setAutoEscalate} label="Auto-escalar" disabled={isReadOnly} />
              </div>
              {autoEscalate && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#71717A]">Escalar quando score abaixo de:</span>
                    <span className="font-mono text-sm font-bold text-[#2563EB]">{escalationThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={escalationThreshold}
                    onChange={(e) => setEscalationThreshold(Number(e.target.value))}
                    className="w-full accent-brand-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-[#71717A]">
                    <span>5 (só muito frio)</span>
                    <span>50 (qualquer morno)</span>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duração do slot">
                <select
                  name="slot_duration_minutes"
                  defaultValue={pc.slot_duration_minutes ?? 60}
                  className="w-full rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB]"
                >
                  {SLOT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fuso horário">
                <select
                  name="timezone"
                  defaultValue={pc.timezone ?? "America/Sao_Paulo"}
                  className="w-full rounded-xl border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-sm text-[#09090B] outline-none focus:border-[#2563EB]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Horário de atendimento">
              <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
            </Field>

            {error && <p className="mb-4 text-xs text-red-500 font-medium mt-4">{error}</p>}
            <Button type="submit" variant="blue" size="sm" className="w-full font-bold h-10 mt-4" disabled={pending}>
              {saved ? (
                <>
                  <Check size={14} className="mr-2" /> Salvo ✓
                </>
              ) : pending ? (
                "Salvando…"
              ) : (
                "Salvar regras"
              )}
            </Button>
          </CardContent>
        </Card>
      </fieldset>
    </form>
  );
}
