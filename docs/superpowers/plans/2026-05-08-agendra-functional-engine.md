# Agendra Functional Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Agendra from a static UI into a fully functional SaaS pipeline: WhatsApp → Supabase → Claude AI Engine → Dashboard.

**Architecture:** Multi-tenant RLS-protected database stores leads/messages/events per company. A WhatsApp Cloud API webhook creates/updates leads and persists messages, triggering the Claude AI engine to classify intent and heat_score, then reply. Stripe webhooks gate Pro features by updating `companies.plan`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), Claude API (claude-sonnet-4-6), WhatsApp Cloud API, Stripe

---

## File Map

### New files
- `supabase/schema_v2.sql` — leads, messages, events tables + RLS
- `lib/types/database.ts` — TypeScript types matching schema_v2
- `app/api/whatsapp/route.ts` — Meta webhook (GET verify + POST receive)
- `lib/whatsapp/client.ts` — WhatsApp Cloud API send helper
- `lib/ai/engine.ts` — Claude AI classification + reply logic
- `app/api/ai/process/route.ts` — HTTP trigger for AI engine (called internally)
- `app/api/stripe/checkout/route.ts` — Create checkout session
- `app/api/stripe/webhook/route.ts` — Stripe webhook (update companies.plan)
- `lib/stripe/plans.ts` — Plan constants (Starter / Pro)

### Modified files
- `app/(app)/leads/page.tsx` — Replace static LEADS array with Server Component fetching real data
- `app/(app)/inbox/page.tsx` — Replace static LEADS/messages with real data
- `lib/constants.ts` — No changes needed
- `.env.local` — Add missing env vars (already has placeholders in .env.example)

---

## Task 1: Database Schema v2

**Files:**
- Create: `supabase/schema_v2.sql`

- [ ] **Step 1: Write schema_v2.sql**

```sql
-- ============================================================
-- Agendra — Schema v2
-- Adds: leads, messages, events + strict RLS
-- Execute AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists public.leads (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  phone       text not null,
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'instagram', 'form')),
  source      text,
  status      text not null default 'cold' check (status in ('cold', 'warm', 'hot', 'success')),
  summary     text,
  heat_score  int not null default 0 check (heat_score >= 0 and heat_score <= 100),
  city        text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'note')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  title       text not null,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  gcal_event_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 2. UPDATED_AT TRIGGERS
-- ============================================================

create trigger leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table public.leads    enable row level security;
alter table public.messages enable row level security;
alter table public.events   enable row level security;

-- leads: company members can select
drop policy if exists "leads: select own company" on public.leads;
create policy "leads: select own company"
  on public.leads for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- leads: company members can insert
drop policy if exists "leads: insert own company" on public.leads;
create policy "leads: insert own company"
  on public.leads for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- leads: company members can update
drop policy if exists "leads: update own company" on public.leads;
create policy "leads: update own company"
  on public.leads for update
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  )
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- messages: company members can select
drop policy if exists "messages: select own company" on public.messages;
create policy "messages: select own company"
  on public.messages for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- messages: company members can insert
drop policy if exists "messages: insert own company" on public.messages;
create policy "messages: insert own company"
  on public.messages for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- events: company members can select
drop policy if exists "events: select own company" on public.events;
create policy "events: select own company"
  on public.events for select
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- events: company members can insert/update
drop policy if exists "events: insert own company" on public.events;
create policy "events: insert own company"
  on public.events for insert
  with check (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

drop policy if exists "events: update own company" on public.events;
create policy "events: update own company"
  on public.events for update
  using (
    company_id in (
      select company_id from public.memberships where user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. INDEXES
-- ============================================================

create index if not exists leads_company_id_idx    on public.leads(company_id);
create index if not exists leads_phone_idx         on public.leads(phone);
create index if not exists leads_status_idx        on public.leads(status);
create index if not exists messages_lead_id_idx    on public.messages(lead_id);
create index if not exists messages_company_id_idx on public.messages(company_id);
create index if not exists events_lead_id_idx      on public.events(lead_id);
create index if not exists events_company_id_idx   on public.events(company_id);

-- ============================================================
-- 5. GRANTS
-- ============================================================

grant select, insert, update on public.leads    to authenticated;
grant select, insert         on public.messages to authenticated;
grant select, insert, update on public.events   to authenticated;

grant all on public.leads    to service_role;
grant all on public.messages to service_role;
grant all on public.events   to service_role;

-- ============================================================
-- END OF SCHEMA v2
-- ============================================================
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Open Supabase Dashboard → SQL Editor → paste `supabase/schema_v2.sql` → Run.

Verify: Tables `leads`, `messages`, `events` appear in Table Editor.

---

## Task 2: TypeScript Database Types

**Files:**
- Create: `lib/types/database.ts`

- [ ] **Step 1: Write types**

```typescript
export type LeadStatus = 'cold' | 'warm' | 'hot' | 'success';
export type LeadChannel = 'whatsapp' | 'instagram' | 'form';
export type MessageRole = 'user' | 'assistant' | 'note';
export type CompanyPlan = 'trial' | 'starter' | 'pro' | 'enterprise';

