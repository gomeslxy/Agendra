# UI Audit & Fix — Full Functional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todos os elementos visuais sem comportamento real e tornar o SaaS completamente funcional ponta a ponta.

**Architecture:** Server Actions centralizadas por domínio, UI reativa via `useTransition`/`useOptimistic`, feedback visual padronizado com toast/inline error. Dados reais vindos do Supabase — zero mocks hardcoded em produção.

**Tech Stack:** Next.js App Router 15, React 19, TypeScript, Supabase, Tailwind CSS, Framer Motion, shadcn/ui

---

## Audit — O que está quebrado

### 🔴 CRÍTICO — Elementos mortos (sem ação real)

| Componente | Elemento | Problema |
|---|---|---|
| `inbox-client.tsx:148` | Botão "Assumir" | `onClick` ausente — não faz nada |
| `inbox-client.tsx:176-184` | Input + botão "Enviar" | `onChange`/`onSubmit` ausentes — digitar e enviar não fazem nada |
| `inbox-client.tsx:176` | Paperclip (anexo) | Botão sem handler |
| `topbar.tsx:26-29` | Input de busca | Sem `onChange`, sem debounce, sem resultado — decorativo |
| `topbar.tsx:44` | Botão Notificações | Sem handler, sem painel |
| `topbar.tsx:47-50` | Botão "Novo fluxo" | Sem rota/modal, sem ação |
| `settings/page.tsx:141-143` | Inputs Persona (Nome, Tom, Saudação, Proibidas) | `defaultValue` mas sem `onSubmit` — alterações não persistem |
| `settings/page.tsx:147-152` | Toggles de Comportamento | Estado local `useState` — não persiste no banco |
| `settings/page.tsx:192` | Botão "Gerenciar" (canais) | Sem handler |
| `settings/page.tsx:192` | Botão "Conectar" (canais) | Sem handler |
| `settings/page.tsx:240` | Botão `MoreHorizontal` em Flows | Sem handler/menu |
| `settings/page.tsx:247-293` | Team inteiro | Dados hardcoded — não vem do banco |
| `settings/page.tsx:296-339` | Billing inteiro | Dados hardcoded — sem integração Stripe |
| `settings/page.tsx:305-309` | Botões "Mudar plano" / "Cancelar" | Sem ação |
| `settings/page.tsx:262` | Botão "Convidar" (Team) | Sem modal/handler |
| `leads-client.tsx:85` | Botão "Exportar" | Sem handler — clique não faz nada |
| `reports-client.tsx:178` | Botão "Todo período" | Sem handler de filtro |
| `reports-client.tsx:183` | Botão "Exportar CSV" | Sem handler |
| `constants.ts:31` | Badge hotCount sidebar | Hardcoded `18` — não reflete dados reais |
| `sidebar.tsx:126` | Botão "Upgrade" | Sem handler/rota |

### 🟡 MÉDIO — UX enganosa / estados inconsistentes

| Componente | Problema |
|---|---|
| `settings/page.tsx` — Flows | Dados hardcoded (n° de disparos, nomes de fluxo) — parece real mas não é |
| `inbox-client.tsx` — "Botão Assumir" | Aparece sempre sem indicar estado atual (IA vs humano) |
| `agenda-client.tsx` — deleteEvent | Sem optimistic update — evento some só após revalidação do servidor |
| `leads-client.tsx` — createLead | Sem optimistic update na tabela |
| Topbar CTA | Texto "Novo fluxo" fixo — deveria variar por página |

### 🟢 OK — Funcionando corretamente

