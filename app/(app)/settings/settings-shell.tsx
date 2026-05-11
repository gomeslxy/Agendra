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
  MoreHorizontal,
  GitBranch,
  Slack,
  UserPlus,
  Cpu,
  MessageSquare,
  Users,
  CreditCard,
  Loader2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updatePersona } from "./actions";
import { trackEvent } from "@/lib/analytics";
import { STRIPE_PRICE_IDS, PLANS_META } from "@/lib/billing/plans";
import type { PlanType } from "@/lib/billing/plans";

type TabId = "persona" | "channels" | "flows" | "team" | "billing";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "persona",  label: "Persona",   icon: Cpu },
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

interface Company {
  id: string;
  name: string;
  ai_name?: string | null;
  ai_tone?: string | null;
  ai_greeting?: string | null;
  ai_forbidden?: string | null;
  plan_type?: PlanType | null;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  google_calendar_email?: string | null;
}

interface SettingsShellProps {
  company: Company | null;
  memberships: Member[];
  usage: any;
}

export function SettingsShell({ company, memberships, usage }: SettingsShellProps) {
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
    if (!gcal) return;
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
        {tab === "persona"  && <Persona company={company} />}
        {tab === "channels" && <Channels company={company} />}
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

function ToggleRow({
  title,
  sub,
  defaultChecked = false,
}: {
  title: string;
  sub: string;
  defaultChecked?: boolean;
}) {
  const [v, setV] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] py-3.5 last:border-b-0 transition-all duration-200 hover:bg-white/[0.01] -mx-4 px-4 rounded-lg">
      <div className="pr-4">
        <div className="text-[13px] font-bold tracking-tight">{title}</div>
        <div className="mt-0.5 text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>{sub}</div>
      </div>
      <Switch checked={v} onChange={setV} label={title} />
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
function Persona({ company }: { company: Company | null }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Voz da marca</CardTitle>
            <CardDescription>Como Agendra fala com seus leads.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Nome da IA">
              <Input name="ai_name" defaultValue={company?.ai_name ?? "Agendra"} />
            </Field>
            <Field label="Saudação padrão">
              <Input name="ai_greeting" defaultValue={company?.ai_greeting ?? "Oi! Sou a Agendra 👋"} />
            </Field>
            <Field label="Tom padrão">
              <ToneSelect defaultValue={company?.ai_tone ?? "warm"} />
            </Field>
            <Field label="Frases proibidas">
              <Input name="ai_forbidden" defaultValue={company?.ai_forbidden ?? ""} placeholder="Ex.: 'desculpe pelo transtorno'" />
            </Field>
            {error && <p className="mb-4 text-xs text-red-400 font-medium">{error}</p>}
            <Button type="submit" variant="blue" size="sm" className="w-full font-bold h-10" disabled={pending}>
              {saved ? <><Check size={14} className="mr-2" /> Salvo ✓</> : pending ? "Salvando…" : "Salvar persona"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Comportamento</CardTitle>
          <CardDescription>Quando agir e quando passar pra humano.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          <ToggleRow title="Responder em até 4 segundos" sub="Garantia de SLA — falha = alerta no Slack" defaultChecked />
          <ToggleRow title="Qualificar antes de agendar" sub="5 perguntas-chave de heat scoring" defaultChecked />
          <ToggleRow title="Passar pra humano se score < 30" sub="Lead frio vai pra fila do atendente" />
          <ToggleRow title="Confirmar 1 dia antes" sub="Reduz no-shows em ~38%" defaultChecked />
        </CardContent>
      </Card>
    </div>
  );
}

type ChannelAction =
  | { kind: "google-connect" }
  | { kind: "google-manage"; email: string }
  | { kind: "coming-soon" };

interface ChannelItem {
  name: string;
  Icon: LucideIcon;
  ok: boolean;
  bg: string;
  col: string;
  action: ChannelAction;
}

function Channels({ company }: { company: Company | null }) {
  const gcalConnected = !!company?.google_calendar_email;

  const items: ChannelItem[] = [
    {
      name: "WhatsApp Business", Icon: MessageCircle, ok: true,
      bg: "rgba(20,184,166,0.14)", col: "#14B8A6",
      action: { kind: "coming-soon" },
    },
    {
      name: "Instagram DM", Icon: Instagram, ok: true,
      bg: "rgba(249,115,22,0.14)", col: "#F97316",
      action: { kind: "coming-soon" },
    },
    {
      name: "Site (formulário)", Icon: Globe, ok: true,
      bg: "rgba(37,99,235,0.14)", col: "#3B82F6",
      action: { kind: "coming-soon" },
    },
    {
      name: "Facebook Messenger", Icon: Facebook, ok: false,
      bg: "rgba(255,255,255,0.05)", col: "var(--color-fg-3)",
      action: { kind: "coming-soon" },
    },
    {
      name: "Google Calendar", Icon: Calendar,
      ok: gcalConnected,
      bg: "rgba(37,99,235,0.14)", col: "#60A5FA",
      action: gcalConnected
        ? { kind: "google-manage", email: company!.google_calendar_email! }
        : { kind: "google-connect" },
    },
    {
      name: "Slack", Icon: Slack, ok: false,
      bg: "rgba(255,255,255,0.05)", col: "var(--color-fg-3)",
      action: { kind: "coming-soon" },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {items.map((c) => (
        <ChannelCard key={c.name} item={c} />
      ))}
    </div>
  );
}

function ChannelCard({ item: c }: { item: ChannelItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]"
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
            className="mt-0.5 font-mono text-[11px] font-medium"
            style={{ color: c.ok ? "var(--color-brand-teal-300)" : "var(--color-fg-3)" }}
          >
            {c.ok ? "● Conectado" : "○ Não conectado"}
          </div>
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

        {c.action.kind === "coming-soon" && (
          <Button variant="ghost" size="sm" disabled className="cursor-not-allowed opacity-50">
            Em breve
          </Button>
        )}
      </div>

      {/* Google Calendar management panel */}
      <AnimatePresence>
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
  const flows = [
    { name: "Captação clareamento",     n: 142, on: true,  trigger: "Anúncio Meta · clareamento" },
    { name: "Reagendamento automático", n: 38,  on: true,  trigger: "No-show detectado" },
    { name: "Recuperação de frio",      n: 21,  on: false, trigger: "Score < 30 há 7 dias" },
    { name: "Boas-vindas Instagram",    n: 67,  on: true,  trigger: "Primeiro contato no DM" },
  ];

  return (
    <Card className="p-0 border-white/[0.06]">
      <CardHeader className="p-6 pb-2">
        <CardTitle>Fluxos ativos</CardTitle>
        <CardDescription>Sequências de mensagens disparadas por gatilho.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <div className="flex flex-col gap-2">
          {flows.map((f) => (
            <FlowRow key={f.name} {...f} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FlowRow({ name, n, trigger, on }: { name: string; n: number; trigger: string; on: boolean }) {
  const [v, setV] = useState(on);
  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5"
    >
      <GitBranch size={18} className="text-brand-blue-300" />
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{name}</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--color-fg-3)" }}>
          {trigger} · {n} disparos esta semana
        </div>
      </div>
      <Switch checked={v} onChange={setV} label={name} />
      <Button variant="ghost" size="sm" onClick={() => alert("Editar fluxo: " + name)}>
        <MoreHorizontal size={16} />
      </Button>
    </motion.div>
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
  const isSubscriptionActive = company?.subscription_status === "active";

  // [FIX ARCH-1] Price IDs agora vêm do single source of truth
  const plans = PLANS_META.map((p) => ({
    ...p,
    priceId: STRIPE_PRICE_IDS[p.id][isAnnual ? "annual" : "monthly"],
  }));

  const leadsUsed = usage?.usage?.leads || 0;
  const leadsMax = usage?.limits?.maxLeads || 150;
  const leadsPct = Math.min(100, Math.round((leadsUsed / leadsMax) * 100));

  return (
    <div className="flex flex-col gap-6 pb-12">
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
          {isSubscriptionActive ? (
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
          const isActive = isSubscriptionActive && currentPlan === p.id;
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
                disabled={isActive || loading !== null}
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