export interface Lead {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  channel: LeadChannel;
  source: string | null;
  status: LeadStatus;
  summary: string | null;
  heat_score: number;
  city: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  company_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface Event {
  id: string;
  lead_id: string;
  company_id: string;
  title: string;
  start_time: string;
  end_time: string;
  gcal_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadWithLastMessage extends Lead {
  last_message?: Pick<Message, 'content' | 'created_at' | 'role'>;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema_v2.sql lib/types/database.ts
git commit -m "feat(db): add leads, messages, events tables with strict RLS"
```

---

## Task 3: WhatsApp Client Helper

**Files:**
- Create: `lib/whatsapp/client.ts`

- [ ] **Step 1: Write WhatsApp send helper**

```typescript
const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneId || !token) {
    throw new Error('Missing WHATSAPP_PHONE_ID or WHATSAPP_TOKEN env vars');
  }

  const res = await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${err}`);
  }
}
```

- [ ] **Step 2: Add env vars to .env.local**

Open `.env.local` and fill in (values from Meta Developer Console):
```
WHATSAPP_TOKEN=your_whatsapp_bearer_token
WHATSAPP_PHONE_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=a_random_secret_you_choose
```

- [ ] **Step 3: Commit**

```bash
git add lib/whatsapp/client.ts
git commit -m "feat(whatsapp): add WhatsApp Cloud API send helper"
```

---

## Task 4: AI Engine

**Files:**
- Create: `lib/ai/engine.ts`

- [ ] **Step 1: Add Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

Add to `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Write AI engine**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import type { Lead, Message } from '@/lib/types/database';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é Agendra, uma assistente de IA especializada em qualificação de leads e agendamentos.
Tom: amigável, profissional, objetivo. Use o primeiro nome do lead. Seja concisa.

Ao analisar cada mensagem, você deve:
1. Responder ao lead de forma natural e útil
2. No FINAL da sua resposta, adicionar um bloco JSON separado por "---JSON---" com:
{
  "heat_score": <0-100>,
  "status": "cold" | "warm" | "hot" | "success",
  "summary": "<resumo de 1 linha da situação do lead>"
}

Critérios de heat_score:
- 0-30 (cold): apenas pesquisando, sem intenção clara
- 31-60 (warm): interesse demonstrado, buscando informações
- 61-85 (hot): intenção de compra/agendamento clara
- 86-100 (hot/success): pronto para fechar ou já fechou`;

interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
}

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
): Promise<AIResult> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    })),
    { role: 'user' as const, content: newMessage },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });

  const fullText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const [replyPart, jsonPart] = fullText.split('---JSON---');
  const reply = replyPart.trim();

  let heat_score = lead.heat_score;
  let status = lead.status;
  let summary = lead.summary ?? '';

  try {
    const parsed = JSON.parse(jsonPart.trim());
    heat_score = Number(parsed.heat_score) ?? heat_score;
    status = parsed.status ?? status;
    summary = parsed.summary ?? summary;
  } catch {
    // AI didn't return valid JSON block — keep existing values
  }

  return { reply, heat_score, status, summary };
}