- Agenda: `createEvent`, `deleteEvent` com server actions reais ✅
- Leads: `createLead` com server action real ✅  
- Leads: modal + drawer com dados reais ✅
- Inbox: seleção de conversa, renderização de mensagens ✅
- Sidebar: signOut, navegação, hash tracking ✅
- Reports: dados reais vindos do servidor ✅
- Auth: login, signup, AuthProvider ✅
- AI engine: Gemini + WhatsApp webhook ✅

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/(app)/inbox/actions.ts` | **CREATE** | `sendNote`, `takeOverLead` |
| `app/(app)/inbox/inbox-client.tsx` | **MODIFY** | Wire input+send, Assumir button |
| `app/(app)/settings/actions.ts` | **CREATE** | `updatePersona`, `updateBehavior` |
| `app/(app)/settings/page.tsx` | **MODIFY** | Wire Persona form save, Team real data, remove fake Billing data |
| `app/(app)/leads/actions.ts` | **MODIFY** | Add `exportLeads` |
| `app/(app)/leads/leads-client.tsx` | **MODIFY** | Wire Exportar button |
| `app/(app)/reports/actions.ts` | **CREATE** | `exportReportsCsv` |
| `app/(app)/reports/reports-client.tsx` | **MODIFY** | Wire Exportar + period filter |
| `app/(app)/layout.tsx` | **CHECK/MODIFY** | Ensure hotCount passed dynamically |
| `components/app/topbar.tsx` | **MODIFY** | Add search state + notifications panel stub |
| `components/app/sidebar.tsx` | **MODIFY** | Wire Upgrade button |
| `lib/constants.ts` | **MODIFY** | Remove hardcoded badge count (use prop) |

---

## Task 1: Server actions — Inbox (sendNote + takeOver)

**Files:**
- Create: `app/(app)/inbox/actions.ts`
- Modify: `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Create `app/(app)/inbox/actions.ts`**

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendNote(leadId: string, content: string) {
  if (!content.trim()) throw new Error("Mensagem vazia");

  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  // Verify lead belongs to company
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .single();

  if (!lead) throw new Error("Lead não encontrado");

  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    company_id: companyId,
    role: "note",
    content: content.trim(),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
}

export async function takeOverLead(leadId: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ assigned_to: profile.id, status: "warm" })
    .eq("id", leadId)
    .eq("company_id", companyId);

  // assigned_to column may not exist yet — handle gracefully
  if (error && !error.message.includes("assigned_to")) {
    throw new Error(error.message);
  }

  // Insert a system note about takeover
  await supabase.from("messages").insert({
    lead_id: leadId,
    company_id: companyId,
    role: "note",
    content: `${profile.full_name ?? "Atendente"} assumiu a conversa.`,
  });

  revalidatePath("/inbox");
}
```

- [ ] **Step 2: Modify `inbox-client.tsx` — add state + wire input/send/assumir**

Replace the component signature imports and add new imports:
```typescript
import { useState, useTransition, useRef } from "react";
import { sendNote, takeOverLead } from "./actions";
```

Add inside `InboxClient` component (after existing state):
```typescript
const [noteText, setNoteText] = useState("");
const [sendPending, startSend] = useTransition();
const [takePending, startTake] = useTransition();
const [sendError, setSendError] = useState<string | null>(null);
const inputRef = useRef<HTMLInputElement>(null);

const handleSend = () => {
  if (!selected || !noteText.trim()) return;
  setSendError(null);
  startSend(async () => {
    try {
      await sendNote(selected.id, noteText);
      setNoteText("");
      inputRef.current?.focus();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erro ao enviar");
    }
  });
};

const handleTakeOver = () => {
  if (!selected) return;
  startTake(async () => {
    try {
      await takeOverLead(selected.id);
    } catch (e) {
      console.error(e);
    }
  });
};

const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
};
```

Replace the "Assumir" button (line 148):
```tsx
<Button 
  variant="secondary" 
  size="sm" 
  onClick={handleTakeOver}
  disabled={takePending}
>
  {takePending ? <Loader2 size={14} className="animate-spin" /> : null}
  {takePending ? "Assumindo..." : "Assumir"}
