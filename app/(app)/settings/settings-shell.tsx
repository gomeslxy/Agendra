"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Check,
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  MoreHorizontal,
  GitBranch,
  Slack,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updatePersona } from "./actions";

type TabId = "persona" | "channels" | "flows" | "team" | "billing";

const TABS: { id: TabId; label: string }[] = [
  { id: "persona",  label: "Persona da IA" },
  { id: "channels", label: "Canais" },
  { id: "flows",    label: "Fluxos" },
  { id: "team",     label: "Atendentes" },
  { id: "billing",  label: "Faturamento" },
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
}

interface SettingsShellProps {
  company: Company | null;
  memberships: Member[];
}

export function SettingsShell({ company, memberships }: SettingsShellProps) {
  const [tab, setTab] = useState<TabId>("persona");

  useEffect(() => {
    const fromHash = (window.location.hash || "").replace("#", "") as TabId;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);

  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-8 py-7">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Configurações</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-fg-2)" }}>
          Personalize Agendra para seu negócio.
        </p>
      </header>

      <div className="relative mb-6 flex gap-1 overflow-x-auto border-b border-white/[0.08]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              history.replaceState(null, "", "#" + t.id);
            }}
            className={cn(
              "relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
              tab === t.id ? "text-white" : "text-fg-2 hover:text-white",
            )}
            style={tab === t.id ? undefined : { color: "var(--color-fg-2)" }}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-blue-600"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {tab === "persona"  && <Persona company={company} />}
        {tab === "channels" && <Channels />}
        {tab === "flows"    && <Flows />}
        {tab === "team"     && <Team memberships={memberships} />}
        {tab === "billing"  && <Billing />}
      </motion.div>
    </div>
  );
}

function Card({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      {sub && <p className="mb-4 mt-1 text-xs" style={{ color: "var(--color-fg-3)" }}>{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
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
            <Field label="Tom">
              <Input name="ai_tone" defaultValue={company?.ai_tone ?? "Próxima, calorosa, com bom português brasileiro"} />
            </Field>
            <Field label="Saudação padrão">
              <Input name="ai_greeting" defaultValue={company?.ai_greeting ?? "Oi! Sou a Agendra 👋"} />
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

function Channels() {
  const items: {
    name: string; Icon: LucideIcon; ok: boolean; bg: string; col: string;
  }[] = [
    { name: "WhatsApp Business",  Icon: MessageCircle, ok: true,  bg: "rgba(20,184,166,0.14)", col: "#14B8A6" },
    { name: "Instagram DM",       Icon: Instagram,     ok: true,  bg: "rgba(249,115,22,0.14)", col: "#F97316" },
    { name: "Site (formulário)",  Icon: Globe,         ok: true,  bg: "rgba(37,99,235,0.14)",  col: "#3B82F6" },
    { name: "Facebook Messenger", Icon: Facebook,      ok: false, bg: "rgba(255,255,255,0.05)", col: "var(--color-fg-3)" },
    { name: "Google Calendar",    Icon: Calendar,      ok: true,  bg: "rgba(37,99,235,0.14)",  col: "#60A5FA" },
    { name: "Slack",              Icon: Slack,         ok: false, bg: "rgba(255,255,255,0.05)", col: "var(--color-fg-3)" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <motion.div
          key={c.name}
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"
        >
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: c.bg, color: c.col }}
          >
            <c.Icon size={20} />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">{c.name}</div>
            <div
              className="mt-0.5 font-mono text-[11px] font-medium"
              style={{ color: c.ok ? "var(--color-brand-teal-300)" : "var(--color-fg-3)" }}
            >
              {c.ok ? "● Conectado" : "Não conectado"}
            </div>
          </div>
          <Button
            variant={c.ok ? "secondary" : "primary"}
            size="sm"
            onClick={() => alert("em breve")}
          >
            {c.ok ? "Gerenciar" : "Conectar"}
          </Button>
        </motion.div>
      ))}
    </div>
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
      <div className="mb-3.5 flex items-center gap-3">
        <div className="flex-1">
          <h3 className="text-base font-semibold">Time</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--color-fg-3)" }}>{memberships.length} membros</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => alert("em breve")}>
          <UserPlus size={14} />
          Convidar
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {memberships.map((m, i) => {
          const u = Array.isArray(m.users) ? m.users[0] : m.users;
          const name = u?.full_name ?? u?.email ?? "Usuário";
          const email = u?.email ?? "";
          const initials = name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
            >
              <div
                className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white"
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
      </div>
    </div>
  );
}

function Billing() {
  return (
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
          <CardDescription>Pro · Faturado mensalmente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="my-2 text-4xl font-bold tracking-tight">
            R$ 297<span className="text-sm font-medium ml-1" style={{ color: "var(--color-fg-3)" }}>/mês</span>
          </div>
          <p className="text-[11px] font-medium" style={{ color: "var(--color-fg-3)" }}>Próxima cobrança: 04/06/2026</p>
          <div className="mt-6 flex gap-2">
            <Button
              variant="blue"
              size="sm"
              className="flex-1 font-bold"
              onClick={() => window.open("https://billing.stripe.com/p/login/test_placeholder", "_blank")}
            >
              Mudar plano
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 font-medium"
              onClick={() => window.open("https://billing.stripe.com/p/login/test_placeholder", "_blank")}
            >
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uso este mês</CardTitle>
          <CardDescription>Limites do plano Pro</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { lbl: "Mensagens",     pct: 64, n: "6,4k / 10k",  col: "#3B82F6" },
            { lbl: "Agendamentos",  pct: 38, n: "184 / 500",   col: "#F97316" },
            { lbl: "Atendentes",    pct: 80, n: "4 / 5",       col: "#14B8A6" },
          ].map((u) => (
            <div
              key={u.lbl}
              className="grid items-center gap-4"
              style={{ gridTemplateColumns: "100px 1fr 80px" }}
            >
              <span className="text-xs font-medium" style={{ color: "var(--color-fg-2)" }}>{u.lbl}</span>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06] border border-white/[0.04]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${u.pct}%` }}
                  transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full shadow-glow-blue/10"
                  style={{ background: u.col }}
                />
              </div>
              <span className="text-right font-mono text-[11px] font-medium opacity-80">{u.n}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