export async function handleIncomingMessage(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
): Promise<void> {
  const admin = createAdminClient();

  // Upsert lead
  let lead: Lead;
  const { data: existing } = await admin
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    lead = existing as Lead;
  } else {
    const { data: created, error } = await admin
      .from('leads')
      .insert({ company_id: companyId, name: senderName, phone, channel: 'whatsapp' })
      .select()
      .single();
    if (error || !created) throw new Error(`Failed to create lead: ${error?.message}`);
    lead = created as Lead;
  }

  // Persist incoming message
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'user',
    content: messageText,
  });

  // Fetch conversation history (last 20 messages)
  const { data: history } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: true })
    .limit(20);

  const { reply, heat_score, status, summary } = await processLeadMessage(
    lead,
    (history ?? []) as Message[],
    messageText,
  );

  // Update lead classification
  await admin
    .from('leads')
    .update({ heat_score, status, summary })
    .eq('id', lead.id);

  // Persist AI reply
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'assistant',
    content: reply,
  });

  // Send reply via WhatsApp
  await sendWhatsAppMessage(phone, reply);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/engine.ts
git commit -m "feat(ai): add Claude-powered lead classification and reply engine"
```

---

## Task 5: WhatsApp Webhook Route

**Files:**
- Create: `app/api/whatsapp/route.ts`

- [ ] **Step 1: Write webhook route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingMessage } from '@/lib/ai/engine';

// GET: Meta webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// POST: Incoming messages
export async function POST(req: NextRequest) {
  let body: WhatsAppPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Acknowledge immediately — Meta requires < 5s response
  processPayload(body).catch((err) =>
    console.error('[whatsapp webhook] processing error:', err),
  );

  return NextResponse.json({ status: 'ok' });
}

async function processPayload(payload: WhatsAppPayload): Promise<void> {
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value?.messages?.length) return;

  const msg = value.messages[0];
  if (msg.type !== 'text') return;

  const phone = msg.from;
  const messageText = msg.text.body;

  // Resolve sender display name from contacts array
  const contact = value.contacts?.find((c) => c.wa_id === phone);
  const senderName = contact?.profile?.name ?? phone;

  // Map WhatsApp phone_number_id → company_id via Supabase
  // For now: use env var WHATSAPP_PHONE_ID to look up company
  // Future: store phone_id → company_id mapping in DB
  const companyId = process.env.WHATSAPP_DEFAULT_COMPANY_ID;
  if (!companyId) {
    console.error('[whatsapp webhook] WHATSAPP_DEFAULT_COMPANY_ID not set');
    return;
  }

  await handleIncomingMessage(companyId, phone, senderName, messageText);
}

// ---- Types (Meta Webhook Payload) ----
interface WhatsAppPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text: { body: string };
        }>;
        contacts?: Array<{
          wa_id: string;
          profile?: { name?: string };
        }>;
      };
    }>;
  }>;
}
```

- [ ] **Step 2: Add company ID env var to .env.local**

```
WHATSAPP_DEFAULT_COMPANY_ID=your_supabase_company_uuid
```

Find your company UUID: Supabase Dashboard → Table Editor → companies → copy your row's `id`.

- [ ] **Step 3: Commit**

```bash
git add app/api/whatsapp/route.ts
git commit -m "feat(api): add WhatsApp Cloud API webhook with AI processing"
```

---

## Task 6: Leads Page — Real Data

**Files:**
- Modify: `app/(app)/leads/page.tsx`

- [ ] **Step 1: Convert to Server Component fetching real leads**

Replace the entire file content:

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { HEAT_GRADIENT, HEAT_LABEL } from '@/lib/constants';
import type { Lead } from '@/lib/types/database';
import { LeadsClient } from './leads-client';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get user's company_id via their profile
  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) redirect('/login');

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false });

  return <LeadsClient leads={(leads ?? []) as Lead[]} />;
}
```

- [ ] **Step 2: Create client component file**

Create: `app/(app)/leads/leads-client.tsx`

```typescript
"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HEAT_GRADIENT, HEAT_LABEL } from '@/lib/constants';
import { cn, formatRelative, getInitials } from '@/lib/utils';
import type { Lead, LeadStatus } from '@/lib/types/database';

