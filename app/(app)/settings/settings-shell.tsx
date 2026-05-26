"use client";

import { useEffect, useState, useTransition } from "react";
import React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  GitBranch,
  RefreshCw,
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
  UploadCloud,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updatePersona, saveWhatsAppChannel, completeWhatsAppOnboarding, disconnectChannel, disconnectWhatsAppChannel, saveAutomationConfig, updateCompany, inviteTeamMember, saveWebhookConfig, deleteWebhook, saveReactivationConfig } from "./actions";
import { cancelInvitation, resendInvitation } from "./invitations/actions";
import { createService, updateService, deleteService, toggleServiceStatus } from "./services/actions";
import Script from "next/script";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { STRIPE_PRICE_IDS, PLANS_META } from "@/lib/billing/plans";
import type { PlanType } from "@/lib/billing/plans";
import { createBrowserClient } from "@supabase/ssr";

type TabId = "account" | "rules" | "services" | "brain" | "channels" | "automation" | "logs" | "billing";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "account",    label: "Conta & Empresa",   icon: Users },
  { id: "rules",      label: "Horários & Regras", icon: Clock },
  { id: "services",   label: "Serviços",          icon: Briefcase },
  { id: "brain",      label: "Cérebro da IA",     icon: Cpu },
  { id: "channels",   label: "Canais",            icon: MessageSquare },
  { id: "automation", label: "Automação",         icon: GitBranch },
  { id: "logs",       label: "Mente da IA",       icon: Zap },
  { id: "billing",    label: "Assinatura",        icon: CreditCard },
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
  tts_enabled?: boolean;
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
  is_paused?: boolean | null;
}

interface AiDecisionLog {
  id: string;
  lead_id: string;
  intent_detected: string | null;
  sentiment_score: number | null;
  urgency_detected: boolean | null;
  objection_handled: string | null;
  rationale: string | null;
  created_at: string;
  leads: { name: string }[] | null;
}

interface AutomationEvent {
  id: string;
  type: string;
  detail: string | null;
  lead_id: string | null;
  created_at: string;
}

interface WebhookSubscription {
  id: string;
  url: string;
  event_types: string[];
  secret: string;
  label?: string | null;
  is_active: boolean;
  created_at: string;
  last_fired_at?: string | null;
  last_error?: string | null;
}

interface AutomationStats {
  remindersToday: number;
  followupsWeek: number;
}

interface PendingInvitation {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by: string;
}

interface SettingsShellProps {
  company: Company | null;
  memberships: Member[];
  channels: ChannelRow[];
  services: Service[];
  usage: any;
  aiLogs: AiDecisionLog[];
  automationStats: AutomationStats;
  automationEvents: AutomationEvent[];
  webhooks: WebhookSubscription[];
  pendingInvitations: PendingInvitation[];
}

