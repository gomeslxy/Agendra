"use client";

import { useEffect, useState, useTransition } from "react";
import React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Check,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  GitBranch,
  Slack,
  UserPlus,
  Cpu,
  MessageSquare,
  Users,
  CreditCard,
  Loader2,
  Zap,
  Clock,
  Briefcase,
  Plus,
  Trash2,
  Edit3,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updatePersona, saveWhatsAppChannel, completeWhatsAppOnboarding, disconnectWhatsAppChannel } from "./actions";
import { createService, updateService, deleteService } from "./services/actions";
import Script from "next/script";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { STRIPE_PRICE_IDS, PLANS_META } from "@/lib/billing/plans";
import type { PlanType } from "@/lib/billing/plans";

type TabId = "persona" | "services" | "channels" | "flows" | "team" | "billing";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "persona",  label: "Persona",   icon: Cpu },
  { id: "services", label: "Serviços",  icon: Briefcase },
  { id: "channels", label: "Canais",    icon: MessageSquare },
  { id: "flows",    label: "Fluxos",    icon: GitBranch },
  { id: "team",     label: "Time",      icon: Users },
  { id: "billing",  label: "Cobrança",  icon: CreditCard },
];

interface MemberUser {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

interface Member {
  id: string;
  role: string;
  company_id: string;
  users?: MemberUser | MemberUser[] | null;
}

interface PersonaConfig {
  business_type?: string;
  services?: string[];
  escalation_threshold?: number;
  auto_escalate?: boolean;
  slot_duration_minutes?: number;
  timezone?: string;
  working_hours?: Record<string, [string, string]>;
  extra_instructions?: string;
  name?: string;
  greeting?: string;
}

interface Company {
  id: string;
  name: string;
  ai_name?: string | null;
  ai_tone?: string | null;
  ai_greeting?: string | null;
  ai_forbidden?: string | null;
  persona_config?: PersonaConfig | null;
  plan_type?: PlanType | null;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  google_calendar_email?: string | null;
}

interface ChannelRow {
  id: string;
  provider: string;
  provider_id: string;
  status: string;
  last_error?: string | null;
}

interface Service {
  id: string;
  name: string;
  description?: string | null;
  duration: number;
  price?: number | null;
  active: boolean;
}

interface SettingsShellProps {
  company: Company | null;
  memberships: Member[];
  channels: ChannelRow[];
  services: Service[];
  usage: any;
}

export function SettingsShell({ company, memberships, channels, services, usage }: SettingsShellProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Tab state is local — no server round trip on tab switch.
  // Initialized from URL so deep-links and OAuth redirects work.
  const rawTab = searchParams.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>(() =>
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "persona"
  );

  function changeTab(newTab: TabId) {
    setTab(newTab);
    // Update URL without triggering RSC re-fetch (no router.replace here).
    window.history.replaceState({}, "", `/settings?tab=${newTab}`);
  }

  // OAuth callback toast (gcal=success|error|denied in searchParams after redirect).
  // router.replace here is intentional: cleans the gcal param from the URL.
  useEffect(() => {
    const gcal = searchParams.get("gcal");
    const stripe = searchParams.get("stripe");

    if (gcal === "success") {
      setToast({ msg: "Google Calendar conectado com sucesso! 🎉", type: "success" });
      setTab("channels");
      trackEvent("gcal_connected");
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (gcal === "error") {
      setToast({ msg: "Erro ao conectar Google Calendar. Tente novamente.", type: "error" });
      setTab("channels");
      trackEvent("gcal_failed", { reason: "error" });
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (gcal === "denied") {
      setToast({ msg: "Conexão com Google Calendar cancelada.", type: "error" });
      setTab("channels");
      trackEvent("gcal_failed", { reason: "denied" });
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (stripe === "success") {
      setToast({ msg: "Assinatura confirmada! Sua IA está turbinada. 🚀", type: "success" });
      setTab("billing");
      trackEvent("stripe_success");
      
      // Kaizen: Forçar sincronização imediata do estado local
      const sync = async () => {
        try {
          await fetch("/api/stripe/sync", { method: "POST" });
          router.refresh(); // Atualiza os dados do Server Component (usage, company)
        } catch (e) {
          console.error("Sync error:", e);
        }
      };
      sync();
      
      router.replace("/settings?tab=billing", { scroll: false });
    }
  }, [searchParams, router]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:px-8 lg:py-7 relative">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={cn(
              "fixed top-6 left-1/2 z-50 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-md border",
              toast.type === "success"
                ? "bg-brand-teal-500/10 text-brand-teal-300 border-brand-teal-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            )}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Configurações</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
          Personalize Agendra para seu negócio.
        </p>
      </header>

      <div className="relative mb-8 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => changeTab(t.id)}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-tight transition-all duration-300 outline-none cursor-pointer",
                active 
                  ? "text-white" 
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
              )}
            >
              <t.icon size={16} className={cn(
                "transition-transform duration-300 group-hover:scale-110",
                active ? "text-brand-blue-400" : "text-white/20 group-hover:text-white/40"
              )} />
              <span className="relative z-10">{t.label}</span>
              
              {active && (
                <motion.div
                  layoutId="active-tab-glow"
                  className="absolute inset-0 z-0 rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.05)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              
              {active && (
                <motion.div
                  layoutId="active-tab-underline"
                  className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-brand-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {tab === "persona"  && <Persona company={company} services={services} onChangeTab={changeTab} />}
        {tab === "services" && <Services companyId={company?.id} services={services} />}
        {tab === "channels" && <Channels company={company} channels={channels} />}
        {tab === "flows"    && <Flows />}
        {tab === "team"     && <Team memberships={memberships} />}
        {tab === "billing"  && <Billing company={company} usage={usage} />}
      </motion.div>
    </div>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: "var(--color-fg-3)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}


function ToneSelect({ defaultValue }: { defaultValue: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultValue);
  
  const options = [
    { value: "cold", label: "Formal", sub: "Direto e profissional", color: "bg-blue-400" },
    { value: "warm", label: "Amigável", sub: "Equilibrado e atencioso", color: "bg-yellow-400" },
    { value: "hot", label: "Persuasivo", sub: "Enérgico e focado em vendas", color: "bg-orange-400" },
  ];

  const current = options.find(o => o.value === selected) || options[1];

  return (
    <div className="relative">
      <input type="hidden" name="ai_tone" value={selected} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm transition-all hover:bg-white/10 focus:border-brand-blue-500/50 outline-none"
      >
        <div className="flex items-center gap-3">
          <div className={cn("h-2 w-2 rounded-full", current.color)} />
          <div className="text-left">
            <div className="font-bold text-white/90">{current.label}</div>
            <div className="text-[10px] text-white/40">{current.sub}</div>
          </div>
        </div>
        <GitBranch size={14} className={cn("text-white/20 transition-transform duration-300", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="absolute left-0 right-0 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl p-1.5 shadow-2xl shadow-black/50"
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setSelected(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
                    selected === o.value ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white/70"
                  )}
                >
                  <div className={cn("h-2 w-2 rounded-full", o.color)} />
                  <div className="text-left">
                    <div className="text-[13px] font-bold">{o.label}</div>
                    <div className="text-[10px] opacity-60">{o.sub}</div>
                  </div>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
const TIMEZONES = [
  { value: "America/Sao_Paulo",    label: "Brasília (GMT-3)" },
  { value: "America/Manaus",       label: "Manaus (GMT-4)" },
  { value: "America/Fortaleza",    label: "Fortaleza (GMT-3)" },
  { value: "America/Recife",       label: "Recife (GMT-3)" },
  { value: "America/Campo_Grande", label: "Campo Grande (GMT-4)" },
  { value: "America/Cuiaba",       label: "Cuiabá (GMT-4)" },
  { value: "America/Rio_Branco",   label: "Rio Branco (GMT-5)" },
];

const DAYS_CONFIG = [
  { key: "mon", label: "Seg" }, { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" }, { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" }, { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const DEFAULT_WH: Record<string, [string, string]> = {
  mon: ["09:00", "18:00"], tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"], thu: ["09:00", "18:00"],
  fri: ["09:00", "18:00"],
};

const SLOT_OPTIONS = [
  { value: 30, label: "30 min" }, { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" }, { value: 90, label: "1h30" },
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
  const firstEntry = Object.values(value)[0] ?? ["09:00", "18:00"];

  function toggleDay(key: string) {
    const next = { ...value };
    if (next[key]) { delete next[key]; }
    else { next[key] = [firstEntry[0], firstEntry[1]]; }
    onChange(Object.keys(next).length > 0 ? next : DEFAULT_WH);
  }

  function setTime(field: 0 | 1, v: string) {
    const next: Record<string, [string, string]> = {};
    for (const [day, range] of Object.entries(value)) {
      next[day] = field === 0 ? [v, range[1]] : [range[0], v];
    }
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
                ? "border-brand-blue-500/50 bg-brand-blue-500/10 text-white"
                : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Início</span>
          <input
            type="time"
            value={firstEntry[0]}
            onChange={(e) => setTime(0, e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-brand-blue-500/50"
          />
        </div>
        <span className="text-white/30 mt-5">–</span>
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Fim</span>
          <input
            type="time"
            value={firstEntry[1]}
            onChange={(e) => setTime(1, e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-brand-blue-500/50"
          />
        </div>
      </div>
    </div>
  );
}

function ServicesInput({ defaultValue }: { defaultValue: string }) {
  const [raw, setRaw] = useState(defaultValue);
  return (
    <div className="flex flex-col gap-1">
      <input
        name="services"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Ex.: corte, coloração, hidratação"
        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-brand-blue-500/50 focus:bg-white/[0.06]"
      />
      {raw && (
        <div className="flex flex-wrap gap-1 mt-1">
          {raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
            <span key={s} className="rounded-full border border-brand-teal-500/20 bg-brand-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-teal-300">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Persona({ 
  company, 
  services, 
  onChangeTab 
}: { 
  company: Company | null; 
  services: Service[];
  onChangeTab: (tab: TabId) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pc = company?.persona_config ?? {};
  const [workingHours, setWorkingHours] = useState<Record<string, [string, string]>>(
    (pc.working_hours as Record<string, [string, string]>) ?? DEFAULT_WH
  );
  const [escalationThreshold, setEscalationThreshold] = useState(pc.escalation_threshold ?? 25);
  const [autoEscalate, setAutoEscalate] = useState(pc.auto_escalate ?? false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Inject working_hours as JSON since it's controlled state
    formData.set("working_hours", JSON.stringify(workingHours));
    formData.set("escalation_threshold", String(escalationThreshold));
    formData.set("auto_escalate", String(autoEscalate));
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await updatePersona(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ── A1: Identidade ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Identidade</CardTitle>
          <CardDescription>Como a IA se apresenta e qual negócio representa.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da IA">
              <Input name="ai_name" defaultValue={company?.ai_name ?? "Agendra"} />
            </Field>
            <Field label="Tipo de negócio">
              <Input name="business_type" defaultValue={pc.business_type ?? ""} placeholder="Ex.: clínica estética, advocacia" />
            </Field>
          </div>
          <Field label="Saudação padrão">
            <Input name="ai_greeting" defaultValue={company?.ai_greeting ?? "Oi! Sou a Agendra 👋"} />
          </Field>
          <Field label="Tom padrão">
            <ToneSelect defaultValue={company?.ai_tone ?? "warm"} />
          </Field>
          <Field label="Serviços oferecidos">
            <div className="flex flex-col gap-2 rounded-xl border border-brand-blue-500/10 bg-brand-blue-500/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/60">Gerenciado na aba "Serviços"</span>
                <button 
                  type="button"
                  onClick={() => onChangeTab("services")}
                  className="text-[11px] font-bold text-brand-blue-400 hover:underline"
                >
                  Configurar →
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {services.length > 0 ? (
                  services.map((s) => (
                    <Badge key={s.id} variant="neutral" className="border-brand-blue-500/20 bg-brand-blue-500/10 text-brand-blue-300 text-[10px]">
                      {s.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[10px] text-white/20 italic">Nenhum serviço configurado.</span>
                )}
              </div>
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* ── A2: Regras Operacionais ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Regras Operacionais</CardTitle>
          <CardDescription>Quando a IA age, quando escala e como se organiza.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Auto-escalation */}
          <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[13px] font-bold">Escalar lead frio para humano</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--color-fg-3)" }}>
                  IA pausa atendimento automaticamente quando score cai abaixo do limite
                </div>
              </div>
              <Switch checked={autoEscalate} onChange={setAutoEscalate} label="Auto-escalar" />
            </div>
            {autoEscalate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>
                    Escalar quando score abaixo de:
                  </span>
                  <span className="font-mono text-sm font-bold text-brand-blue-400">{escalationThreshold}</span>
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
                <div className="flex justify-between text-[10px]" style={{ color: "var(--color-fg-3)" }}>
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
                className="w-full rounded-xl border border-white/[0.08] bg-[rgb(11,18,34)] px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500/50"
              >
                {SLOT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Fuso horário">
              <select
                name="timezone"
                defaultValue={pc.timezone ?? "America/Sao_Paulo"}
                className="w-full rounded-xl border border-white/[0.08] bg-[rgb(11,18,34)] px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500/50"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Horário de atendimento">
            <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
          </Field>
        </CardContent>
      </Card>

      {/* ── A3: Comportamento Conversacional ──────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Comportamento</CardTitle>
          <CardDescription>Instruções específicas para o seu negócio.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Instruções adicionais">
            <textarea
              name="extra_instructions"
              defaultValue={pc.extra_instructions ?? ""}
              placeholder={"Ex.: Sempre mencionar que a consulta inicial é gratuita.\nNunca citar concorrentes pelo nome.\nSe cliente perguntar sobre preço antes de agendar, dizer que depende da avaliação."}
              rows={4}
              maxLength={800}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none resize-none transition placeholder:text-white/20 focus:border-brand-blue-500/50 focus:bg-white/[0.06]"
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--color-fg-3)" }}>
              Essas instruções são injetadas diretamente no contexto da IA. Máx. 800 caracteres.
            </p>
          </Field>
          <Field label="Frases proibidas">
            <Input
              name="ai_forbidden"
              defaultValue={company?.ai_forbidden ?? ""}
              placeholder="Ex.: 'desculpe pelo transtorno', 'não posso ajudar'"
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--color-fg-3)" }}>
              Separe por vírgula. A IA vai evitar essas expressões.
            </p>
          </Field>
          {error && <p className="mb-4 text-xs text-red-400 font-medium">{error}</p>}
          <Button type="submit" variant="blue" size="sm" className="w-full font-bold h-10" disabled={pending}>
            {saved ? <><Check size={14} className="mr-2" /> Salvo ✓</> : pending ? "Salvando…" : "Salvar configurações"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

type ChannelAction =
  | { kind: "google-connect" }
  | { kind: "google-manage"; email: string }
  | { kind: "whatsapp-connected"; provider_id: string }
  | { kind: "coming-soon" };

interface ChannelItem {
  name: string;
  Icon: LucideIcon;
  ok: boolean;
  bg: string;
  col: string;
  action: ChannelAction;
  sub?: string;
}

function Channels({ company, channels }: { company: Company | null; channels: ChannelRow[] }) {
  const gcalConnected = !!company?.google_calendar_email;
  const waChannel = channels.find((c) => c.provider === "whatsapp" && c.status === "active");
  const waConnected = !!waChannel;

  const items: ChannelItem[] = [
    {
      name: "WhatsApp Business",
      Icon: MessageCircle,
      ok: waConnected,
      bg: waConnected ? "rgba(20,184,166,0.14)" : "rgba(255,255,255,0.05)",
      col: waConnected ? "#14B8A6" : "var(--color-fg-3)",
      action: waConnected
        ? { kind: "whatsapp-connected", provider_id: waChannel!.provider_id }
        : { kind: "coming-soon" },
      sub: waConnected ? `ID: ${waChannel!.provider_id}` : undefined,
    },
    {
      name: "Instagram DM",
      Icon: Instagram,
      ok: false,
      bg: "rgba(255,255,255,0.05)",
      col: "var(--color-fg-3)",
      action: { kind: "coming-soon" },
    },
    {
      name: "Site (formulário)",
      Icon: Globe,
      ok: false,
      bg: "rgba(255,255,255,0.05)",
      col: "var(--color-fg-3)",
      action: { kind: "coming-soon" },
    },
    {
      name: "Facebook Messenger",
      Icon: Facebook,
      ok: false,
      bg: "rgba(255,255,255,0.05)",
      col: "var(--color-fg-3)",
      action: { kind: "coming-soon" },
    },
    {
      name: "Google Calendar",
      Icon: Calendar,
      ok: gcalConnected,
      bg: gcalConnected ? "rgba(37,99,235,0.14)" : "rgba(255,255,255,0.05)",
      col: gcalConnected ? "#60A5FA" : "var(--color-fg-3)",
      action: gcalConnected
        ? { kind: "google-manage", email: company!.google_calendar_email! }
        : { kind: "google-connect" },
    },
    {
      name: "Slack",
      Icon: Slack,
      ok: false,
      bg: "rgba(255,255,255,0.05)",
      col: "var(--color-fg-3)",
      action: { kind: "coming-soon" },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {items.map((c) => (
        <ChannelCard key={c.name} item={c} channels={channels} />
      ))}
    </div>
  );
}

function ChannelCard({ item: c, channels }: { item: ChannelItem; channels: ChannelRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const waAction = c.action.kind === "whatsapp-connected" ? c.action : null;


  async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await saveWhatsAppChannel(formData);
        setExpanded(false);
        toast.success("Canal conectado com sucesso!");
      } catch (err: any) {
        setError(err.message);
      }
    });
  }

  async function handleTest() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/whatsapp/test", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          toast.success(`Conexão ativa! Número: ${data.displayPhone}`);
        } else {
          setError(data.error);
          toast.error("Falha na conexão.");
        }
      } catch (err: any) {
        toast.error("Erro ao testar conexão.");
      }
    });
  }

  async function handleDisconnect() {
    const action = c.action;
    if (action.kind !== "whatsapp-connected") return;
    const providerId = action.provider_id;

    if (!confirm("Tem certeza que deseja desconectar este canal? Todas as mensagens enviadas para este número deixarão de ser processadas pela IA.")) {
      return;
    }

    startTransition(async () => {
      try {
        const channel = channels.find(ch => ch.provider_id === providerId);
        if (!channel) throw new Error("Canal não encontrado");
        
        await disconnectWhatsAppChannel(channel.id);
        toast.success("Canal desconectado com sucesso");
      } catch (err: any) {
        toast.error(err.message || "Erro ao desconectar");
      }
    });
  }

  function handleMetaLogin() {
    if (!(window as any).FB) {
      toast.error("SDK da Meta não carregado. Verifique sua conexão.");
      return;
    }

    (window as any).FB.login(
      (response: any) => {
        if (response.authResponse) {
          const accessToken = response.authResponse.accessToken;
          toast.promise(
            completeWhatsAppOnboarding(accessToken).then((res) => {
              if (!res.success) throw new Error(res.error);
              return res;
            }),
            {
              loading: "Configurando canal...",
              success: (res) => `Sucesso! Número ${res.phone} conectado.`,
              error: (err: any) => `Erro: ${err.message}`,
            }
          );
        } else {
          toast.error("Conexão cancelada pelo usuário.");
        }
      },
      {
        scope: "whatsapp_business_management,whatsapp_business_messaging",
        extras: {
          feature: "whatsapp_embedded_signup",
        },
      }
    );
  }

  return (
    <motion.div
      layout
      className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: c.bg, color: c.col }}
        >
          <c.Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">{c.name}</div>
          <div
            className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5"
            style={{ color: c.ok ? "var(--color-brand-teal-300)" : "var(--color-fg-3)" }}
          >
            {c.ok ? (
              <>
                <span className="flex h-1.5 w-1.5 rounded-full bg-brand-teal-500 animate-pulse" />
                Conectado
              </>
            ) : (
              <>
                <span className="flex h-1.5 w-1.5 rounded-full bg-white/20" />
                Não conectado
              </>
            )}
          </div>
          {c.sub && (
            <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--color-fg-3)" }}>
              {c.sub}
            </div>
          )}
        </div>

        {c.action.kind === "google-connect" && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { window.location.href = "/api/auth/google"; }}
          >
            Conectar
          </Button>
        )}

        {c.action.kind === "google-manage" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Fechar" : "Gerenciar"}
          </Button>
        )}

        {c.action.kind === "whatsapp-connected" && (
          <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Fechar" : "Detalhes"}
          </Button>
        )}

        {c.action.kind === "coming-soon" && c.name === "WhatsApp Business" ? (
          <Button variant="blue" size="sm" onClick={() => setExpanded(!expanded)}>
             {expanded ? "Cancelar" : "Conectar"}
          </Button>
        ) : c.action.kind === "coming-soon" && (
          <Badge variant="cold" className="text-[10px] px-2 py-0.5">Em breve</Badge>
        )}
      </div>

      <AnimatePresence>
        {/* Formulário de Conexão WhatsApp */}
        {c.name === "WhatsApp Business" && !c.ok && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-white/[0.02]"
          >
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-medium text-white/70">Conexão Automática (Recomendado)</p>
                <button
                  onClick={handleMetaLogin}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-[13px] font-semibold transition-all shadow-lg shadow-[#1877F2]/20 group"
                >
                  <Facebook size={16} fill="currentColor" />
                  Conectar com Meta
                </button>
                <p className="text-[10px] text-white/40 leading-relaxed text-center">
                  Método oficial e seguro. Não exige preenchimento manual de IDs.
                </p>
              </div>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-3 text-[9px] uppercase tracking-widest text-white/20 font-bold">Ou manual</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>

              <form onSubmit={handleConnect} className="flex flex-col gap-4">
                <div className="rounded-lg bg-brand-blue-500/10 border border-brand-blue-500/20 p-3 mb-2">
                  <p className="text-[11px] leading-relaxed text-brand-blue-200">
                    <span className="font-bold">Manual:</span> Use se você já possui um 
                    <span className="text-white mx-1">Phone ID</span> e <span className="text-white">Token Permanente</span>.
                  </p>
                </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Phone Number ID</label>
                  <Input 
                    name="phone_number_id" 
                    placeholder="Ex: 1092837465..." 
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Nome do Canal</label>
                  <Input 
                    name="name" 
                    placeholder="Ex: WhatsApp Vendas" 
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Access Token (Permanente)</label>
                <Input 
                  name="access_token" 
                  type="password"
                  placeholder="EAAW..." 
                  className="h-9 text-xs"
                  required
                />
              </div>

              {error && <p className="text-[10px] text-red-400 font-medium">{error}</p>}

              <Button type="submit" variant="blue" size="sm" className="w-full" disabled={pending}>
                {pending ? "Conectando..." : "Salvar Canal WhatsApp"}
              </Button>
              </form>
            </div>
          </motion.div>
        )}

        {/* WhatsApp details panel */}
        {c.action.kind === "whatsapp-connected" && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Configurações Ativas</div>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <MessageCircle size={13} className="text-brand-teal-300" />
                  <span className="font-mono text-[12px] text-white/70">
                    Phone ID: {waAction?.provider_id}
                  </span>
                </div>
              </div>

              {/* Display Error if any */}
              {channels.find(ch => ch.id === waAction?.provider_id || ch.provider_id === waAction?.provider_id)?.last_error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">Erro de Conexão</p>
                  <p className="text-[11px] text-red-200/80 font-mono break-all">
                    {channels.find(ch => ch.provider_id === waAction?.provider_id)?.last_error}
                  </p>
                </div>
              )}
              
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                <p className="text-[11px] leading-relaxed text-white/50">
                  Este canal está roteado para o webhook oficial da Agendra. Suas mensagens são processadas pela IA configurada na aba Persona.
                </p>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="blue" 
                  size="sm" 
                  className="flex-1" 
                  onClick={handleTest}
                  disabled={pending}
                >
                  {pending ? "Testando..." : "Testar Conexão"}
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20" 
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  Desconectar
                </Button>
              </div>
            </div>
          </motion.div>
        )}


        {/* Google Calendar management panel */}
        {c.action.kind === "google-manage" && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <Calendar size={13} style={{ color: "var(--color-brand-teal-300)" }} />
                <span className="font-mono text-[12px]" style={{ color: "var(--color-fg-2)" }}>
                  {c.action.email}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => { window.location.href = "/api/auth/google"; }}
                >
                  <ExternalLink size={12} />
                  Reconectar / atualizar permissões
                </Button>
              </div>
              <p className="text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                Para desconectar, remova o acesso da Agendra em{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-white"
                >
                  myaccount.google.com/permissions
                </a>
                .
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Flows() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-brand-blue-500/20 bg-brand-blue-500/5">
        <CardContent className="p-5 flex gap-4 items-start">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-blue-500/10 text-brand-blue-400">
            <Zap size={20} />
          </div>
          <div>
            <div className="text-[13px] font-bold text-white mb-1">Automações em desenvolvimento</div>
            <div className="text-[12px] leading-relaxed" style={{ color: "var(--color-fg-2)" }}>
              Follow-up automático, reativação de leads frios e confirmação de agendamento estão sendo construídos.
              Você será notificado quando estiverem disponíveis.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {[
          {
            name: "Follow-up automático",
            desc: "Se lead não responder após sugestão de horário, IA envia lembrete.",
            trigger: "Lead sem resposta por X horas",
            soon: true,
          },
          {
            name: "Reativação de leads frios",
            desc: "Lead com score baixo sem interação por vários dias recebe mensagem de reabertura.",
            trigger: "Score < 30 · inativo há 7 dias",
            soon: true,
          },
          {
            name: "Confirmação de agendamento",
            desc: "IA envia confirmação automática X horas antes do horário marcado.",
            trigger: "Agendamento em X horas",
            soon: true,
          },
        ].map((f) => (
          <div
            key={f.name}
            className="flex items-center gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 opacity-60"
          >
            <GitBranch size={18} className="text-white/20 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white/70">{f.name}</div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-fg-3)" }}>
                {f.trigger}
              </div>
            </div>
            <Badge variant="cold" className="text-[10px] px-2 py-0.5 shrink-0">Em breve</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function Team({ memberships }: { memberships: Member[] }) {
  const COLORS = [
    "linear-gradient(135deg,#3B82F6,#14B8A6)",
    "linear-gradient(135deg,#F97316,#FB923C)",
    "linear-gradient(135deg,#0F766E,#14B8A6)",
    "linear-gradient(135deg,#1D4ED8,#3B82F6)",
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Time</CardTitle>
          <CardDescription>{memberships.length} membros</CardDescription>
        </div>
        <Button variant="primary" size="sm" onClick={() => alert("em breve")}>
          <UserPlus size={14} className="mr-2" />
          Convidar
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {memberships.map((m, i) => {
          const u = Array.isArray(m.users) ? m.users[0] : m.users;
          const name = u?.full_name ?? u?.email ?? "Usuário";
          const email = u?.email ?? "";
          const initials = name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.05] transition-colors"
            >
              <div
                className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white shadow-lg"
                style={{ background: COLORS[i % COLORS.length] }}
              >
                {initials}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{name}</div>
                <div className="text-[11px]" style={{ color: "var(--color-fg-3)" }}>{email}</div>
              </div>
              <Badge variant={m.role === "admin" ? "hot" : "cold"}>{m.role}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Billing({ company, usage }: { company: Company | null; usage: any }) {
  const [loading, setLoading] = React.useState<string | null>(null);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [isAnnual, setIsAnnual] = React.useState(true);

  const handleCheckout = async (priceId: string, planType: string) => {
    try {
      setLoading(planType);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, planType }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  // [FIX CRIT-3] Real Stripe Billing Portal
  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error("Portal error:", err);
      alert("Erro ao abrir gerenciamento de assinatura. Tente novamente.");
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPlan = company?.plan_type || "trial";
  const subscriptionStatus = company?.subscription_status;
  const isSubscriptionActive = subscriptionStatus === "active";
  // [FIX M3] past_due também bloqueia novo checkout — cliente deve ir ao portal
  const isSubscriptionManageable = subscriptionStatus === "active" || subscriptionStatus === "past_due";

  // [FIX ARCH-1] Price IDs agora vêm do single source of truth
  const plans = PLANS_META.map((p) => ({
    ...p,
    priceId: STRIPE_PRICE_IDS[p.id][isAnnual ? "annual" : "monthly"],
  }));

  const leadsUsed = usage?.usage?.leads || 0;
  const leadsMax = usage?.limits?.maxLeads || 150;
  const leadsPct = Math.min(100, Math.round((leadsUsed / leadsMax) * 100));

  const cancelAtPeriodEnd = usage?.cancelAtPeriodEnd;
  const currentPeriodEnd = usage?.currentPeriodEnd;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Banner de Cancelamento */}
      {cancelAtPeriodEnd && currentPeriodEnd && (
        <Card className="border-brand-orange-500/30 bg-brand-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-brand-orange-500/20 text-brand-orange-400">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-orange-300">Sua assinatura foi cancelada</p>
              <p className="text-xs text-brand-orange-300/70">
                Seu acesso ao plano <strong>{currentPlan.toUpperCase()}</strong> continuará ativo até o dia <strong>{new Date(currentPeriodEnd).toLocaleDateString()}</strong>. Após essa data, você voltará ao plano Trial.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Barra de Uso */}
      <Card className="bg-white/[0.02] border-brand-teal-500/10">
        <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1 w-full">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[13px] font-semibold text-white/90">Consumo de Leads ({currentPlan.toUpperCase()})</span>
              <span className="text-xs font-mono text-white/60">{leadsUsed} / {leadsMax}</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${leadsPct}%` }}
                className={cn("h-full rounded-full", leadsPct > 85 ? "bg-brand-orange-500 shadow-glow-orange/20" : "bg-brand-teal-400 shadow-glow-teal/20")}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            {leadsPct > 85 && (
              <p className="text-[11px] text-brand-orange-400 mt-2 font-medium">Você está perto do limite do seu plano. Faça upgrade para não pausar a IA.</p>
            )}
          </div>
          {isSubscriptionManageable ? (
            <Button
              variant="secondary"
              size="sm"
              className="whitespace-nowrap"
              disabled={portalLoading}
              onClick={handleManageSubscription}
            >
              {portalLoading ? <><Loader2 size={14} className="animate-spin mr-1.5" />Abrindo...</> : "Gerenciar Assinatura"}
            </Button>
          ) : (
            <Link href="/planos">
              <Button
                variant="secondary"
                size="sm"
                className="whitespace-nowrap bg-brand-blue-500/10 text-brand-blue-400 hover:bg-brand-blue-500/20 border-brand-blue-500/20"
              >
                <Zap size={13} className="mr-1.5" />
                Fazer Upgrade
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Preços */}
      <div className="flex flex-col items-center mb-4">
        <div className="flex items-center gap-3 p-1 rounded-full border border-white/10 bg-white/5">
          <button
            onClick={() => setIsAnnual(false)}
            className={cn("px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors", !isAnnual ? "bg-white/10 text-white" : "text-white/40")}
          >
            Mensal
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={cn("px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors flex items-center gap-1.5", isAnnual ? "bg-white/10 text-brand-teal-300" : "text-white/40")}
          >
            Anual {!isAnnual && <Badge variant="hot" className="text-[9px] px-1 py-0 h-4">-25%</Badge>}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          // [FIX M3] past_due com mesmo plano também desabilita novo checkout
          const isActive = isSubscriptionActive && currentPlan === p.id;
          const isPastDueSamePlan = subscriptionStatus === "past_due" && currentPlan === p.id;
          const isButtonLoading = loading === p.id;

          return (
            <motion.div
              key={p.id}
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 overflow-hidden",
                p.recommended ? "border-brand-blue-500/50 bg-brand-blue-500/5" : "border-white/[0.08] bg-white/[0.02]",
                isActive && "border-brand-teal-500/50"
              )}
            >
              {p.recommended && (
                <div className="absolute top-0 right-0 left-0 flex justify-center transform -translate-y-px">
                  <div className="bg-brand-blue-500 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-b-lg">
                    Recomendado
                  </div>
                </div>
              )}
              
              <div className="mt-4 mb-2">
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="text-[12px] text-white/50 h-8">{p.desc}</p>
              </div>

              <div className="my-4 flex items-baseline gap-1">
                <span className="text-3xl font-black">R$ {isAnnual ? p.annual : p.monthly}</span>
                <span className="text-xs text-white/50">/mês</span>
              </div>
              
              {isAnnual && (
                <div className="text-[11px] text-white/40 mb-6">Faturado R$ {p.annual * 12}/ano</div>
              )}
              {!isAnnual && (
                <div className="text-[11px] text-white/40 mb-6 invisible">Espaço</div>
              )}

              <Button
                variant={isActive ? "ghost" : p.recommended ? "blue" : "secondary"}
                className={cn("w-full mb-6 font-bold", p.recommended && "shadow-glow-blue/20")}
                disabled={isActive || isPastDueSamePlan || loading !== null}
                onClick={() => handleCheckout(p.priceId, p.id)}
              >
                {isButtonLoading ? "Processando..." : isActive ? "Plano Atual" : "Assinar " + p.name}
              </Button>

              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-teal-300">
                  <Check size={14} /> {p.leads}
                </div>
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-white/70">
                    <Check size={14} className="mt-0.5 text-white/30 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      <Script
        src="https://connect.facebook.net/pt_BR/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          (window as any).fbAsyncInit = function () {
            (window as any).FB.init({
              appId: process.env.NEXT_PUBLIC_META_APP_ID,
              cookie: true,
              xfbml: true,
              version: "v19.0",
            });
          };
        }}
      />
    </div>
  );
}

function Services({ companyId, services }: { companyId?: string; services: Service[] }) {
  const [pending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (companyId) formData.set("company_id", companyId);
    
    startTransition(async () => {
      try {
        await createService(formData);
        setIsAdding(false);
        toast.success("Serviço criado com sucesso!");
      } catch (err: any) {
        toast.error("Erro ao criar serviço: " + err.message);
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover este serviço?")) return;
    
    startTransition(async () => {
      try {
        await deleteService(id);
        toast.success("Serviço removido.");
      } catch (err: any) {
        toast.error("Erro ao remover: " + err.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Serviços</h3>
          <p className="text-xs text-white/40">Gerencie os serviços que sua IA pode agendar.</p>
        </div>
        <Button 
          variant="blue" 
          size="sm" 
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus size={16} className="mr-2" /> Novo Serviço
        </Button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass p-5 rounded-2xl border border-white/10"
          >
            <form onSubmit={handleAdd} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome do Serviço">
                  <Input name="name" placeholder="Ex: Corte Masculino" required />
                </Field>
                <Field label="Preço (R$)">
                  <Input name="price" type="number" step="0.01" placeholder="Ex: 50.00" />
                </Field>
              </div>
              <Field label="Duração (minutos)">
                <select 
                  name="duration" 
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500/50"
                  defaultValue="60"
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hora</option>
                  <option value="90">1h 30min</option>
                  <option value="120">2 horas</option>
                </select>
              </Field>
              <Field label="Descrição (opcional)">
                <textarea 
                  name="description" 
                  placeholder="Breve descrição para ajudar a IA a explicar o serviço..."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none resize-none h-20"
                />
              </Field>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancelar</Button>
                <Button variant="blue" size="sm" type="submit" disabled={pending}>
                  {pending ? "Salvando..." : "Salvar Serviço"}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-3">
        {services.length === 0 && !isAdding && (
          <div className="text-center py-12 glass rounded-2xl border border-dashed border-white/10">
            <p className="text-sm text-white/30">Nenhum serviço cadastrado ainda.</p>
          </div>
        )}
        {services.map((s) => (
          <motion.div
            key={s.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass flex items-center justify-between p-4 rounded-xl border border-white/5 hover:border-white/10 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-brand-blue-500/10 flex items-center justify-center text-brand-blue-400">
                <Briefcase size={20} />
              </div>
              <div>
                <h4 className="font-bold text-sm">{s.name}</h4>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-white/40 flex items-center gap-1">
                    <Clock size={12} /> {s.duration} min
                  </span>
                  {s.price && (
                    <span className="text-[11px] text-brand-teal-400 font-medium">
                      R$ {s.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white">
                <Edit3 size={14} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-white/40 hover:text-red-400"
                onClick={() => handleDelete(s.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