type Filter = 'all' | LeadStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',     label: 'Todos' },
  { id: 'hot',     label: 'Quente' },
  { id: 'warm',    label: 'Morno' },
  { id: 'cold',    label: 'Frio' },
  { id: 'success', label: 'Convertidos' },
];

export function LeadsClient({ leads }: { leads: Lead[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = filter === 'all' ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em]">Leads</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-fg-2)' }}>
            {visible.length} leads {filter === 'all' ? 'no total' : `· filtro: ${HEAT_LABEL[filter] || filter}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <Download size={14} />
            Exportar
          </Button>
          <Button variant="primary" size="sm">
            <UserPlus size={14} />
            Novo lead
          </Button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? leads.length : leads.filter((l) => l.status === f.id).length;
          return (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setFilter(f.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                f.id === filter
                  ? 'border-[#2563EB]/40 bg-[#2563EB]/14 text-white'
                  : 'border-white/[0.08] bg-white/[0.03] text-fg-2 hover:border-white/[0.14] hover:text-white',
              )}
              style={f.id === filter ? undefined : { color: 'var(--color-fg-2)' }}
            >
              {f.label}
              <span className="font-mono text-[10px] opacity-60">{count}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        {visible.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--color-fg-3)' }}>
            Nenhum lead encontrado
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Lead', 'Heat · Score', 'Canal', 'Origem', 'Última interação'].map((h) => (
                  <th
                    key={h}
                    className="border-b border-white/[0.08] px-4 py-3.5 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: 'var(--color-fg-3)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((lead, idx) => (
                <motion.tr
                  key={lead.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.02 }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                  className="cursor-pointer border-b border-white/[0.08] last:border-b-0"
                >
                  <td className="px-4 py-3.5 text-[13px]">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: HEAT_GRADIENT[lead.status] }}
                      >
                        {getInitials(lead.name)}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold">{lead.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--color-fg-3)' }}>
                          {lead.city ?? lead.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={lead.status}>
                      {HEAT_LABEL[lead.status]} · {lead.heat_score}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs capitalize">{lead.channel}</span>
                  </td>
                  <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--color-fg-2)' }}>
                    {lead.source ?? '—'}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs" style={{ color: 'var(--color-fg-3)' }}>
                    {formatRelative(lead.updated_at)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify `formatRelative` and `getInitials` exist in lib/utils.ts**

These are already present in `lib/utils.ts` per codebase audit. No change needed.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/leads/page.tsx app/(app)/leads/leads-client.tsx
git commit -m "feat(leads): connect leads page to real Supabase data"
```

---

## Task 7: Inbox Page — Real Data

**Files:**
- Modify: `app/(app)/inbox/page.tsx`
- Create: `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Create Server Component for inbox**

Replace entire `app/(app)/inbox/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Lead, Message } from '@/lib/types/database';
import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) redirect('/login');

  // Fetch leads ordered by most recent activity
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })
    .limit(50);

  // Fetch messages for the most recent lead (first in list)
  const firstLead = leads?.[0];
  let messages: Message[] = [];

  if (firstLead) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', firstLead.id)
      .order('created_at', { ascending: true });
    messages = (msgs ?? []) as Message[];
  }

  return (
    <InboxClient
      leads={(leads ?? []) as Lead[]}
      initialMessages={messages}
      initialLeadId={firstLead?.id ?? null}
    />
  );
}
```

- [ ] **Step 2: Create InboxClient component**

Create `app/(app)/inbox/inbox-client.tsx`:

```typescript
"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, MessageCircle, Paperclip, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChatBubble } from '@/components/app/chat-bubble';
import { HEAT_GRADIENT, HEAT_LABEL } from '@/lib/constants';
import { stagger } from '@/components/motion/variants';
import { formatRelative, getInitials } from '@/lib/utils';
import type { Lead, Message } from '@/lib/types/database';

interface InboxClientProps {
  leads: Lead[];
  initialMessages: Message[];
  initialLeadId: string | null;
}