export function SettingsShell({ company, memberships, channels, services, usage, aiLogs, automationStats, automationEvents, webhooks, pendingInvitations }: SettingsShellProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Tab state is local — no server round trip on tab switch.
  // Initialized from URL so deep-links and OAuth redirects work.
  const rawTab = searchParams.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>(() =>
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "account"
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
      toast.success("Google Calendar conectado com sucesso! 🎉");
      setTab("channels");
      trackEvent("gcal_connected");
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (gcal === "error") {
      toast.error("Erro ao conectar Google Calendar. Tente novamente.");
      setTab("channels");
      trackEvent("gcal_failed", { reason: "error" });
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (gcal === "denied") {
      toast.error("Conexão com Google Calendar cancelada.");
      setTab("channels");
      trackEvent("gcal_failed", { reason: "denied" });
      router.replace("/settings?tab=channels", { scroll: false });
    } else if (stripe === "success") {
      toast.success("Assinatura confirmada! Sua IA está turbinada. 🚀");
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


  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:px-8 lg:py-7 relative">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Configurações</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
          Personalize Agendra para seu negócio.
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
        {/* Mobile Tabs (Horizontal) */}
        <div className="lg:hidden relative w-full flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-bold tracking-tight transition-all duration-300 outline-none cursor-pointer shrink-0",
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
                    layoutId="active-tab-mobile-glow"
                    className="absolute inset-0 z-0 rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.05)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Desktop Sidebar (Vertical) */}
        <div className="hidden lg:flex flex-col w-64 shrink-0 gap-1.5 sticky top-7">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold tracking-tight transition-all duration-300 outline-none cursor-pointer text-left w-full",
                  active 
                    ? "text-white" 
                    : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
                )}
              >
                <t.icon size={18} className={cn(
                  "transition-transform duration-300 group-hover:scale-110",
                  active ? "text-brand-blue-400" : "text-white/20 group-hover:text-white/40"
                )} />
                <span className="relative z-10 flex-1">{t.label}</span>
                {active && (
                  <motion.div
                    layoutId="active-tab-desktop-glow"
                    className="absolute inset-0 z-0 rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.05)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 w-full max-w-3xl min-w-0">
          <TabPanel active={tab === "account"}>
            <Team memberships={memberships} company={company} pendingInvitations={pendingInvitations} />
          </TabPanel>
          <TabPanel active={tab === "rules"}>
            <Rules company={company} />
          </TabPanel>
          <TabPanel active={tab === "services"}>
            <Services companyId={company?.id} services={services} businessType={(company?.persona_config as any)?.business_type} />
          </TabPanel>
          <TabPanel active={tab === "brain"}>
            <Persona company={company} services={services} onChangeTab={changeTab} planType={company?.plan_type} />
          </TabPanel>
          <TabPanel active={tab === "channels"}>
            <Channels company={company} channels={channels} usage={usage} />
          </TabPanel>
          <TabPanel active={tab === "automation"}>
            <Flows
              company={company}
              automationStats={automationStats}
              automationEvents={automationEvents}
              webhooks={webhooks}
              onChangeTab={changeTab}
            />
          </TabPanel>
          <TabPanel active={tab === "logs"}>
            <FeatureGate planType={company?.plan_type} requiredPlan="pro" onChangeTab={changeTab} title="Mente da IA (Explainability)" desc="Acompanhe em tempo real por que a IA tomou determinadas decisões e refine as orientações.">
              <LogsView logs={aiLogs} companyId={company?.id ?? null} planType={company?.plan_type} />
            </FeatureGate>
          </TabPanel>
          <TabPanel active={tab === "billing"}>
            <Billing company={company} usage={usage} />
          </TabPanel>
        </div>
      </div>
    </div>
  );
}

function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function FeatureGate({
  planType,
  requiredPlan,
  onChangeTab,
  title,
  desc,
  children
}: {
  planType: string | null | undefined;
  requiredPlan: "pro" | "business";
  onChangeTab: (tab: TabId) => void;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  const PLAN_WEIGHTS: Record<string, number> = { trial: 0, starter: 1, pro: 2, business: 3 };
  const currentWeight = PLAN_WEIGHTS[planType ?? "trial"] ?? 0;
  const requiredWeight = PLAN_WEIGHTS[requiredPlan];

  if (currentWeight >= requiredWeight) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10">
      {/* Blurred Content */}
      <div className="opacity-30 blur-[6px] pointer-events-none select-none">
        {children}
      </div>
      
      {/* Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-black/40 bg-gradient-to-t from-[rgb(11,18,34)] to-transparent">
        <div className="glass p-6 sm:p-8 rounded-2xl border border-brand-blue-500/20 shadow-2xl max-w-md w-full relative overflow-hidden">
          <div className="absolute inset-0 bg-brand-blue-500/10 pointer-events-none" />
          
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-blue-500/20 text-brand-blue-400 mb-4 ring-1 ring-brand-blue-500/30">
            <Zap size={24} className="animate-pulse" />
          </div>
          
          <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
          <p className="text-sm text-white/70 mb-6 leading-relaxed">
            {desc} Recurso exclusivo para o plano {requiredPlan === "pro" ? "Pro ou superior" : "Business"}.
          </p>
          
          <Button 
            variant="blue" 
            className="w-full font-bold shadow-lg shadow-brand-blue-500/20"
            onClick={() => onChangeTab("billing")}
          >
            Fazer Upgrade Agora
          </Button>
        </div>
      </div>
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
  const [selected, setSelected] = useState(defaultValue);
  
  const options = [
    { value: "cold", label: "Formal", desc: "Direto e objetivo" },
    { value: "warm", label: "Amigável", desc: "Equilibrado e empático" },
    { value: "hot", label: "Persuasivo", desc: "Focado em vendas" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="ai_tone" value={selected} />
      <div className="grid grid-cols-3 gap-2 p-1 bg-white/[0.04] rounded-xl border border-white/[0.08]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setSelected(o.value)}
            className={cn(
              "relative px-3 py-2 text-xs font-bold transition-all rounded-lg z-10",
              selected === o.value ? "text-white" : "text-white/40 hover:text-white/70"
            )}
          >
            {o.label}
            {selected === o.value && (
              <motion.div
                layoutId="tone-slider"
                className="absolute inset-0 bg-brand-blue-500/20 border border-brand-blue-500/30 rounded-lg -z-10 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-brand-blue-300/70 italic text-center h-4">
        {options.find(o => o.value === selected)?.desc}
      </div>
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
                ? "border-brand-blue-500/50 bg-brand-blue-500/10 text-white"
                : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70"
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
                <span className="text-[11px] w-8 shrink-0 text-white/50 font-medium">{label}</span>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setDayTime(key, 0, e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white outline-none focus:border-brand-blue-500/50"
                />
                <span className="text-white/30 text-xs">–</span>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setDayTime(key, 1, e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white outline-none focus:border-brand-blue-500/50"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getPlaceholdersByBusinessType(businessType?: string): {
  multipleServices: string;
  singleService: string;
  price: string;
} {
  const bt = (businessType || "").toLowerCase();
  
  if (bt.includes("clínica") || bt.includes("saúde") || bt.includes("estética") || bt.includes("médic") || bt.includes("dentis") || bt.includes("fisiot")) {
    return {
      multipleServices: "Ex.: consulta médica, drenagem linfática, avaliação inicial",
      singleService: "Ex: Consulta Inicial",
      price: "Ex: 150,00",
    };
  }
  
  if (bt.includes("advoc") || bt.includes("juríd") || bt.includes("direit") || bt.includes("legal")) {
    return {
      multipleServices: "Ex.: consulta jurídica, análise de contrato, parecer técnico",
      singleService: "Ex: Parecer Técnico",
      price: "Ex: 250,00",
    };
  }
  
  if (bt.includes("consult") || bt.includes("mentor") || bt.includes("coach") || bt.includes("ti") || bt.includes("desenvol")) {
    return {
      multipleServices: "Ex.: mentoria individual, diagnóstico de TI, setup inicial",
      singleService: "Ex: Sessão Estratégica",
      price: "Ex: 350,00",
    };
  }
  
  if (bt.includes("imobil") || bt.includes("corret") || bt.includes("imóv")) {
    return {
      multipleServices: "Ex.: visita técnica, avaliação de imóvel, vistoria de entrega",
      singleService: "Ex: Visita ao Imóvel",
      price: "Ex: 0,00",
    };
  }
  
  if (bt.includes("educa") || bt.includes("aula") || bt.includes("curso") || bt.includes("escola") || bt.includes("treina")) {
    return {
      multipleServices: "Ex.: aula particular, teste de nivelamento, matrícula anual",
      singleService: "Ex: Aula Experimental",
      price: "Ex: 80,00",
    };
  }
  
  if (bt.includes("salão") || bt.includes("beleza") || bt.includes("cabel") || bt.includes("corte") || bt.includes("barba") || bt.includes("manicur") || bt.includes("barbearia")) {
    return {
      multipleServices: "Ex.: corte, coloração, manicure, barba",
      singleService: "Ex: Corte de Cabelo",
      price: "Ex: 50,00",
    };
  }
  
  // Default fallback
  return {
    multipleServices: "Ex.: atendimento, consulta, mentoria",
    singleService: "Ex: Atendimento Geral",
    price: "Ex: 100,00",
  };
}

function ServicesInput({ defaultValue, businessType }: { defaultValue: string; businessType?: string }) {
  const [raw, setRaw] = useState(defaultValue);
  const placeholders = getPlaceholdersByBusinessType(businessType);
  return (
    <div className="flex flex-col gap-1">
      <input
        name="services"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={placeholders.multipleServices}
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
  onChangeTab,
  planType,
}: {
  company: Company | null;
  services: Service[];
  onChangeTab: (tab: TabId) => void;
  planType?: PlanType | null;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pc = company?.persona_config ?? {};

  const [documents, setDocuments] = useState<{ source_name: string; created_at: string; chunks: number }[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fetchDocs = async () => {
    try {
      const res = await fetch("/api/knowledge");
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error("Erro ao buscar documentos:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleUpload(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleUpload(files[0]);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadStatus("Extraindo texto e gerando vetores...");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao fazer upload");
      }

      toast.success(`Documento "${file.name}" indexado com sucesso! 🎉`);
      fetchDocs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo");
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  };

  const handleDeleteDoc = async (sourceName: string) => {
    if (!confirm(`Deseja remover o documento "${sourceName}"? Todos os vetores serão deletados.`)) return;

    try {
      const res = await fetch(`/api/knowledge?source_name=${encodeURIComponent(sourceName)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir documento");
      }

      toast.success("Documento removido com sucesso!");
      fetchDocs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao deletar documento");
    }
  };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
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
          <Field label="Áudio (TTS)">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="tts_enabled"
                defaultChecked={pc.tts_enabled === true}
                className="size-4 rounded border-white/20 bg-white/5"
              />
              <span className="text-sm">
                Responder por áudio quando o cliente mandar áudio
                <span className="ml-2 text-xs text-white/50">(Pro+)</span>
              </span>
            </label>
          </Field>
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

      {/* ── A2: Conhecimento e RAG ────────────────────────────── */}
      <FeatureGate planType={planType} requiredPlan="pro" onChangeTab={onChangeTab} title="Base de Conhecimento" desc="Faça upload de PDFs, Tabelas de Preços e treine sua IA com seus próprios dados.">
      <Card>
        <CardHeader>
          <CardTitle>Base de Conhecimento</CardTitle>
          <CardDescription>Treine a IA com catálogos, FAQs e tabelas de preços.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "group relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-300",
              dragging
                ? "border-brand-blue-500 bg-brand-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
              uploading ? "pointer-events-none opacity-50" : "cursor-pointer"
            )}
          >
            <input
              type="file"
              onChange={handleFileChange}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              accept=".pdf,.txt,.docx"
            />
            <div className="h-14 w-14 rounded-full bg-white/[0.05] flex items-center justify-center text-white/30 mb-4 ring-4 ring-white/[0.03] group-hover:scale-110 transition-transform duration-300">
              {uploading ? (
                <Loader2 size={24} className="animate-spin text-brand-blue-400" />
              ) : (
                <UploadCloud size={24} className="text-white/60" />
              )}
            </div>
            {uploading ? (
              <div className="flex flex-col items-center text-center">
                <p className="text-sm font-bold text-white mb-1">Indexando arquivo...</p>
                <p className="text-xs text-brand-blue-300/80 animate-pulse">{uploadStatus}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <p className="text-sm font-bold text-white/70 mb-1">
                  Arrastar & soltar ou clique para escolher
                </p>
                <p className="text-xs text-white/40">
                  Suporta PDF, TXT ou DOCX até 5 MB
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Documentos Processados</h4>
            
            {loadingDocs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={20} className="animate-spin text-white/30" />
              </div>
            ) : documents.length > 0 ? (
              <div className="flex flex-col gap-2">
                {documents.map((doc) => (
                  <div
                    key={doc.source_name}
                    className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition duration-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-brand-blue-500/10 flex items-center justify-center text-brand-blue-400 shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white/95 truncate max-w-[280px] sm:max-w-[400px]">
                          {doc.source_name}
                        </p>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          {doc.chunks} blocos indexados • {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(doc.source_name)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Excluir documento"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center border border-dashed border-white/[0.06] rounded-xl bg-white/[0.01]">
                <p className="text-[12px] text-white/40 font-semibold">Nenhum documento processado ainda</p>
                <p className="text-[11px] text-white/20 leading-relaxed max-w-xs px-4">
                  Envie FAQs, tabelas de preços ou materiais de treinamento para calibrar a IA.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </FeatureGate>

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

function Channels({
  company,
  channels,
  usage,
}: {
  company: Company | null;
  channels: ChannelRow[];
  usage: any;
}) {
  const gcalConnected = !!company?.google_calendar_email;
  const waChannels = channels.filter((c) => c.provider === "whatsapp");
  const igChannels = channels.filter((c) => c.provider === "instagram");

  const planType = company?.plan_type ?? "trial";
  const allowedProviders = usage?.limits?.allowedChannels || ["whatsapp"];
  
  const isInstagramAllowed = allowedProviders.includes("instagram");
  const maxChannels = usage?.limits?.maxChannels ?? 1;
  const totalActiveChannels = channels.filter(c => c.status === "active").length;
  const canAddMore = totalActiveChannels < maxChannels;

  return (
    <div className="flex flex-col gap-6">
      {/* Resumo de Limites de Canais */}
      <div className="glass p-4 rounded-xl border border-brand-blue-500/10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Zap size={15} className="text-brand-blue-400" />
            Canais da Empresa ({totalActiveChannels}/{maxChannels})
          </h3>
          <p className="text-[11px] text-white/50 mt-1">
            Seu plano {planType.toUpperCase()} permite até {maxChannels} conexões simultâneas de canais autorizados.
          </p>
        </div>
        <Badge variant="cold" className="text-[10px] px-2.5 py-1">
          {planType.toUpperCase()}
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        {/* 1. SEÇÃO WHATSAPP */}
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-white/40 flex items-center gap-1.5 pl-1">
            <MessageCircle size={12} className="text-brand-teal-400" />
            WhatsApp Business Cloud API
          </h4>
          
          {waChannels.map((ch) => (
            <WhatsAppChannelCard key={ch.id} channel={ch} onDisconnect={disconnectChannel} />
          ))}

          {canAddMore ? (
            <NewWhatsAppChannelConnector 
              companyId={company?.id} 
              completeWhatsAppOnboarding={completeWhatsAppOnboarding} 
              saveWhatsAppChannel={saveWhatsAppChannel} 
            />
          ) : (
            waChannels.length === 0 && (
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center text-xs text-white/40 italic">
                Limite de canais atingido. Faça upgrade para conectar mais números.
              </div>
            )
          )}
        </div>

        {/* 2. SEÇÃO INSTAGRAM */}
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-white/40 flex items-center gap-1.5 pl-1">
            <Instagram size={12} className="text-pink-400" />
            Instagram Direct
          </h4>

          {isInstagramAllowed ? (
            <>
              {igChannels.map((ch) => (
                <InstagramChannelCard key={ch.id} channel={ch} onDisconnect={disconnectChannel} />
              ))}

              {igChannels.length === 0 && canAddMore && (
                <motion.div 
                  whileHover={{ scale: 1.01 }}
                  className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
                      <Instagram size={20} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold">Conectar conta Instagram</div>
                      <div className="text-[10px] text-white/40 mt-0.5">Atenda DMs e Stories automaticamente com IA</div>
                    </div>
                  </div>
                  <Button 
                    variant="blue" 
                    size="sm"
                    className="shadow-md shadow-pink-500/10 font-bold bg-pink-600 hover:bg-pink-500"
                    onClick={() => { window.location.href = "/api/auth/instagram"; }}
                  >
                    Conectar
                  </Button>
                </motion.div>
              )}

              {igChannels.length === 0 && !canAddMore && (
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center text-xs text-white/40 italic">
                  Você já atingiu o limite de canais do seu plano. Adicione mais canais fazendo upgrade.
                </div>
              )}
            </>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.01]">
              <div className="p-4 flex items-center justify-between gap-4 blur-[2px] opacity-40 pointer-events-none select-none">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
                    <Instagram size={20} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold">Instagram DMs & Stories</div>
                    <div className="text-[10px] text-white/40 mt-0.5">Responda a DMs e reações com IA</div>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Conectar</Button>
              </div>
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center p-4">
                <div className="glass px-4 py-3 rounded-xl border border-pink-500/20 text-pink-300 text-xs font-semibold flex items-center gap-2 shadow-lg shadow-pink-500/5">
                  <Zap size={14} className="animate-pulse" />
                  Conexão Instagram DMs é exclusiva do Plano PRO
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. SEÇÃO GOOGLE CALENDAR */}
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-white/40 flex items-center gap-1.5 pl-1">
            <Calendar size={12} className="text-brand-blue-400" />
            Google Calendar (Agenda)
          </h4>
          <GoogleCalendarCard company={company} connected={gcalConnected} />
        </div>

        {/* 4. CANAIS EM BREVE */}
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-white/20 flex items-center gap-1.5 pl-1">
            <Globe size={12} className="text-white/20" />
            Canais de Mensageria (Em Breve)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-white/[0.03] bg-white/[0.01] flex items-center gap-3 opacity-40">
              <Slack size={18} className="text-white/40" />
              <div>
                <div className="text-xs font-semibold">Telegram Bots</div>
                <div className="text-[9px] text-white/40 mt-0.5">Em breve</div>
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-white/[0.03] bg-white/[0.01] flex items-center gap-3 opacity-40">
              <Facebook size={18} className="text-white/40" />
              <div>
                <div className="text-xs font-semibold">Messenger</div>
                <div className="text-[9px] text-white/40 mt-0.5">Em breve</div>
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-white/[0.03] bg-white/[0.01] flex items-center gap-3 opacity-40">
              <Globe size={18} className="text-white/40" />
              <div>
                <div className="text-xs font-semibold">Web Chat Widget</div>
                <div className="text-[9px] text-white/40 mt-0.5">Em breve</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Script
        id="fb-sdk-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.fbAsyncInit = function() {
            FB.init({
              appId: '${process.env.NEXT_PUBLIC_META_APP_ID}',
              cookie: true,
              xfbml: true,
              version: 'v19.0'
            });
          };`,
        }}
      />
      <Script
        src="https://connect.facebook.net/pt_BR/sdk.js"
        strategy="afterInteractive"
      />
    </div>
  );
}

/* ==========================================================================
   SUBCOMPONENTE: WhatsAppChannelCard
   ========================================================================== */
function WhatsAppChannelCard({ 
  channel, 
  onDisconnect 
}: { 
  channel: ChannelRow; 
  onDisconnect: (id: string) => Promise<any>; 
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
    if (!confirm("Tem certeza que deseja desconectar este canal? Todas as mensagens enviadas para este número deixarão de ser processadas pela IA.")) {
      return;
    }

    startTransition(async () => {
      try {
        await onDisconnect(channel.id);
        toast.success("Canal desconectado com sucesso");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message || "Erro ao desconectar");
      }
    });
  }

  const isError = channel.status === "error";

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-400">
          <MessageCircle size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">WhatsApp Connection</div>
          <div className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5">
            {isError ? (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Erro de Autenticação
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-brand-teal-300">
                <span className="flex h-1.5 w-1.5 rounded-full bg-brand-teal-500 animate-pulse" />
                Ativo
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-white/40 truncate">
            ID: {channel.provider_id}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Fechar" : "Detalhes"}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3"
          >
            {channel.last_error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">Último Erro</p>
                <p className="text-[11px] text-red-200/80 font-mono break-all">{channel.last_error}</p>
              </div>
            )}

            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 text-[11px] text-white/50 leading-relaxed">
              Este canal está associado ao número do WhatsApp Cloud API cadastrado. A IA da Agendra monitora e responde às mensagens que chegam.
            </div>

            <div className="flex gap-2">
              <Button variant="blue" size="sm" className="flex-1 font-bold" onClick={handleTest} disabled={pending}>
                {pending ? "Testando..." : "Testar Conexão"}
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20 font-bold"
                onClick={handleDisconnect}
                disabled={pending}
              >
                Desconectar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ==========================================================================
   SUBCOMPONENTE: InstagramChannelCard
   ========================================================================== */
function InstagramChannelCard({ 
  channel, 
  onDisconnect 
}: { 
  channel: ChannelRow; 
  onDisconnect: (id: string) => Promise<any>; 
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleDisconnect() {
    if (!confirm("Tem certeza que deseja desconectar o Instagram? Suas DMs deixarão de ser respondidas pela IA.")) {
      return;
    }

    startTransition(async () => {
      try {
        await onDisconnect(channel.id);
        toast.success("Instagram desconectado com sucesso");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message || "Erro ao desconectar");
      }
    });
  }

  const isError = channel.status === "error";

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pink-500/10 text-pink-400">
          <Instagram size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Instagram Direct DMs</div>
          <div className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5">
            {isError ? (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Erro na conexão
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-pink-300">
                <span className="flex h-1.5 w-1.5 rounded-full bg-pink-500 animate-pulse" />
                Ativo
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-white/40 truncate">
            IG Account ID: {channel.provider_id}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Fechar" : "Gerenciar"}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3"
          >
            {channel.last_error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">Erro</p>
                <p className="text-[11px] text-red-200/80 font-mono break-all">{channel.last_error}</p>
              </div>
            )}

            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 text-[11px] text-white/50 leading-relaxed">
              O Instagram Direct está conectado e monitorando DMs recebidas. O atendimento automático está ativo de acordo com a aba Automação.
            </div>

            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20 font-bold"
                onClick={handleDisconnect}
                disabled={pending}
              >
                Desconectar Instagram
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ==========================================================================
   SUBCOMPONENTE: NewWhatsAppChannelConnector
   ========================================================================== */
function NewWhatsAppChannelConnector({
  companyId,
  completeWhatsAppOnboarding,
  saveWhatsAppChannel,
}: {
  companyId?: string;
  completeWhatsAppOnboarding: (token: string) => Promise<any>;
  saveWhatsAppChannel: (fd: FormData) => Promise<any>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await saveWhatsAppChannel(formData);
        setExpanded(false);
        toast.success("Canal conectado com sucesso!");
        router.refresh();
      } catch (err: any) {
        setError(err.message);
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
    <motion.div layout className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/[0.05] text-white/50 flex items-center justify-center">
            <MessageCircle size={20} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white/80">Conectar Novo WhatsApp</div>
            <div className="text-[10px] text-white/40 mt-0.5">Adicione uma linha do WhatsApp Business</div>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Cancelar" : "Conectar"}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-bold text-white/70">Conexão Automática via Facebook (Recomendado)</p>
              <button
                onClick={handleMetaLogin}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-[13px] font-semibold transition-all shadow-lg shadow-[#1877F2]/20 group"
              >
                <Facebook size={16} fill="currentColor" />
                Conectar com Meta
              </button>
              <p className="text-[10px] text-white/40 text-center">
                Método oficial e homologado. Configuração em 1 minuto.
              </p>
            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="flex-shrink mx-3 text-[9px] uppercase tracking-widest text-white/20 font-bold">Ou manual</span>
              <div className="flex-grow border-t border-white/5"></div>
            </div>

            <form onSubmit={handleConnect} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Phone Number ID</label>
                  <Input name="phone_number_id" placeholder="Ex: 1092837465..." className="h-9 text-xs" required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Nome do Canal</label>
                  <Input name="name" placeholder="Ex: WhatsApp Vendas" className="h-9 text-xs" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Access Token (Permanente)</label>
                <Input name="access_token" type="password" placeholder="EAAW..." className="h-9 text-xs" required />
              </div>

              {error && <p className="text-[10px] text-red-400 font-medium">{error}</p>}

              <Button type="submit" variant="blue" size="sm" className="w-full font-bold" disabled={pending}>
                {pending ? "Conectando..." : "Salvar Canal WhatsApp"}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ==========================================================================
   SUBCOMPONENTE: GoogleCalendarCard
   ========================================================================== */
function GoogleCalendarCard({ 
  company, 
  connected 
}: { 
  company: Company | null; 
  connected: boolean; 
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-400">
          <Calendar size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Google Calendar</div>
          <div className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5">
            {connected ? (
              <span className="flex items-center gap-1.5 text-blue-300">
                <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Conectado
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-white/40">
                <span className="flex h-1.5 w-1.5 rounded-full bg-white/20" />
                Não conectado
              </span>
            )}
          </div>
        </div>

        {connected ? (
          <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Fechar" : "Gerenciar"}
          </Button>
        ) : (
          <Button 
            variant="primary" 
            size="sm" 
            onClick={() => { window.location.href = "/api/auth/google"; }}
          >
            Conectar
          </Button>
        )}
      </div>

      <AnimatePresence>
        {connected && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <Calendar size={13} className="text-blue-300" />
              <span className="font-mono text-[12px] text-white/70">
                {company?.google_calendar_email}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-1.5 font-bold"
                onClick={() => { window.location.href = "/api/auth/google"; }}
              >
                <ExternalLink size={12} />
                Reconectar / Atualizar Agenda
              </Button>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Para revogar permanentemente o acesso à sua conta Google, remova a permissão da Agendra em{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-white hover:text-white/80"
              >
                myaccount.google.com/permissions
              </a>.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


function Flows({
  company,
  automationStats,
  automationEvents,
  webhooks,
  onChangeTab,
}: {
  company: Company | null;
  automationStats: AutomationStats;
  automationEvents: AutomationEvent[];
  webhooks: WebhookSubscription[];
  onChangeTab: (tab: TabId) => void;
}) {
  const plan = company?.plan_type ?? "trial";
  const isBusiness = plan === "business";
  const isPro = plan === "pro" || plan === "business";
  const pc = (company?.persona_config ?? {}) as Record<string, any>;

  const [reminderAdvance, setReminderAdvance] = useState<number>(pc.reminder_advance_hours ?? 2);
  const [reminderExpanded, setReminderExpanded] = useState(false);
  const [followupDelay, setFollowupDelay] = useState<number>(pc.followup_delay_hours ?? 24);
  const [followupRetries, setFollowupRetries] = useState<number>(pc.followup_max_retries ?? 2);
  const [followupExpanded, setFollowupExpanded] = useState(false);

  // Cold Leads Reactivation state
  const [reactivationDays, setReactivationDays] = useState<number>(pc.reactivation_days ?? 30);
  const [reactivationHook, setReactivationHook] = useState<string>(pc.reactivation_hook ?? "");
  const [reactivationExpanded, setReactivationExpanded] = useState(false);

  // Webhooks state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookLabel, setWebhookLabel] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["booking.created"]);
  const [webhookExpanded, setWebhookExpanded] = useState(false);
  const [webhookFormVisible, setWebhookFormVisible] = useState(false);

  const [pending, startTransition] = useTransition();
  const [savedField, setSavedField] = useState<string | null>(null);

  function saveConfig(field: string, data: Record<string, number>) {
    startTransition(async () => {
      try {
        await saveAutomationConfig(data);
        setSavedField(field);
        setTimeout(() => setSavedField(null), 2000);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  const router = useRouter();

  const handleSaveReactivation = () => {
    startTransition(async () => {
      try {
        await saveReactivationConfig({
          reactivation_days: reactivationDays,
          reactivation_hook: reactivationHook,
        });
        setSavedField("reactivation");
        setTimeout(() => setSavedField(null), 2000);
        toast.success("Configuração de reativação salva com sucesso! 🚀");
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleAddWebhook = () => {
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      toast.error("URL inválida. Use https://...");
      return;
    }
    if (!webhookEvents.length) {
      toast.error("Selecione ao menos um tipo de evento.");
      return;
    }

    startTransition(async () => {
      try {
        await saveWebhookConfig({
          url: webhookUrl,
          label: webhookLabel || undefined,
          event_types: webhookEvents,
        });
        setWebhookUrl("");
        setWebhookLabel("");
        setWebhookEvents(["booking.created"]);
        setWebhookFormVisible(false);
        toast.success("Webhook cadastrado com sucesso! 🎉");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const handleDeleteWebhook = (id: string) => {
    if (!confirm("Deseja realmente excluir este webhook?")) return;

    startTransition(async () => {
      try {
        await deleteWebhook(id);
        toast.success("Webhook excluído com sucesso!");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };
  const wh = pc.working_hours as Record<string, [string, string]> | undefined;
  const activeDaysCount = wh ? Object.keys(wh).length : 5;
  const firstDay = wh ? Object.values(wh)[0] : (["09:00", "18:00"] as [string, string]);

  const ActiveBadge = () => (
    <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-teal-500/10 text-brand-teal-300 border-brand-teal-500/20 flex items-center gap-1 shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-teal-400 animate-pulse" />
      Ativo
    </Badge>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Motor em Ação ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-blue-500/20 bg-brand-blue-500/5 p-4">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-brand-teal-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-4">
          <span className="flex h-2 w-2 rounded-full bg-brand-teal-400 shadow-[0_0_8px_#14B8A6] animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-brand-teal-300/80">Motor em Ação</span>
        </div>
        <div className="relative grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex flex-col gap-0.5">
            <span className="text-3xl font-black text-white tabular-nums">{automationStats.remindersToday}</span>
            <span className="text-[11px] text-white/40">Lembretes hoje</span>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex flex-col gap-0.5">
            <span className="text-3xl font-black text-white tabular-nums">{automationStats.followupsWeek}</span>
            <span className="text-[11px] text-white/40">Follow-ups esta semana</span>
          </div>
        </div>
      </div>

      {/* ── Cards de Automação ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">

        {/* Lembrete de Agendamento */}
        <motion.div layout className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <button
            className="w-full flex items-center gap-3 p-4 text-left"
            onClick={() => setReminderExpanded(v => !v)}
          >
            <div className="h-9 w-9 shrink-0 rounded-lg bg-brand-teal-500/15 flex items-center justify-center">
              <Bell size={16} className="text-brand-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white">Lembrete de Agendamento</div>
              <div className="text-[11px] text-white/40 mt-0.5">
                Avisa leads automaticamente {reminderAdvance}h antes do horário
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ActiveBadge />
              <ChevronDown size={14} className={cn("text-white/30 transition-transform duration-200", reminderExpanded && "rotate-180")} />
            </div>
          </button>
          <AnimatePresence>
            {reminderExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="border-t border-white/[0.06]"
              >
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                      Avisar com antecedência de
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 4, 24].map(h => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setReminderAdvance(h)}
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition-all",
                            reminderAdvance === h
                              ? "bg-brand-teal-500/20 border border-brand-teal-500/40 text-brand-teal-300"
                              : "bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70"
                          )}
                        >
                          {h === 24 ? "24h" : `${h}h`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="blue"
                    size="sm"
                    className="w-full font-bold"
                    disabled={pending}
                    onClick={() => saveConfig("reminder", { reminder_advance_hours: reminderAdvance })}
                  >
                    {savedField === "reminder" ? <><Check size={14} className="mr-1.5" />Salvo</> : pending ? "Salvando…" : "Salvar configuração"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Follow-up Inteligente */}
        <div className={cn("rounded-xl border overflow-hidden relative", isBusiness ? "border-white/[0.08] bg-white/[0.02]" : "border-white/[0.06] bg-white/[0.01]")}>
          {!isBusiness && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[rgb(11,18,34)]/60 backdrop-blur-[3px]">
              <div className="flex flex-col items-center gap-2 text-center px-6">
                <div className="h-8 w-8 rounded-full bg-brand-blue-500/20 flex items-center justify-center">
                  <Zap size={15} className="text-brand-blue-400 animate-pulse" />
                </div>
                <p className="text-[12px] font-bold text-white">Plano Business</p>
                <p className="text-[11px] text-white/40 max-w-[180px] leading-relaxed">Follow-up com IA contextual exclusivo do Business</p>
                <button
                  onClick={() => onChangeTab("billing")}
                  className="mt-1 text-[11px] font-bold text-brand-blue-400 hover:underline"
                >
                  Fazer upgrade →
                </button>
              </div>
            </div>
          )}
          <button
            className={cn("w-full flex items-center gap-3 p-4 text-left", !isBusiness && "pointer-events-none")}
            onClick={() => isBusiness && setFollowupExpanded(v => !v)}
          >
            <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", isBusiness ? "bg-brand-blue-500/15" : "bg-white/[0.04]")}>
              <MessageCircle size={16} className={isBusiness ? "text-brand-blue-400" : "text-white/20"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-[13px] font-semibold", isBusiness ? "text-white" : "text-white/40")}>
                Follow-up Inteligente
              </div>
              <div className="text-[11px] text-white/30 mt-0.5">
                IA reengaja leads silenciosos com mensagem contextual
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBusiness ? (
                <>
                  <ActiveBadge />
                  <ChevronDown size={14} className={cn("text-white/30 transition-transform duration-200", followupExpanded && "rotate-180")} />
                </>
              ) : (
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-blue-500/10 text-brand-blue-300 border-brand-blue-500/20">Business</Badge>
              )}
            </div>
          </button>
          <AnimatePresence>
            {followupExpanded && isBusiness && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="border-t border-white/[0.06]"
              >
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Disparar após silêncio de</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[12, 24, 48].map(h => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setFollowupDelay(h)}
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition-all",
                            followupDelay === h
                              ? "bg-brand-blue-500/20 border border-brand-blue-500/40 text-brand-blue-300"
                              : "bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70"
                          )}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Máx. tentativas por lead</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, 3].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setFollowupRetries(n)}
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition-all",
                            followupRetries === n
                              ? "bg-brand-blue-500/20 border border-brand-blue-500/40 text-brand-blue-300"
                              : "bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70"
                          )}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-brand-blue-500/5 border border-brand-blue-500/10 p-3">
                    <p className="text-[11px] text-brand-blue-200/60 leading-relaxed">
                      A IA gera mensagens únicas para cada lead com base no histórico da conversa — não são templates genéricos.
                    </p>
                  </div>
                  <Button
                    variant="blue"
                    size="sm"
                    className="w-full font-bold"
                    disabled={pending}
                    onClick={() => saveConfig("followup", { followup_delay_hours: followupDelay, followup_max_retries: followupRetries })}
                  >
                    {savedField === "followup" ? <><Check size={14} className="mr-1.5" />Salvo</> : pending ? "Salvando…" : "Salvar configuração"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Reativação de Leads Frios */}
        <div className={cn("rounded-xl border overflow-hidden relative", isBusiness ? "border-white/[0.08] bg-white/[0.02]" : "border-white/[0.06] bg-white/[0.01]")}>
          {!isBusiness && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[rgb(11,18,34)]/60 backdrop-blur-[3px]">
              <div className="flex flex-col items-center gap-2 text-center px-6">
                <div className="h-8 w-8 rounded-full bg-brand-blue-500/20 flex items-center justify-center">
                  <Zap size={15} className="text-brand-blue-400 animate-pulse" />
                </div>
                <p className="text-[12px] font-bold text-white">Plano Business</p>
                <p className="text-[11px] text-white/40 max-w-[180px] leading-relaxed">Reativação automática de leads frios com IA exclusivo do Business</p>
                <button
                  onClick={() => onChangeTab("billing")}
                  className="mt-1 text-[11px] font-bold text-brand-blue-400 hover:underline"
                >
                  Fazer upgrade →
                </button>
              </div>
            </div>
          )}
          <button
            className={cn("w-full flex items-center gap-3 p-4 text-left", !isBusiness && "pointer-events-none")}
            onClick={() => isBusiness && setReactivationExpanded(v => !v)}
          >
            <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", isBusiness ? "bg-brand-orange-500/15" : "bg-white/[0.04]")}>
              <RefreshCw size={16} className={isBusiness ? "text-brand-orange-400" : "text-white/20"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-[13px] font-semibold", isBusiness ? "text-white" : "text-white/40")}>
                Reativação de Leads Frios
              </div>
              <div className="text-[11px] text-white/30 mt-0.5">
                Lead inativo por {reactivationDays} dias recebe mensagem de reabertura com IA
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isBusiness ? (
                <>
                  {pc.reactivation_hook ? <ActiveBadge /> : (
                    <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-orange-500/10 text-brand-orange-300 border-brand-orange-500/20">
                      Configurar
                    </Badge>
                  )}
                  <ChevronDown size={14} className={cn("text-white/30 transition-transform duration-200", reactivationExpanded && "rotate-180")} />
                </>
              ) : (
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-blue-500/10 text-brand-blue-300 border-brand-blue-500/20">Business</Badge>
              )}
            </div>
          </button>
          <AnimatePresence>
            {reactivationExpanded && isBusiness && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="border-t border-white/[0.06]"
              >
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Inativo há quantos dias</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[14, 30, 60, 90].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setReactivationDays(d)}
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition-all",
                            reactivationDays === d
                              ? "bg-brand-orange-500/20 border border-brand-orange-500/40 text-brand-orange-300"
                              : "bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70"
                          )}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Gancho / Oferta de Reativação</label>
                    <textarea
                      value={reactivationHook}
                      onChange={e => setReactivationHook(e.target.value)}
                      placeholder="Ex.: Estamos com 20% de desconto esta semana. Quer aproveitar e agendar?"
                      rows={3}
                      maxLength={500}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none resize-none transition placeholder:text-white/20 focus:border-brand-orange-500/50 focus:bg-white/[0.06]"
                    />
                    <p className="text-[10px] text-white/30">
                      A IA usa este contexto para personalizar uma mensagem única para cada lead com base no histórico de conversa.
                    </p>
                  </div>
                  <Button
                    variant="blue"
                    size="sm"
                    className="w-full font-bold bg-brand-orange-500 hover:bg-brand-orange-500/90 shadow-orange-500/20"
                    disabled={pending}
                    onClick={handleSaveReactivation}
                  >
                    {savedField === "reactivation" ? <><Check size={14} className="mr-1.5" />Salvo</> : pending ? "Salvando…" : "Salvar configuração"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Janela de Silêncio */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-brand-orange-500/10 flex items-center justify-center">
            <Clock size={16} className="text-brand-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white">Janela de Silêncio</div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {activeDaysCount} dias · {firstDay[0]}–{firstDay[1]}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ActiveBadge />
            <button
              onClick={() => onChangeTab("rules")}
              className="text-[11px] font-bold text-brand-blue-400 hover:underline"
            >
              Configurar →
            </button>
          </div>
        </div>

        {/* Webhooks */}
        <div className={cn("rounded-xl border overflow-hidden relative", isPro ? "border-white/[0.08] bg-white/[0.02]" : "border-white/[0.06] bg-white/[0.01]")}>
          {!isPro && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[rgb(11,18,34)]/60 backdrop-blur-[3px]">
              <div className="flex flex-col items-center gap-2 text-center px-6">
                <div className="h-8 w-8 rounded-full bg-brand-blue-500/20 flex items-center justify-center">
                  <Zap size={15} className="text-brand-blue-400 animate-pulse" />
                </div>
                <p className="text-[12px] font-bold text-white">Plano Pro</p>
                <p className="text-[11px] text-white/40 max-w-[180px] leading-relaxed">Webhooks para Zapier, Make e sistemas externos no plano Pro+</p>
                <button
                  onClick={() => onChangeTab("billing")}
                  className="mt-1 text-[11px] font-bold text-brand-blue-400 hover:underline"
                >
                  Fazer upgrade →
                </button>
              </div>
            </div>
          )}
          <button
            className={cn("w-full flex items-center gap-3 p-4 text-left", !isPro && "pointer-events-none")}
            onClick={() => isPro && setWebhookExpanded(v => !v)}
          >
            <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", isPro ? "bg-brand-teal-500/15" : "bg-white/[0.04]")}>
              <GitBranch size={16} className={isPro ? "text-brand-teal-400" : "text-white/20"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn("text-[13px] font-semibold", isPro ? "text-white" : "text-white/40")}>
                Webhooks (Zapier / Make)
              </div>
              <div className="text-[11px] text-white/30 mt-0.5">
                {webhooks.length > 0 ? `${webhooks.length} endpoint${webhooks.length > 1 ? "s" : ""} cadastrado${webhooks.length > 1 ? "s" : ""}` : "Envie eventos em tempo real para sistemas externos"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPro ? (
                <>
                  {webhooks.length > 0 ? <ActiveBadge /> : (
                    <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-teal-500/10 text-brand-teal-300 border-brand-teal-500/20">
                      {webhooks.length} endpoints
                    </Badge>
                  )}
                  <ChevronDown size={14} className={cn("text-white/30 transition-transform duration-200", webhookExpanded && "rotate-180")} />
                </>
              ) : (
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5 bg-brand-blue-500/10 text-brand-blue-300 border-brand-blue-500/20">Pro+</Badge>
              )}
            </div>
          </button>
          <AnimatePresence>
            {webhookExpanded && isPro && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="border-t border-white/[0.06]"
              >
                <div className="p-4 flex flex-col gap-4">
                  {/* Existing webhooks list */}
                  {webhooks.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {webhooks.map(wh => (
                        <div key={wh.id} className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-white/90 truncate">{wh.label ?? wh.url}</p>
                            <p className="text-[10px] text-white/35 truncate">{wh.url}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {wh.event_types.map(ev => (
                                <span key={ev} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand-teal-500/10 text-brand-teal-300 border border-brand-teal-500/20">
                                  {ev}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteWebhook(wh.id)}
                            className="ml-3 h-8 w-8 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                            title="Excluir webhook"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add webhook form */}
                  <AnimatePresence>
                    {webhookFormVisible ? (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-3 p-4 rounded-xl border border-brand-teal-500/20 bg-brand-teal-500/5"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-teal-300/70">Novo Webhook</p>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-white/40">URL do Endpoint *</label>
                          <Input
                            value={webhookUrl}
                            onChange={e => setWebhookUrl(e.target.value)}
                            placeholder="https://hooks.zapier.com/hooks/catch/..."
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-white/40">Nome amigável (opcional)</label>
                          <Input
                            value={webhookLabel}
                            onChange={e => setWebhookLabel(e.target.value)}
                            placeholder="Ex.: Zapier CRM"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-white/40">Eventos</label>
                          <div className="flex flex-wrap gap-2">
                            {["booking.created", "lead.status_changed", "followup.sent", "reminder.sent"].map(ev => (
                              <button
                                key={ev}
                                type="button"
                                onClick={() =>
                                  setWebhookEvents(prev =>
                                    prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
                                  )
                                }
                                className={cn(
                                  "text-[10px] font-mono px-2 py-1 rounded-lg border transition",
                                  webhookEvents.includes(ev)
                                    ? "bg-brand-teal-500/20 border-brand-teal-500/40 text-brand-teal-300"
                                    : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/70"
                                )}
                              >
                                {ev}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="blue"
                            size="sm"
                            className="flex-1 font-bold"
                            disabled={pending || !webhookUrl}
                            onClick={handleAddWebhook}
                          >
                            {pending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
                            Adicionar
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => { setWebhookFormVisible(false); setWebhookUrl(""); setWebhookLabel(""); }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWebhookFormVisible(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/20 text-[12px] font-semibold transition"
                      >
                        <Plus size={14} />
                        Adicionar endpoint
                      </button>
                    )}
                  </AnimatePresence>
                  
                  <div className="rounded-lg bg-brand-teal-500/5 border border-brand-teal-500/10 p-3">
                    <p className="text-[11px] text-brand-teal-200/60 leading-relaxed">
                      Cada requisição é assinada com HMAC-SHA256. Valide a assinatura no header <code className="text-brand-teal-300 text-[10px]">X-Agendra-Signature</code>.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Atividade Recente ──────────────────────────────────── */}
      {automationEvents.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-0.5">Atividade Recente</h4>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] overflow-hidden">
            {automationEvents.slice(0, 10).map(ev => {
              const Icon = ev.type === "reminder_sent" ? Bell : ev.type === "followup_sent" ? MessageCircle : RefreshCw;
              const color = ev.type === "reminder_sent"
                ? "text-brand-teal-400"
                : ev.type === "followup_sent"
                ? "text-brand-blue-400"
                : "text-brand-orange-400";
              return (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                  <Icon size={13} className={cn("shrink-0", color)} />
                  <span className="flex-1 text-[12px] text-white/60 truncate">{ev.detail ?? ev.type}</span>
                  <span className="text-[10px] text-white/25 shrink-0 tabular-nums">{formatTimeAgo(ev.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {automationEvents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center rounded-xl border border-dashed border-white/[0.06]">
          <Zap size={20} className="text-white/15" />
          <p className="text-[12px] text-white/30 font-medium">Nenhuma automação executada ainda</p>
          <p className="text-[11px] text-white/20 max-w-xs leading-relaxed">
            O feed de atividade aparece aqui após os primeiros agendamentos e follow-ups.
          </p>
        </div>
      )}
    </div>
  );
}

function Team({ memberships, company, pendingInvitations }: { memberships: Member[]; company: Company | null; pendingInvitations: PendingInvitation[] }) {
  const [companyName, setCompanyName] = useState(company?.name ?? "");
  const [savingName, startNameTransition] = useTransition();
  const [nameSaved, setNameSaved] = useState(false);

  // Pending invitations state
  const [pendingList, setPendingList] = useState<PendingInvitation[]>(pendingInvitations);
  const [cancelPending, startCancelTransition] = useTransition();
  const [resendPending, startResendTransition] = useTransition();

  function handleCancel(invitationId: string) {
    startCancelTransition(async () => {
      try {
        await cancelInvitation(invitationId);
        setPendingList((prev) => prev.filter((i) => i.id !== invitationId));
        toast.success("Convite cancelado.");
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  function handleResend(invitationId: string) {
    startResendTransition(async () => {
      try {
        await resendInvitation(invitationId);
        toast.success("Convite reenviado com sucesso.");
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [invitePending, startInviteTransition] = useTransition();
  const [inviteSent, setInviteSent] = useState(false);

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    startNameTransition(async () => {
      try {
        await updateCompany({ name: companyName });
        setNameSaved(true);
        setTimeout(() => setNameSaved(false), 3000);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("E-mail inválido.");
      return;
    }
    startInviteTransition(async () => {
      try {
        await inviteTeamMember(inviteEmail, inviteRole);
        setInviteSent(true);
        toast.success(`Convite enviado para ${inviteEmail} 🎉`);
        setTimeout(() => {
          setInviteOpen(false);
          setInviteEmail("");
          setInviteRole("member");
          setInviteSent(false);
        }, 2000);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  const COLORS = [
    "linear-gradient(135deg,#3B82F6,#14B8A6)",
    "linear-gradient(135deg,#F97316,#FB923C)",
    "linear-gradient(135deg,#0F766E,#14B8A6)",
    "linear-gradient(135deg,#1D4ED8,#3B82F6)",
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Empresa */}
      <Card>
        <CardHeader>
          <CardTitle>Empresa</CardTitle>
          <CardDescription>Informações do negócio cadastrado.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="flex flex-col gap-4">
            <Field label="Nome da empresa">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex.: Clínica Estética Silva"
                required
              />
            </Field>
            <Button type="submit" variant="blue" size="sm" className="w-full font-bold" disabled={savingName}>
              {nameSaved ? <><Check size={14} className="mr-2" />Salvo ✓</> : savingName ? "Salvando…" : "Salvar empresa"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Time */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Time</CardTitle>
            <CardDescription>{memberships.length} {memberships.length === 1 ? "membro" : "membros"}</CardDescription>
          </div>
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
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

      {/* Convites Pendentes */}
      {pendingList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Convites Pendentes</CardTitle>
            <CardDescription>{pendingList.length} convite{pendingList.length !== 1 ? "s" : ""} aguardando resposta</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {pendingList.map((inv) => {
                const expiresAt = new Date(inv.expires_at);
                const now = new Date();
                const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                const expiresSoon = daysLeft <= 2;
                return (
                  <motion.div
                    key={inv.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-dashed border-white/20 bg-white/[0.04] text-white/30">
                      <UserPlus size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{inv.invited_email}</div>
                      <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: expiresSoon ? "#F97316" : "var(--color-fg-3)" }}>
                        <Clock size={10} />
                        {expiresSoon ? `Expira em ${daysLeft}d` : `${daysLeft} dias restantes`}
                        <span className="text-white/20">·</span>
                        <Badge variant={inv.role === "admin" ? "hot" : "cold"}>{inv.role}</Badge>
                        <span className="text-white/20">·</span>
                        <span style={{ color: "var(--color-fg-3)" }}>
                          Enviado {new Date(inv.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {expiresSoon && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-brand-teal-400 hover:bg-brand-teal-500/10 hover:text-brand-teal-300"
                          onClick={() => handleResend(inv.id)}
                          disabled={resendPending}
                        >
                          <RefreshCw size={12} className="mr-1" />
                          Reenviar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => handleCancel(inv.id)}
                        disabled={cancelPending}
                      >
                        <Trash2 size={12} className="mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </CardContent>
        </Card>
      )}

      {/* Modal de Convite */}
      <AnimatePresence>
        {inviteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
            onClick={() => setInviteOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass rounded-2xl border border-brand-blue-500/20 p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-brand-blue-500/10 pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-5">
                <div>
                  <h3 className="text-lg font-bold text-white">Convidar membro do time</h3>
                  <p className="text-sm text-white/50 mt-1">Convide alguém para gerenciar sua conta Agendra</p>
                </div>
                <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-white/40">E-mail</label>
                    <Input
                      type="email"
                      placeholder="colega@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={invitePending}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-white/40">Perfil</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["member", "admin"].map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setInviteRole(role as "admin" | "member")}
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition-all",
                            inviteRole === role
                              ? "bg-brand-blue-500/30 border border-brand-blue-500/50 text-brand-blue-300"
                              : "bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70"
                          )}
                        >
                          {role === "admin" ? "Admin" : "Membro"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setInviteOpen(false)}
                      disabled={invitePending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="blue"
                      size="sm"
                      className="flex-1 font-bold"
                      disabled={invitePending || !inviteEmail}
                    >
                      {invitePending ? "Enviando..." : "Enviar Convite"}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
      toast.error("Erro ao iniciar checkout. Tente novamente.");
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
      toast.error("Erro ao abrir gerenciamento de assinatura. Tente novamente.");
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

  const trialDaysRemaining = usage?.trialDaysRemaining ?? null;
  const isOnTrial = currentPlan === "trial";

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Banner de Trial */}
      {isOnTrial && (
        <Card className={cn(
          "border-brand-blue-500/30",
          trialDaysRemaining === 0 ? "bg-red-500/5 border-red-500/30" : "bg-brand-blue-500/5"
        )}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-full",
              trialDaysRemaining === 0 ? "bg-red-500/20 text-red-400" : "bg-brand-blue-500/20 text-brand-blue-400"
            )}>
              <Clock size={16} />
            </div>
            <div className="flex-1">
              <p className={cn(
                "text-sm font-semibold",
                trialDaysRemaining === 0 ? "text-red-300" : "text-brand-blue-300"
              )}>
                {trialDaysRemaining === 0
                  ? "Período de teste expirado"
                  : trialDaysRemaining === 1
                  ? "Último dia do período de teste!"
                  : `${trialDaysRemaining} dias restantes no trial`}
              </p>
              <p className={cn(
                "text-xs mt-0.5",
                trialDaysRemaining === 0 ? "text-red-300/60" : "text-brand-blue-300/70"
              )}>
                {trialDaysRemaining === 0
                  ? "Assine agora para reativar a IA."
                  : "Assine antes do término para não perder o acesso."}
              </p>
            </div>
            {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
              <div className="shrink-0 flex flex-col items-center">
                <span className="text-3xl font-black text-brand-blue-300 tabular-nums leading-none">{trialDaysRemaining}</span>
                <span className="text-[9px] text-brand-blue-400/60 uppercase tracking-wider">{trialDaysRemaining === 1 ? "dia" : "dias"}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            Anual <Badge variant="hot" className="text-[9px] px-1 py-0 h-4">-25%</Badge>
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

    </div>
  );
}

const DURATION_OPTIONS = [
  { value: 15, label: "15 min" }, { value: 30, label: "30 min" },
  { value: 45, label: "45 min" }, { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" }, { value: 120, label: "2 horas" },
];

function Services({
  companyId,
  services,
  businessType,
}: {
  companyId?: string;
  services: Service[];
  businessType?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: "", price: "", duration: 60, description: "" });

  const placeholders = getPlaceholdersByBusinessType(businessType);

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditValues({ name: s.name, price: s.price?.toString() ?? "", duration: s.duration, description: s.description ?? "" });
  }

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

  async function handleUpdate(id: string) {
    startTransition(async () => {
      try {
        await updateService(id, {
          name: editValues.name.trim(),
          price: editValues.price ? parseFloat(editValues.price) : null,
          duration: editValues.duration,
          description: editValues.description.trim() || null,
        });
        setEditingId(null);
        toast.success("Serviço atualizado!");
      } catch (err: any) {
        toast.error("Erro ao atualizar: " + err.message);
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

  async function handleToggleStatus(id: string, isPaused: boolean) {
    startTransition(async () => {
      try {
        await toggleServiceStatus(id, isPaused);
        toast.success(isPaused ? "Serviço pausado!" : "Serviço ativado!");
      } catch (err: any) {
        toast.error("Erro ao alterar status: " + err.message);
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
          onClick={() => { setIsAdding(true); setEditingId(null); }}
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
                  <Input name="name" placeholder={placeholders.singleService} required />
                </Field>
                <Field label="Preço (R$)">
                  <Input name="price" type="number" step="0.01" placeholder={placeholders.price} />
                </Field>
              </div>
              <Field label="Duração (minutos)">
                <select
                  name="duration"
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500/50"
                  defaultValue="60"
                >
                  {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                <Button variant="ghost" size="sm" type="button" onClick={() => setIsAdding(false)}>Cancelar</Button>
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
        {services.map((s) =>
          editingId === s.id ? (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass p-4 rounded-xl border border-brand-blue-500/20"
            >
              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                <Field label="Nome do Serviço">
                  <Input
                    value={editValues.name}
                    onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Preço (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={editValues.price}
                    onChange={(e) => setEditValues((v) => ({ ...v, price: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Duração (minutos)">
                <select
                  value={editValues.duration}
                  onChange={(e) => setEditValues((v) => ({ ...v, duration: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500/50"
                >
                  {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="ghost" size="sm" type="button" onClick={() => setEditingId(null)}>Cancelar</Button>
                <Button variant="blue" size="sm" type="button" onClick={() => handleUpdate(s.id)} disabled={pending}>
                  {pending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </motion.div>
          ) : (
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
                        R$ {new Intl.NumberFormat('pt-BR', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s.price)}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-[10px] text-white/30 mt-0.5 max-w-[200px] truncate">{s.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2 mr-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">
                    {s.is_paused ? "Pausado" : "Ativo"}
                  </span>
                  <Switch
                    checked={!s.is_paused}
                    onChange={(val: boolean) => handleToggleStatus(s.id, !val)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/40 hover:text-white"
                  onClick={() => startEdit(s)}
                >
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
          )
        )}
      </div>
    </div>
  );
}

function Rules({ company }: { company: Company | null }) {
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
          
          {error && <p className="mb-4 text-xs text-red-400 font-medium mt-4">{error}</p>}
          <Button type="submit" variant="blue" size="sm" className="w-full font-bold h-10 mt-4" disabled={pending}>
            {saved ? <><Check size={14} className="mr-2" /> Salvo ✓</> : pending ? "Salvando…" : "Salvar regras"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Agora';
  if (min < 60) return `Há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h}h`;
  return `Há ${Math.floor(h / 24)} dias`;
}

function LogsView({ logs, companyId, planType }: { logs: AiDecisionLog[]; companyId: string | null; planType?: PlanType | null }) {
  const isBusiness = planType === "business";
  const initialLimit = isBusiness ? 15 : 10;
  const [visibleCount, setVisibleCount] = useState(initialLimit);
  const [liveLogs, setLiveLogs] = useState<AiDecisionLog[]>(logs);
  const [pulseId, setPulseId] = useState<string | null>(null);

  // Realtime subscription — only Business tier gets live updates (Pro relies on refresh
  // to keep payload light; both tiers still see the same persisted data).
  useEffect(() => {
    if (!companyId || !isBusiness) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`mente-da-ia-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_decision_logs", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row = payload.new as AiDecisionLog & { company_id?: string };
          // Defensive: drop anything that slipped past the RLS/filter
          if ((row as any).company_id && (row as any).company_id !== companyId) return;
          setLiveLogs((prev) => {
            if (prev.some((l) => l.id === row.id)) return prev;
            return [row, ...prev].slice(0, 100);
          });
          setPulseId(row.id);
          setTimeout(() => setPulseId(null), 1500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, isBusiness]);

  const visibleLogs = liveLogs.slice(0, visibleCount);
  const triggerHint = isBusiness
    ? "Logs gerados a cada 5 respostas da IA + sempre em agendamentos, cancelamentos, mudanças de status e primeira interação."
    : "Logs gerados a cada 10 respostas da IA + sempre em agendamentos, cancelamentos, mudanças de status e primeira interação. Upgrade para Business desbloqueia atualização em tempo real e logs a cada 5 respostas.";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mente da IA (Explainability)</CardTitle>
              <CardDescription>Audite as decisões da IA{isBusiness ? " em tempo real" : ""}.</CardDescription>
            </div>
            <Badge variant="hot" className="text-[10px]">BETA</Badge>
          </div>
          <p className="text-[11px] text-white/40 mt-2 leading-relaxed">{triggerHint}</p>
        </CardHeader>
        <CardContent>
          {liveLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-white/[0.04] flex items-center justify-center">
                <Zap size={22} className="text-white/20" />
              </div>
              <p className="text-sm font-medium text-white/40">Nenhuma decisão registrada ainda</p>
              <p className="text-[12px] text-white/25 max-w-xs leading-relaxed">
                Os logs aparecem em interações relevantes: primeira mensagem, agendamento, cancelamento, mudança de status e a cada {isBusiness ? "5" : "10"} respostas da IA.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleLogs.map(log => {
                const isPositive = (log.sentiment_score ?? 0) >= 0;
                const leadName = log.leads?.[0]?.name ?? 'Lead';
                const timeAgo = formatTimeAgo(log.created_at);
                const isPulsing = pulseId === log.id;
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "p-4 rounded-xl border bg-white/[0.02] transition-all",
                      isPulsing
                        ? "border-brand-teal-400/60 shadow-[0_0_24px_rgba(45,212,191,0.18)]"
                        : "border-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          log.urgency_detected ? "bg-brand-orange-400" : isPositive ? "bg-brand-teal-400" : "bg-white/20"
                        )} />
                        <span className="text-[13px] font-bold text-white">{leadName}</span>
                        {log.intent_detected && (
                          <Badge variant="neutral" className="text-[9px] bg-white/5 border-white/10">{log.intent_detected}</Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-white/40">{timeAgo}</span>
                    </div>
                    {log.rationale && (
                      <p className="text-[12px] text-white/60 leading-relaxed mb-3">{log.rationale}</p>
                    )}
                    <div className="flex items-center gap-4 border-t border-white/5 pt-3 mt-1">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold mb-0.5">Sentimento</span>
                        <span className={cn("text-[12px] font-mono", isPositive ? "text-brand-teal-300" : "text-brand-orange-300")}>
                          {log.sentiment_score != null ? (log.sentiment_score >= 0 ? '+' : '') + log.sentiment_score.toFixed(2) : '—'}
                        </span>
                      </div>
                      {log.objection_handled && (
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold mb-0.5">Objeção tratada</span>
                          <span className="text-[12px] font-mono text-white/80 truncate max-w-[180px]">{log.objection_handled}</span>
                        </div>
                      )}
                      {log.urgency_detected && (
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold mb-0.5">Urgência</span>
                          <span className="text-[12px] font-mono text-brand-orange-300">Detectada</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {liveLogs.length > visibleCount && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-white/40 hover:text-white/70 mt-1"
                  onClick={() => setVisibleCount((v) => v + 10)}
                >
                  Ver mais ({liveLogs.length - visibleCount} restantes)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