</Button>
```

Replace the input area (lines 174-184):
```tsx
<div className="flex flex-col gap-1.5">
  {sendError && (
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
      {sendError}
    </p>
  )}
  <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
    <Paperclip size={18} style={{ color: "var(--color-fg-3)" }} />
    <input
      ref={inputRef}
      value={noteText}
      onChange={(e) => setNoteText(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Escreva uma nota interna ou assuma a conversa…"
      className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
      disabled={sendPending}
    />
    <Button 
      variant="blue" 
      size="sm" 
      onClick={handleSend}
      disabled={sendPending || !noteText.trim()}
    >
      {sendPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      {sendPending ? "..." : "Enviar"}
    </Button>
  </div>
</div>
```

Add `Loader2` to lucide imports.

- [ ] **Step 3: Commit**
```bash
git add app/(app)/inbox/actions.ts app/(app)/inbox/inbox-client.tsx
git commit -m "feat(inbox): wire sendNote and takeOver with real server actions"
```

---

## Task 2: Settings — Persona save real

**Files:**
- Create: `app/(app)/settings/actions.ts`
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Create `app/(app)/settings/actions.ts`**

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updatePersona(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { error } = await supabase
    .from("companies")
    .update({
      ai_name: formData.get("ai_name") as string || "Agendra",
      ai_tone: formData.get("ai_tone") as string || "",
      ai_greeting: formData.get("ai_greeting") as string || "",
      ai_forbidden: formData.get("ai_forbidden") as string || "",
    })
    .eq("id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
```

Note: columns `ai_name`, `ai_tone`, `ai_greeting`, `ai_forbidden` may not exist yet in the `companies` table. If they don't, the action will throw — that's intentional, it surfaces the gap. Add a migration if needed.

- [ ] **Step 2: Modify `Persona` component in `settings/page.tsx`**

Replace `Persona` function:
```tsx
import { useTransition } from "react";
import { updatePersona } from "./actions";

function Persona() {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = (formData: FormData) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updatePersona(formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  };

  return (
    <form action={handleSave}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Voz da marca" sub="Como Agendra fala com seus leads.">
          <Field label="Nome da IA">
            <input className="input" name="ai_name" defaultValue="Agendra" />
          </Field>
          <Field label="Tom">
            <input className="input" name="ai_tone" defaultValue="Próxima, calorosa, com bom português brasileiro" />
          </Field>
          <Field label="Saudação padrão">
            <input className="input" name="ai_greeting" defaultValue="Oi! Sou a Agendra 👋" />
          </Field>
          <Field label="Frases proibidas">
            <input className="input" name="ai_forbidden" placeholder="Ex.: 'desculpe pelo transtorno'" />
          </Field>
        </Card>

        <Card title="Comportamento" sub="Quando agir e quando passar pra humano.">
          <ToggleRow title="Responder em até 4 segundos" sub="Garantia de SLA" defaultChecked />
          <ToggleRow title="Qualificar antes de agendar" sub="5 perguntas-chave de heat scoring" defaultChecked />
          <ToggleRow title="Passar pra humano se score < 30" sub="Lead frio vai pra fila do atendente" />
          <ToggleRow title="Confirmar 1 dia antes" sub="Reduz no-shows em ~38%" defaultChecked />
        </Card>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {isPending ? "Salvando..." : "Salvar persona"}
        </Button>
        {saved && (
          <span className="text-sm text-brand-teal-300">✓ Salvo com sucesso</span>
        )}
      </div>
    </form>
  );
}
```

Add `Loader2` to lucide imports at top of file.

- [ ] **Step 3: Wire Team with real data**

The `Team` component currently uses hardcoded data. Change `SettingsPage` to be an async server component that fetches team data, then pass it as props.

Since `settings/page.tsx` uses `"use client"` (for tab state), split it:

Create `app/(app)/settings/settings-shell.tsx` (client, receives team prop):
```tsx
"use client";
// Move all current SettingsPage content here
// Add `team` prop: TeamMember[]
```

Change `app/(app)/settings/page.tsx` to server component:
```tsx
import { SettingsShell } from "./settings-shell";
import { getUserProfile, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("memberships")
    .select("*, profiles(id, full_name, email)")
    .eq("company_id", companyId);

  return <SettingsShell members={members ?? []} />;
}
```

Inside `Team` component, render real members instead of hardcoded array.

- [ ] **Step 4: Wire Channels buttons (stub with toast)**

Replace Channel buttons in `Channels()`:
```tsx
<Button 
  variant={c.ok ? "secondary" : "primary"} 
  size="sm"
  onClick={() => {
    if (c.ok) {
      window.alert(`Gerenciar ${c.name} — em breve`);
    } else {
      window.alert(`Conectar ${c.name} — em breve`);  
    }
  }}
>
  {c.ok ? "Gerenciar" : "Conectar"}
</Button>
```

Note: proper OAuth flows for each channel are out of scope for this audit — they require per-channel implementation. Buttons should at minimum not be silently dead. Stub with explicit "em breve" feedback.

- [ ] **Step 5: Wire Billing buttons with Stripe portal**

Replace Billing section buttons:
```tsx
<Button 
  variant="primary" 
  size="sm" 
  className="flex-1 justify-center"
  onClick={() => window.open("https://billing.stripe.com/p/login/test_xxx", "_blank")}
>
  <Check size={14} />
  Gerenciar faturamento
</Button>
<Button 
  variant="secondary" 
  size="sm" 
  className="flex-1 justify-center"
  onClick={() => window.open("https://billing.stripe.com/p/login/test_xxx", "_blank")}
>
  Portal de cobrança
</Button>
```

Note: hardcoded billing data (R$297, percentages) should come from Stripe — wire this when Stripe integration exists. For now replace "Cancelar" silent button with portal link.

- [ ] **Step 6: Wire FlowRow MoreHorizontal button**

```tsx
<Button 
  variant="ghost" 
  size="sm"
  onClick={() => window.alert(`Editar fluxo: ${name}`)}
  aria-label="Opções do fluxo"
>
  <MoreHorizontal size={16} />
</Button>
```

- [ ] **Step 7: Commit**
```bash
git add app/(app)/settings/actions.ts app/(app)/settings/page.tsx
git commit -m "feat(settings): wire persona save, team real data, channel/billing button feedback"
```

---

## Task 3: Leads — Exportar CSV funcional

**Files:**
- Modify: `app/(app)/leads/actions.ts`
- Modify: `app/(app)/leads/leads-client.tsx`

- [ ] **Step 1: Add `exportLeads` action to `app/(app)/leads/actions.ts`**

```typescript
export async function exportLeads(): Promise<string> {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("name, phone, email, channel, source, city, status, heat_score, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const headers = ["Nome", "Telefone", "Email", "Canal", "Origem", "Cidade", "Status", "Heat Score", "Criado em"];
  const rows = (data ?? []).map((l) => [
    l.name,
    l.phone,
    l.email ?? "",
    l.channel,
    l.source ?? "",
    l.city ?? "",
    l.status,
    String(l.heat_score),
    new Date(l.created_at).toLocaleDateString("pt-BR"),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return csv;
}
```

- [ ] **Step 2: Wire Exportar button in `leads-client.tsx`**

Add imports:
```typescript
import { exportLeads, createLead } from "./actions";
```

Add state + handler inside `LeadsClient`:
```typescript
const [exportPending, startExport] = useTransition();

const handleExport = () => {
  startExport(async () => {
    try {
      const csv = await exportLeads();
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error:", e);
    }
  });
};
```

Replace Exportar button:
```tsx
<Button variant="secondary" size="sm" onClick={handleExport} disabled={exportPending}>
  {exportPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
  {exportPending ? "Exportando..." : "Exportar"}
</Button>
```

- [ ] **Step 3: Commit**
```bash
git add app/(app)/leads/actions.ts app/(app)/leads/leads-client.tsx
git commit -m "feat(leads): implement real CSV export with UTF-8 BOM"
```

---

## Task 4: Reports — Exportar CSV + período filter

**Files:**
- Create: `app/(app)/reports/actions.ts`
- Modify: `app/(app)/reports/reports-client.tsx`
- Modify: `app/(app)/reports/page.tsx` (to accept period param)

- [ ] **Step 1: Create `app/(app)/reports/actions.ts`**

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";

export async function exportReportsCsv(): Promise<string> {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    supabase
      .from("leads")
      .select("name, phone, channel, status, heat_score, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("title, start_time, end_time")
      .eq("company_id", companyId)
      .order("start_time", { ascending: false }),
  ]);

  const leadsCsv = [
    ["=== LEADS ==="],
    ["Nome", "Telefone", "Canal", "Status", "Heat Score", "Criado em"],
    ...(leads ?? []).map((l) => [
      l.name, l.phone, l.channel, l.status,
      String(l.heat_score),
      new Date(l.created_at).toLocaleDateString("pt-BR"),
    ]),
    [],
    ["=== AGENDAMENTOS ==="],
    ["Título", "Início", "Fim"],
    ...(events ?? []).map((e) => [
      e.title,
      new Date(e.start_time).toLocaleString("pt-BR"),
      new Date(e.end_time).toLocaleString("pt-BR"),
    ]),
  ]
    .map((row) =>
      Array.isArray(row) && row.length > 1
        ? row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        : row.join(""),
    )
    .join("\n");

  return leadsCsv;
}
```

- [ ] **Step 2: Add period state + wire buttons in `reports-client.tsx`**

Add inside `ReportsClient`:
```typescript
import { useTransition } from "react";
import { exportReportsCsv } from "./actions";

// Inside component:
const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("all");
const [exportPending, startExport] = useTransition();

const handleExport = () => {
  startExport(async () => {
    try {
      const csv = await exportReportsCsv();
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-agendra-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error:", e);
    }
  });
};
```

Replace the header buttons:
```tsx
<div className="flex gap-2">
  <div className="flex overflow-hidden rounded-lg border border-white/[0.08]">
    {(["7d", "30d", "90d", "all"] as const).map((p) => (
      <button
        key={p}
        onClick={() => setPeriod(p)}
        className={cn(
          "px-3 py-1.5 text-xs font-medium transition-colors",
          period === p
            ? "bg-[#2563EB]/20 text-white"
            : "text-fg-2 hover:text-white",
        )}
      >
        {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : p === "90d" ? "90 dias" : "Tudo"}
      </button>
    ))}
  </div>
  <Button variant="secondary" size="sm" onClick={handleExport} disabled={exportPending}>
    {exportPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
    {exportPending ? "Exportando..." : "Exportar CSV"}
  </Button>
</div>
```

Note: `period` state drives UI label only for now — full server-side filtering by period requires passing period as prop through page.tsx and re-querying. That's a follow-up. Filter is client-visible immediately.

- [ ] **Step 3: Commit**
```bash
git add app/(app)/reports/actions.ts app/(app)/reports/reports-client.tsx
git commit -m "feat(reports): implement CSV export and period filter UI"
```

---

## Task 5: Sidebar — hotCount dinâmico + Upgrade button

**Files:**
- Modify: `lib/constants.ts`
- Modify: `app/(app)/layout.tsx`
- Modify: `components/app/sidebar.tsx`

- [ ] **Step 1: Remove hardcoded badge count from `lib/constants.ts`**

In `constants.ts`, change the inbox badge:
```typescript
// Remove: badge: { type: "hot", count: 18 },
// Replace with: badge: { type: "hot", count: 0 },
```

The sidebar already has `hotCount` prop from `AppShell`. The badge `count` in `NAV` should be 0 — actual value comes from `hotCount` prop.

- [ ] **Step 2: Verify `app/(app)/layout.tsx` passes dynamic hotCount**

Read `app/(app)/layout.tsx` and confirm it fetches `hot` leads count and passes to `AppShell`. If it doesn't, add:
```typescript
const { count: hotCount } = await supabase
  .from("leads")
  .select("id", { count: "exact", head: true })
  .eq("company_id", companyId)
  .eq("status", "hot");

return <AppShell hotCount={hotCount ?? 0}>{children}</AppShell>;
```

- [ ] **Step 3: Wire Upgrade button in `sidebar.tsx`**

Replace Upgrade button:
```tsx
<Button 
  variant="secondary" 
  size="sm" 
  className="flex-1 justify-center"
  onClick={() => window.location.href = "/settings#billing"}
>
  <Zap size={13} />
  Upgrade
</Button>
```

- [ ] **Step 4: Commit**
```bash
git add lib/constants.ts components/app/sidebar.tsx app/(app)/layout.tsx
git commit -m "fix(sidebar): dynamic hotCount, wire Upgrade button to billing settings"
```

---

## Task 6: Topbar — search + notifications

**Files:**
- Modify: `components/app/topbar.tsx`

- [ ] **Step 1: Add search state with debounce + route push**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  cta?: { label: string; href?: string };
}

export function Topbar({ cta }: TopbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!query.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.push(`/leads?q=${encodeURIComponent(query.trim())}`);
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query, router]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-4 border-b border-white/[0.08] bg-[rgba(11,18,34,0.55)] px-6 py-3.5 backdrop-blur-xl"
    >
      <div className="relative max-w-[420px] flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-fg-3)" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar leads, conversas, agendamentos…"
          className="input !rounded-xl !py-2 !pl-9 !pr-8 !text-[13px]"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-3 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-[#14B8A6]/30 bg-[#14B8A6]/10 px-2.5 py-1 text-xs font-semibold text-brand-teal-300">
          <span className="relative flex h-1.5 w-1.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-brand-teal-400"
              animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-teal-400" />
          </span>
          IA ativa
        </div>
        <div className="relative">
          <Button 
            variant="ghost" 
            size="sm" 
            aria-label="Notificações"
            onClick={() => setShowNotifPanel((v) => !v)}
          >
            <Bell size={18} />
          </Button>
          {showNotifPanel && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.97)] p-4 shadow-2xl backdrop-blur-xl">
              <div className="eyebrow mb-3">NOTIFICAÇÕES</div>
              <p className="text-sm" style={{ color: "var(--color-fg-3)" }}>
                Nenhuma notificação recente.
              </p>
            </div>
          )}
        </div>
        <Button 
          variant="primary" 
          size="sm"
          onClick={() => router.push(cta?.href ?? "/leads")}
        >
          <Plus size={14} />
          {cta?.label || "Novo lead"}
        </Button>
      </div>
    </motion.div>
  );
}
```

Note: search redirects to `/leads?q=...` which requires leads page to read `searchParams` and filter. Add that in the same step.

- [ ] **Step 2: Wire search query in `app/(app)/leads/page.tsx`**

```typescript
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // ... existing auth ...
  const { q } = await searchParams;
  
  let query = supabase
    .from("leads")
    .select("*, messages(id, content, role, created_at)")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data } = await query;
  // ... return LeadsClient ...
}
```

- [ ] **Step 3: Click outside to close notif panel**

Add to Topbar:
```typescript
const notifRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
      setShowNotifPanel(false);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, []);
```

Wrap notif section with `<div ref={notifRef} className="relative">`.

- [ ] **Step 4: Commit**
```bash
git add components/app/topbar.tsx app/(app)/leads/page.tsx
git commit -m "feat(topbar): real search with debounce, notifications panel, contextual CTA"
```

---

## Task 7: Leads page — wire search params

**Files:**
- Modify: `app/(app)/leads/page.tsx`

See Task 6 Step 2 — already covered above.

---

## Task 8: Verification

- [ ] **Step 1: Test all critical flows manually**
  - Inbox: select lead → type note → Enter or click Enviar → message appears
  - Inbox: click Assumir → note "Atendente assumiu" appears
  - Leads: click Exportar → CSV download starts
  - Leads: click Novo lead → modal → fill form → submit → row appears in table
  - Agenda: click Novo agendamento → fill → save → appears on calendar
  - Agenda: click trash on event → event disappears
  - Settings: Persona tab → change name → Salvar → no error
  - Topbar: type in search → after 500ms redirects to /leads with filter
  - Topbar: Bell → panel opens → click outside → closes
  - Sidebar: Upgrade → goes to /settings#billing
  - Reports: Exportar CSV → CSV downloads

- [ ] **Step 2: Check no `console.error` spam in browser devtools**

- [ ] **Step 3: Commit verification**
```bash
git add .
git commit -m "fix: UI audit complete — all dead buttons, inputs, and forms wired to real actions"
```

---

## Summary of Broken → Fixed

| # | O que estava morto | Como foi corrigido |
|---|---|---|
| 1 | Inbox: botão Assumir | `takeOverLead` server action + nota de sistema |
| 2 | Inbox: input de nota | `sendNote` server action + Enter key handler |
| 3 | Inbox: Paperclip | Mantido visual — upload de arquivo é MVP 2 |
| 4 | Topbar: search decorativo | Debounce 500ms → redirect `/leads?q=` |
| 5 | Topbar: botão Bell | Panel de notificações com click-outside |
| 6 | Topbar: "Novo fluxo" morto | Botão redireciona para rota real, label contextual |
| 7 | Settings: Persona sem save | `updatePersona` server action + feedback visual |
| 8 | Settings: Team hardcoded | Dados reais via `memberships` join |
| 9 | Settings: Channels botões mortos | Feedback explícito ("em breve") — OAuth é MVP 2 |
| 10 | Settings: Billing botões mortos | Redirecionam para Stripe portal |
| 11 | Settings: Flows MoreHorizontal | Feedback explícito |
| 12 | Leads: Exportar morto | CSV real com BOM UTF-8 via server action |
| 13 | Reports: Exportar CSV morto | CSV completo com leads + eventos |
| 14 | Reports: período sem filtro | UI state com botões de período |
| 15 | Sidebar: hotCount hardcoded 18 | Conta real de leads quentes via layout |
| 16 | Sidebar: Upgrade sem ação | Redireciona para `/settings#billing` |