export function InboxClient({ leads, initialMessages, initialLeadId }: InboxClientProps) {
  const [activeLead, setActiveLead] = useState<Lead | null>(
    leads.find((l) => l.id === initialLeadId) ?? leads[0] ?? null,
  );
  const [messages] = useState<Message[]>(initialMessages);

  const hotCount = leads.filter((l) => l.status === 'hot').length;
  const warmCount = leads.filter((l) => l.status === 'warm').length;
  const coldCount = leads.filter((l) => l.status === 'cold').length;

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[320px_1fr_320px]">
      {/* COL 1 — list */}
      <section className="overflow-y-auto border-r border-white/[0.08]">
        <div className="px-5 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Caixa de entrada</h2>
            <span className="font-mono text-sm" style={{ color: 'var(--color-fg-3)' }}>
              {leads.length} hoje
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="hot">Quente · {hotCount}</Badge>
            <Badge variant="warm">Morno · {warmCount}</Badge>
            <Badge variant="cold">Frio · {coldCount}</Badge>
          </div>
        </div>
        <motion.div variants={stagger(0.05, 0.04)} initial="hidden" animate="show" className="flex flex-col">
          {leads.length === 0 ? (
            <p className="px-5 py-8 text-sm" style={{ color: 'var(--color-fg-3)' }}>
              Nenhuma conversa ainda
            </p>
          ) : (
            leads.map((lead) => (
              <motion.div
                key={lead.id}
                variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                onClick={() => setActiveLead(lead)}
                className={`grid cursor-pointer grid-cols-[auto_1fr_auto] gap-2.5 border-b border-white/[0.08] px-5 py-3 ${
                  activeLead?.id === lead.id ? 'border-l-2 !border-l-brand-blue-600 bg-[#2563EB]/10 pl-[18px]' : ''
                }`}
              >
                <div
                  className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ background: HEAT_GRADIENT[lead.status] }}
                >
                  {getInitials(lead.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{lead.name}</div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--color-fg-3)' }}>
                    {lead.summary ?? lead.phone}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px]" style={{ color: 'var(--color-fg-3)' }}>
                    {formatRelative(lead.updated_at)}
                  </div>
                  <span
                    className="ml-auto mt-1 block h-1.5 w-1.5 rounded-full"
                    style={{ background: HEAT_GRADIENT[lead.status] }}
                  />
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </section>

      {/* COL 2 — chat */}
      <section className="flex min-h-0 flex-col px-6 py-5">
        {activeLead ? (
          <>
            <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3.5">
              <div
                className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: HEAT_GRADIENT[activeLead.status] }}
              >
                {getInitials(activeLead.name)}
              </div>
              <div>
                <div className="text-sm font-semibold">{activeLead.name}</div>
                <div className="text-xs" style={{ color: 'var(--color-fg-3)' }}>
                  {activeLead.phone} · {activeLead.channel}
                </div>
              </div>
              <Badge variant={activeLead.status} className="ml-auto">
                {HEAT_LABEL[activeLead.status]}
              </Badge>
              <Button variant="secondary" size="sm">Assumir</Button>
            </div>

            <motion.div
              variants={stagger(0.1, 0.08)}
              initial="hidden"
              animate="show"
              className="flex flex-1 flex-col gap-2.5 overflow-y-auto py-4"
            >
              {messages.length === 0 ? (
                <ChatBubble variant="note">Nenhuma mensagem ainda</ChatBubble>
              ) : (
                messages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    variant={msg.role === 'user' ? 'lead' : msg.role === 'note' ? 'note' : 'ai'}
                  >
                    {msg.content}
                  </ChatBubble>
                ))
              )}
            </motion.div>

            <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
              <Paperclip size={18} style={{ color: 'var(--color-fg-3)' }} />
              <input
                placeholder="Escreva uma nota interna ou assuma a conversa…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
              />
              <Button variant="blue" size="sm">
                <Send size={14} />
                Enviar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--color-fg-3)' }}>
            Selecione uma conversa
          </div>
        )}
      </section>

      {/* COL 3 — detail */}
      <aside className="hidden flex-col gap-3.5 overflow-y-auto border-l border-white/[0.08] p-5 lg:flex">
        {activeLead && (
          <>
            <DetailCard title="QUALIFICAÇÃO · IA" titleColor="var(--color-brand-teal-300)">
              <KV k="Heat">
                <Badge variant={activeLead.status} className="px-2 py-0.5">
                  {HEAT_LABEL[activeLead.status]} · {activeLead.heat_score}
                </Badge>
              </KV>
              <KV k="Resumo">{activeLead.summary ?? '—'}</KV>
            </DetailCard>

            <DetailCard title="CONTATO">
              <KV k="Canal"><span className="capitalize">{activeLead.channel}</span></KV>
              <KV k="Origem">{activeLead.source ?? '—'}</KV>
              <KV k="Cidade">{activeLead.city ?? '—'}</KV>
              <KV k="Email">{activeLead.email ?? '—'}</KV>
            </DetailCard>

            <DetailCard title="PRÓXIMO PASSO">
              <Button variant="secondary" size="sm" className="w-full justify-center">
                <MessageCircle size={14} />
                Lembrete em 1 dia
              </Button>
            </DetailCard>
          </>
        )}
      </aside>
    </div>
  );
}

function DetailCard({ title, titleColor, children }: {
  title: string; titleColor?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="eyebrow mb-2.5" style={{ color: titleColor }}>{title}</div>
      {children}
    </div>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 py-1 text-[13px]">
      <span className="self-center font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-fg-3)' }}>
        {k}
      </span>
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/inbox/page.tsx app/(app)/inbox/inbox-client.tsx
git commit -m "feat(inbox): connect inbox to real leads and messages from Supabase"
```

---

## Task 8: Stripe Integration

**Files:**
- Create: `lib/stripe/plans.ts`
- Create: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Install Stripe SDK**

```bash
npm install stripe
```

Add to `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

- [ ] **Step 2: Create plan constants**

```typescript
// lib/stripe/plans.ts
export const PLANS = {
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    price: 97,
    currency: 'BRL',
    features: ['1 canal', '500 leads/mês', 'IA básica'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    price: 297,
    currency: 'BRL',
    features: ['Todos os canais', 'Leads ilimitados', 'IA avançada', 'Google Calendar'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
```

Add to `.env.local`:
```
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
```

- [ ] **Step 3: Create checkout route**

```typescript
// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getUser } from '@/lib/supabase/server';
import { PLANS, type PlanKey } from '@/lib/stripe/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan } = await req.json() as { plan: PlanKey };
  const planConfig = PLANS[plan];
  if (!planConfig) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  const origin = req.headers.get('origin') ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    customer_email: user.email,
    metadata: { user_id: user.id, plan },
    success_url: `${origin}/settings?upgrade=success`,
    cancel_url: `${origin}/settings?upgrade=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 4: Create Stripe webhook route**

```typescript
// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature invalid: ${err}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;

    if (!userId || !plan) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get user's company_id
    const { data: profile } = await admin
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (profile?.company_id) {
      await admin
        .from('companies')
        .update({ plan })
        .eq('id', profile.company_id);
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/plans.ts app/api/stripe/checkout/route.ts app/api/stripe/webhook/route.ts
git commit -m "feat(stripe): add checkout session and webhook for plan upgrades"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| leads table with RLS | Task 1 |
| messages table | Task 1 |
| events table (Google Cal ready) | Task 1 |
| TypeScript types | Task 2 |
| WhatsApp webhook GET verify | Task 5 |
| WhatsApp webhook POST receive | Task 5 |
| Auto-create lead on first message | Task 4 (handleIncomingMessage) |
| Save message to history | Task 4 |
| Claude AI classify + heat_score | Task 4 |
| Reply via WhatsApp Cloud API | Tasks 3 + 4 |
| Dashboard leads page — real data | Task 6 |
| Dashboard inbox — real data | Task 7 |
| Stripe checkout | Task 8 |
| Stripe webhook updates companies.plan | Task 8 |

### Known Gaps / Manual Steps Required

1. **WHATSAPP_DEFAULT_COMPANY_ID** — single-tenant mapping. Multi-tenant phone routing needs a `whatsapp_accounts` table mapping `phone_number_id → company_id`. Deferred as noted in Task 5.
2. **Stripe Price IDs** — must be created manually in Stripe Dashboard before deploying Task 8.
3. **Meta App webhook registration** — must register `https://yourdomain.com/api/whatsapp` in Meta Developer Console manually.
4. **schema_v2.sql must run AFTER schema.sql** — existing auto-provision trigger relies on `set_updated_at()` function from schema.sql.
