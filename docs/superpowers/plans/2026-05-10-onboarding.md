# Onboarding Inteligente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar onboarding obrigatório, multi-step, anti-bypass com persistência real no banco e aplicação de configurações no tenant.

**Architecture:** 3 camadas de gate independentes — `app/(app)/layout.tsx` (fonte de verdade DB), `app/(onboarding)/layout.tsx` (bloqueia reverso), Server Action guards. Rota `/onboarding` com layout próprio. Dados salvos step-a-step no `companies.onboarding_data`. Ao concluir, `applyOnboardingConfig()` preenche `persona_config` + campos AI do tenant.

**Tech Stack:** Next.js 15 App Router · Supabase SSR · Framer Motion · Tailwind v4 · Vitest (testes de funções puras)

**Spec:** `docs/superpowers/specs/2026-05-10-onboarding-design.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/005_onboarding.sql` | Criar | Colunas onboarding + índice |
| `lib/onboarding/types.ts` | Criar | Tipos, enums, constantes |
| `lib/onboarding/guards.ts` | Criar | getOnboardingStatus, requireOnboarding |
| `lib/onboarding/prefill.ts` | Criar | Mapeia persona_config legada → OnboardingData |
| `lib/onboarding/apply.ts` | Criar | applyOnboardingConfig, buildPersonaConfig |
| `lib/onboarding/__tests__/prefill.test.ts` | Criar | Testes unitários de prefill |
| `lib/onboarding/__tests__/apply.test.ts` | Criar | Testes unitários de buildPersonaConfig |
| `middleware.ts` | Modificar | Adiciona /onboarding a PROTECTED_PREFIXES |
| `app/(app)/layout.tsx` | Modificar | Adiciona gate de onboarding |
| `app/(onboarding)/layout.tsx` | Criar | Redireciona para /inbox se já completo |
| `app/(onboarding)/page.tsx` | Criar | Server Component: carrega estado + prefill |
| `app/(onboarding)/actions.ts` | Criar | saveOnboardingStep, completeOnboarding |
| `app/(onboarding)/onboarding-wizard.tsx` | Criar | Client Component: state machine do wizard |
| `app/(onboarding)/components/onboarding-progress.tsx` | Criar | Barra de progresso animada |
| `app/(onboarding)/components/steps/step-empresa.tsx` | Criar | Step 1: nome, nicho, porte |
| `app/(onboarding)/components/steps/step-objetivo.tsx` | Criar | Step 2: objetivo, maturidade |
| `app/(onboarding)/components/steps/step-canais.tsx` | Criar | Step 3: canais, CRM |
| `app/(onboarding)/components/steps/step-ia.tsx` | Criar | Step 4: AI persona, horário |
| `app/(onboarding)/components/steps/step-metas.tsx` | Criar | Step 5: equipe, métrica |
| `vitest.config.ts` | Criar | Config Vitest |

---

## Task 0: Vitest Setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 0.1: Instalar Vitest**

```powershell
pnpm add -D vitest @vitest/ui
```

- [ ] **Step 0.2: Criar vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 0.3: Adicionar script de test no package.json**

Abrir `package.json`, adicionar na chave `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 0.4: Verificar setup**

```powershell
pnpm test
```

Expected: `No test files found` (sem erro de configuração)

- [ ] **Step 0.5: Commit**

```powershell
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest for unit testing"
```

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/005_onboarding.sql`

- [ ] **Step 1.1: Criar arquivo de migration**

```sql
-- supabase/migrations/005_onboarding.sql
-- Onboarding state machine for companies (tenants)
-- Run after 004_billing_limits.sql

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started','in_progress','completed','needs_review')),
  ADD COLUMN IF NOT EXISTS onboarding_step   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_data   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_applied_config JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS companies_onboarding_status_idx
  ON public.companies(onboarding_status);
```

- [ ] **Step 1.2: Aplicar migration via Supabase MCP**

Usar `mcp__claude_ai_Supabase__apply_migration` com o SQL acima no projeto `sdtufxbdxgkieohxmeki`.

- [ ] **Step 1.3: Verificar colunas existem**

Usar `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name LIKE 'onboarding%'
ORDER BY column_name;
```

Expected: 5 linhas com as colunas `onboarding_applied_config`, `onboarding_completed_at`, `onboarding_data`, `onboarding_status`, `onboarding_step`.

- [ ] **Step 1.4: Commit**

```powershell
git add supabase/migrations/005_onboarding.sql
git commit -m "feat(db): add onboarding state machine columns to companies"
```

---

## Task 2: Core Types

**Files:**
- Create: `lib/onboarding/types.ts`

- [ ] **Step 2.1: Criar types.ts**

```typescript
// lib/onboarding/types.ts

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_review';

export type BusinessSize = 'solo' | 'small' | 'medium' | 'large';
export type BusinessGoal = 'capture' | 'nurture' | 'qualify' | 'convert' | 'follow';
export type BusinessMaturity = 'beginner' | 'intermediate' | 'advanced';
export type AiTone = 'formal' | 'friendly' | 'direct' | 'warm';
export type PrimaryMetric = 'leads' | 'appointments' | 'conversions' | 'revenue';

export interface OnboardingData {
  // Step 1 — Empresa
  company_name?: string;
  niche?: string;
  size?: BusinessSize;

  // Step 2 — Objetivo
  goal?: BusinessGoal;
  maturity?: BusinessMaturity;

  // Step 3 — Canais
  channels?: Array<'whatsapp' | 'instagram' | 'form'>;
  uses_crm?: boolean;
  crm_name?: string;

  // Step 4 — Persona da IA
  ai_name?: string;
  ai_tone?: AiTone;
  ai_language?: string;
  timezone?: string;
  working_hours?: Record<string, [string, string]>;

  // Step 5 — Metas
  team_size?: number;
  primary_metric?: PrimaryMetric;
  desired_integrations?: string[];
}

export interface OnboardingState {
  status: OnboardingStatus;
  step: number;
  data: OnboardingData;
  completed_at: string | null;
}

export const ONBOARDING_TOTAL_STEPS = 5;

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status === 'completed';
}
```

- [ ] **Step 2.2: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 2.3: Commit**

```powershell
git add lib/onboarding/types.ts
git commit -m "feat(onboarding): add core types and state machine constants"
```

---

## Task 3: Guards

**Files:**
- Create: `lib/onboarding/guards.ts`

- [ ] **Step 3.1: Criar guards.ts**

```typescript
// lib/onboarding/guards.ts
import { createClient } from '@/lib/supabase/server';
import type { OnboardingStatus } from './types';

export async function getOnboardingStatus(companyId: string): Promise<OnboardingStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('companies')
    .select('onboarding_status')
    .eq('id', companyId)
    .single();
  return (data?.onboarding_status as OnboardingStatus) ?? 'not_started';
}

/** Throw-based guard for Server Actions and Route Handlers. */
export async function requireOnboarding(companyId: string): Promise<void> {
  const status = await getOnboardingStatus(companyId);
  if (status !== 'completed') {
    throw new Error('ONBOARDING_REQUIRED');
  }
}
```

- [ ] **Step 3.2: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 3.3: Commit**

```powershell
git add lib/onboarding/guards.ts
git commit -m "feat(onboarding): add server-side onboarding guards"
```

---

## Task 4: Prefill Logic

**Files:**
- Create: `lib/onboarding/prefill.ts`
- Create: `lib/onboarding/__tests__/prefill.test.ts`

- [ ] **Step 4.1: Criar prefill.ts**

```typescript
// lib/onboarding/prefill.ts
import type { OnboardingData, AiTone } from './types';

interface LegacyCompany {
  name?: string | null;
  ai_name?: string | null;
  ai_tone?: string | null;
  persona_config?: Record<string, unknown> | null;
  onboarding_data?: Partial<OnboardingData> | null;
}

const VALID_TONES: AiTone[] = ['formal', 'friendly', 'direct', 'warm'];

function toAiTone(raw: unknown): AiTone | undefined {
  if (typeof raw === 'string' && VALID_TONES.includes(raw as AiTone)) {
    return raw as AiTone;
  }
  return undefined;
}

export function buildPrefillFromLegacy(company: LegacyCompany): Partial<OnboardingData> {
  // Already has onboarding_data from a previous incomplete session — use it
  if (company.onboarding_data && Object.keys(company.onboarding_data).length > 0) {
    return company.onboarding_data;
  }

  const config = (company.persona_config ?? {}) as Record<string, unknown>;
  const result: Partial<OnboardingData> = {};

  // Step 1 fields
  if (company.name) result.company_name = company.name;
  if (typeof config.business_type === 'string') result.niche = config.business_type;

  // Step 4 fields — AI persona
  const aiName = company.ai_name ?? (typeof config.name === 'string' ? config.name : undefined);
  if (aiName) result.ai_name = aiName;

  const aiTone =
    toAiTone(company.ai_tone) ??
    toAiTone(config.tone);
  if (aiTone) result.ai_tone = aiTone;

  if (typeof config.timezone === 'string') result.timezone = config.timezone;

  if (config.working_hours && typeof config.working_hours === 'object' && !Array.isArray(config.working_hours)) {
    result.working_hours = config.working_hours as Record<string, [string, string]>;
  }

  return result;
}
```

- [ ] **Step 4.2: Escrever o teste**

```typescript
// lib/onboarding/__tests__/prefill.test.ts
import { describe, it, expect } from 'vitest';
import { buildPrefillFromLegacy } from '../prefill';

describe('buildPrefillFromLegacy', () => {
  it('returns empty object for company with no data', () => {
    const result = buildPrefillFromLegacy({ name: null });
    expect(result).toEqual({});
  });

  it('maps company name to company_name', () => {
    const result = buildPrefillFromLegacy({ name: 'Studio Bella' });
    expect(result.company_name).toBe('Studio Bella');
  });

  it('maps persona_config.business_type to niche', () => {
    const result = buildPrefillFromLegacy({
      persona_config: { business_type: 'clínica' },
    });
    expect(result.niche).toBe('clínica');
  });

  it('maps ai_name from direct field', () => {
    const result = buildPrefillFromLegacy({ ai_name: 'Sofia' });
    expect(result.ai_name).toBe('Sofia');
  });

  it('maps ai_name from persona_config.name when direct field is absent', () => {
    const result = buildPrefillFromLegacy({
      persona_config: { name: 'Ana' },
    });
    expect(result.ai_name).toBe('Ana');
  });

  it('prefers direct ai_name over persona_config.name', () => {
    const result = buildPrefillFromLegacy({
      ai_name: 'Sofia',
      persona_config: { name: 'Ana' },
    });
    expect(result.ai_name).toBe('Sofia');
  });

  it('maps valid ai_tone', () => {
    const result = buildPrefillFromLegacy({ ai_tone: 'friendly' });
    expect(result.ai_tone).toBe('friendly');
  });

  it('ignores invalid ai_tone strings', () => {
    const result = buildPrefillFromLegacy({ ai_tone: 'casual' });
    expect(result.ai_tone).toBeUndefined();
  });

  it('returns onboarding_data as-is if already present', () => {
    const existing = { company_name: 'Test', niche: 'tech', ai_name: 'Bot' };
    const result = buildPrefillFromLegacy({
      name: 'Other',
      onboarding_data: existing,
    });
    expect(result).toEqual(existing);
  });

  it('maps working_hours from persona_config', () => {
    const wh = { mon: ['09:00', '18:00'] };
    const result = buildPrefillFromLegacy({
      persona_config: { working_hours: wh },
    });
    expect(result.working_hours).toEqual(wh);
  });
});
```

- [ ] **Step 4.3: Rodar testes — verificar que passam**

```powershell
pnpm test
```

Expected: `10 tests passed`

- [ ] **Step 4.4: Commit**

```powershell
git add lib/onboarding/prefill.ts lib/onboarding/__tests__/prefill.test.ts
git commit -m "feat(onboarding): add legacy prefill logic with unit tests"
```

---

## Task 5: Apply Config

**Files:**
- Create: `lib/onboarding/apply.ts`
- Create: `lib/onboarding/__tests__/apply.test.ts`

- [ ] **Step 5.1: Criar apply.ts**

```typescript
// lib/onboarding/apply.ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { OnboardingData } from './types';

export interface ApplyResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_WORKING_HOURS: Record<string, [string, string]> = {
  mon: ['09:00', '18:00'],
  tue: ['09:00', '18:00'],
  wed: ['09:00', '18:00'],
  thu: ['09:00', '18:00'],
  fri: ['09:00', '18:00'],
};

export function buildPersonaConfig(data: OnboardingData): Record<string, unknown> {
  return {
    name: data.ai_name ?? 'Assistente',
    business_name: data.company_name ?? '',
    business_type: data.niche ?? '',
    tone: data.ai_tone ?? 'friendly',
    timezone: data.timezone ?? 'America/Sao_Paulo',
    working_hours: data.working_hours ?? DEFAULT_WORKING_HOURS,
    slot_duration_minutes: 60,
  };
}

export function buildAiGreeting(data: OnboardingData): string {
  const name = data.ai_name ?? 'Assistente';
  const company = data.company_name ?? 'nossa empresa';
  return `Olá! Sou ${name}, assistente virtual de ${company}. Como posso ajudar?`;
}

export async function applyOnboardingConfig(
  companyId: string,
  data: OnboardingData,
): Promise<ApplyResult> {
  const admin = createAdminClient();

  try {
    const persona_config = buildPersonaConfig(data);
    const ai_greeting = buildAiGreeting(data);

    const applied_config = {
      persona_config_set: true,
      ai_settings_set: true,
      pipeline_created: false,
      automations_created: false,
      applied_at: new Date().toISOString(),
      applied_version: 1,
    };

    const { error } = await admin
      .from('companies')
      .update({
        name: data.company_name ?? undefined,
        persona_config,
        ai_name: data.ai_name ?? null,
        ai_tone: data.ai_tone ?? null,
        ai_greeting,
        onboarding_status: 'completed',
        onboarding_completed_at: new Date().toISOString(),
        onboarding_data: data,
        onboarding_applied_config: applied_config,
      })
      .eq('id', companyId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}
```

- [ ] **Step 5.2: Escrever o teste**

```typescript
// lib/onboarding/__tests__/apply.test.ts
import { describe, it, expect } from 'vitest';
import { buildPersonaConfig, buildAiGreeting } from '../apply';
import type { OnboardingData } from '../types';

const fullData: OnboardingData = {
  company_name: 'Studio Bella',
  niche: 'salão de beleza',
  size: 'small',
  goal: 'convert',
  maturity: 'beginner',
  channels: ['whatsapp'],
  uses_crm: false,
  ai_name: 'Sofia',
  ai_tone: 'friendly',
  timezone: 'America/Sao_Paulo',
  working_hours: { mon: ['09:00', '18:00'] },
  team_size: 3,
  primary_metric: 'appointments',
};

describe('buildPersonaConfig', () => {
  it('builds correct persona_config from full data', () => {
    const config = buildPersonaConfig(fullData);
    expect(config.name).toBe('Sofia');
    expect(config.business_name).toBe('Studio Bella');
    expect(config.business_type).toBe('salão de beleza');
    expect(config.tone).toBe('friendly');
    expect(config.timezone).toBe('America/Sao_Paulo');
    expect(config.slot_duration_minutes).toBe(60);
    expect(config.working_hours).toEqual({ mon: ['09:00', '18:00'] });
  });

  it('uses safe defaults when fields missing', () => {
    const config = buildPersonaConfig({});
    expect(config.name).toBe('Assistente');
    expect(config.business_name).toBe('');
    expect(config.tone).toBe('friendly');
    expect(config.timezone).toBe('America/Sao_Paulo');
    expect(config.working_hours).toMatchObject({ mon: ['09:00', '18:00'] });
  });
});

describe('buildAiGreeting', () => {
  it('builds greeting with name and company', () => {
    const greeting = buildAiGreeting(fullData);
    expect(greeting).toBe('Olá! Sou Sofia, assistente virtual de Studio Bella. Como posso ajudar?');
  });

  it('uses fallbacks when fields missing', () => {
    const greeting = buildAiGreeting({});
    expect(greeting).toBe('Olá! Sou Assistente, assistente virtual de nossa empresa. Como posso ajudar?');
  });
});
```

- [ ] **Step 5.3: Rodar testes**

```powershell
pnpm test
```

Expected: `16 tests passed` (10 prefill + 6 apply)

- [ ] **Step 5.4: Commit**

```powershell
git add lib/onboarding/apply.ts lib/onboarding/__tests__/apply.test.ts
git commit -m "feat(onboarding): add applyOnboardingConfig with persona builder"
```

---

## Task 6: Middleware Update

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 6.1: Ler o arquivo atual**

Abrir `middleware.ts`. O array `PROTECTED_PREFIXES` atualmente é:
```typescript
const PROTECTED_PREFIXES = ["/inbox", "/agenda", "/leads", "/reports", "/settings"];
```

- [ ] **Step 6.2: Adicionar /onboarding ao array**

Substituir o array por:
```typescript
const PROTECTED_PREFIXES = ["/inbox", "/agenda", "/leads", "/reports", "/settings", "/onboarding"];
```

Isso garante que `/onboarding` exige autenticação — usuários não logados são redirecionados para `/login`.

- [ ] **Step 6.3: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 6.4: Commit**

```powershell
git add middleware.ts
git commit -m "feat(onboarding): protect /onboarding route in middleware"
```

---

## Task 7: App Layout Gate

**Files:**
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 7.1: Ler o arquivo atual**

Abrir `app/(app)/layout.tsx`. O arquivo importa `getUser, getCachedUserProfile` e tem um `redirect("/login")` se não há user ou profile.

- [ ] **Step 7.2: Adicionar import e gate de onboarding**

Adicionar import no topo (após os imports existentes):
```typescript
import { getOnboardingStatus } from "@/lib/onboarding/guards";
```

Após a linha `const companyId = profile.memberships?.[0]?.company_id ?? null;`, adicionar o gate:
```typescript
  if (companyId) {
    const onboardingStatus = await getOnboardingStatus(companyId);
    if (onboardingStatus !== 'completed') {
      redirect('/onboarding');
    }
  }
```

O arquivo final fica assim:
```typescript
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/app/app-shell";
import { getOnboardingStatus } from "@/lib/onboarding/guards";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  if (!profile) redirect("/login");

  const companyId = profile.memberships?.[0]?.company_id ?? null;

  if (companyId) {
    const onboardingStatus = await getOnboardingStatus(companyId);
    if (onboardingStatus !== 'completed') {
      redirect('/onboarding');
    }
  }

  let hotCount = 0;
  if (companyId) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "hot");
    hotCount = count ?? 0;
  }

  return (
    <AuthProvider initialUser={user} initialProfile={profile}>
      <AppShell hotCount={hotCount}>{children}</AppShell>
    </AuthProvider>
  );
}
```

- [ ] **Step 7.3: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 7.4: Commit**

```powershell
git add app/(app)/layout.tsx
git commit -m "feat(onboarding): add onboarding gate to app layout"
```

---

## Task 8: Onboarding Route Group + Server Actions

**Files:**
- Create: `app/(onboarding)/layout.tsx`
- Create: `app/(onboarding)/page.tsx`
- Create: `app/(onboarding)/actions.ts`

- [ ] **Step 8.1: Criar layout.tsx do grupo onboarding**

```typescript
// app/(onboarding)/layout.tsx
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/lib/onboarding/guards";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  if (!profile) redirect("/login");

  const companyId = profile.memberships?.[0]?.company_id ?? null;
  if (!companyId) redirect("/login");

  const status = await getOnboardingStatus(companyId);
  if (status === 'completed') redirect("/inbox");

  return (
    <div className="bg-aurora min-h-screen">
      {children}
    </div>
  );
}
```

- [ ] **Step 8.2: Criar page.tsx do onboarding**

```typescript
// app/(onboarding)/page.tsx
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { buildPrefillFromLegacy } from "@/lib/onboarding/prefill";
import { OnboardingWizard } from "./onboarding-wizard";
import type { OnboardingData } from "@/lib/onboarding/types";

export default async function OnboardingPage() {
  const user = await getUser();
  const profile = await getCachedUserProfile(user!.id);
  const companyId = profile!.memberships![0].company_id;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name, ai_name, ai_tone, ai_greeting, persona_config, onboarding_step, onboarding_data")
    .eq("id", companyId)
    .single();

  const savedStep = (company?.onboarding_step ?? 0);
  const savedData = (company?.onboarding_data ?? {}) as Partial<OnboardingData>;

  const prefill = buildPrefillFromLegacy({
    name: company?.name,
    ai_name: company?.ai_name,
    ai_tone: company?.ai_tone,
    persona_config: company?.persona_config,
    onboarding_data: Object.keys(savedData).length > 0 ? savedData : null,
  });

  return (
    <OnboardingWizard
      initialStep={savedStep}
      initialData={prefill}
      companyId={companyId}
    />
  );
}
```

- [ ] **Step 8.3: Criar actions.ts**

```typescript
// app/(onboarding)/actions.ts
"use server";

import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { applyOnboardingConfig, ApplyResult } from "@/lib/onboarding/apply";
import type { OnboardingData } from "@/lib/onboarding/types";

async function getCompanyId(): Promise<string> {
  const user = await getUser();
  if (!user) redirect("/login");
  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");
  return companyId;
}

export async function saveOnboardingStep(
  step: number,
  data: Partial<OnboardingData>,
): Promise<void> {
  const companyId = await getCompanyId();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("companies")
    .select("onboarding_data, onboarding_step")
    .eq("id", companyId)
    .single();

  const merged = { ...(existing?.onboarding_data ?? {}), ...data };
  const newStep = Math.max(step, existing?.onboarding_step ?? 0);

  await supabase
    .from("companies")
    .update({
      onboarding_data: merged,
      onboarding_step: newStep,
      onboarding_status: "in_progress",
    })
    .eq("id", companyId);
}

export async function completeOnboarding(
  data: OnboardingData,
): Promise<ApplyResult> {
  const companyId = await getCompanyId();
  const result = await applyOnboardingConfig(companyId, data);

  if (!result.ok) {
    const supabase = await createClient();
    await supabase
      .from("companies")
      .update({ onboarding_status: "needs_review" })
      .eq("id", companyId);
  }

  return result;
}
```

- [ ] **Step 8.4: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 8.5: Commit**

```powershell
git add "app/(onboarding)/layout.tsx" "app/(onboarding)/page.tsx" "app/(onboarding)/actions.ts"
git commit -m "feat(onboarding): add route group with layout, page, and server actions"
```

---

## Task 9: Wizard Shell + Progress Bar

**Files:**
- Create: `app/(onboarding)/onboarding-wizard.tsx`
- Create: `app/(onboarding)/components/onboarding-progress.tsx`

- [ ] **Step 9.1: Criar onboarding-progress.tsx**

```typescript
// app/(onboarding)/components/onboarding-progress.tsx
"use client";

import { motion } from "framer-motion";

interface OnboardingProgressProps {
  current: number;
  total: number;
}

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  const pct = Math.round((current / total) * 100);

  return (
    <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <motion.div
        className="h-full rounded-full bg-violet-500"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
```

- [ ] **Step 9.2: Criar onboarding-wizard.tsx**

```typescript
// app/(onboarding)/onboarding-wizard.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { saveOnboardingStep, completeOnboarding } from "./actions";
import { OnboardingProgress } from "./components/onboarding-progress";
import { StepEmpresa } from "./components/steps/step-empresa";
import { StepObjetivo } from "./components/steps/step-objetivo";
import { StepCanais } from "./components/steps/step-canais";
import { StepIA } from "./components/steps/step-ia";
import { StepMetas } from "./components/steps/step-metas";
import type { OnboardingData } from "@/lib/onboarding/types";
import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding/types";

const STEP_TITLES = [
  "Sua Empresa",
  "Seu Objetivo",
  "Seus Canais",
  "Sua IA",
  "Suas Metas",
] as const;

const STEP_SUBTITLES = [
  "Conte-nos sobre o negócio que vamos impulsionar.",
  "O que você quer alcançar com o Agendra?",
  "Onde seus leads chegam hoje?",
  "Como sua IA deve se apresentar?",
  "Quase lá — vamos calibrar suas metas.",
] as const;

const STEPS = [StepEmpresa, StepObjetivo, StepCanais, StepIA, StepMetas] as const;

interface OnboardingWizardProps {
  initialStep: number;
  initialData: Partial<OnboardingData>;
  companyId: string;
}

export function OnboardingWizard({
  initialStep,
  initialData,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(initialStep, ONBOARDING_TOTAL_STEPS - 1));
  const [data, setData] = useState<Partial<OnboardingData>>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isPending, startTransition] = useTransition();

  const StepComponent = STEPS[step];
  const isLast = step === ONBOARDING_TOTAL_STEPS - 1;

  function handleChange(patch: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function handleBack() {
    if (step === 0 || isPending) return;
    setDirection(-1);
    setStep((s) => s - 1);
    setError(null);
  }

  function handleNext() {
    setError(null);
    setDirection(1);
    startTransition(async () => {
      await saveOnboardingStep(step + 1, data);

      if (!isLast) {
        setStep((s) => s + 1);
        return;
      }

      const result = await completeOnboarding(data as OnboardingData);
      if (result.ok) {
        router.push("/inbox");
        router.refresh();
      } else {
        setError(result.error ?? "Erro ao configurar. Tente novamente.");
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="mb-10 flex justify-center">
          <img src="/assets/agendra-logo.svg" alt="Agendra" className="h-7" />
        </div>

        {/* Progress */}
        <OnboardingProgress current={step + 1} total={ONBOARDING_TOTAL_STEPS} />
        <p className="mb-8 text-center text-xs font-medium tracking-widest text-white/30 uppercase">
          Passo {step + 1} de {ONBOARDING_TOTAL_STEPS}
        </p>

        {/* Step header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {STEP_TITLES[step]}
          </h1>
          <p className="mt-1 text-sm text-white/50">{STEP_SUBTITLES[step]}</p>
        </div>

        {/* Step card */}
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={(d: number) => ({ opacity: 0, x: d * 40 })}
            animate={{ opacity: 1, x: 0 }}
            exit={(d: number) => ({ opacity: 0, x: d * -40 })}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-sm">
              <StepComponent data={data} onChange={handleChange} />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Error */}
        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0 || isPending}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-white/50 transition hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            ← Voltar
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:bg-violet-500 disabled:opacity-50"
          >
            {isPending
              ? "Salvando..."
              : isLast
                ? "Concluir →"
                : "Continuar →"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.3: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros. Se falhar por imports de steps ainda não criados, crie arquivos stub temporários (Task 10 os completa).

- [ ] **Step 9.4: Commit**

```powershell
git add "app/(onboarding)/onboarding-wizard.tsx" "app/(onboarding)/components/onboarding-progress.tsx"
git commit -m "feat(onboarding): add wizard shell and progress bar component"
```

---

## Task 10: Step Components

**Files:**
- Create: `app/(onboarding)/components/steps/step-empresa.tsx`
- Create: `app/(onboarding)/components/steps/step-objetivo.tsx`
- Create: `app/(onboarding)/components/steps/step-canais.tsx`
- Create: `app/(onboarding)/components/steps/step-ia.tsx`
- Create: `app/(onboarding)/components/steps/step-metas.tsx`

Todos os steps compartilham a mesma interface:
```typescript
interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}
```

- [ ] **Step 10.1: Criar step-empresa.tsx**

```typescript
// app/(onboarding)/components/steps/step-empresa.tsx
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
  "Imobiliária",
  "Consultoria",
  "Educação",
  "Advocacia",
  "E-commerce",
  "Agência",
  "Academia / Fitness",
  "Outro",
];

export function StepEmpresa({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Nome */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Nome da empresa
        </label>
        <input
          type="text"
          placeholder="Ex: Studio Bella"
          value={data.company_name ?? ""}
          onChange={(e) => onChange({ company_name: e.target.value })}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        />
      </div>

      {/* Nicho */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Segmento / Nicho
        </label>
        <select
          value={data.niche ?? ""}
          onChange={(e) => onChange({ niche: e.target.value })}
          className="w-full rounded-xl border border-white/[0.08] bg-[rgb(11,18,34)] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        >
          <option value="" disabled>Selecione...</option>
          {NICHES.map((n) => (
            <option key={n} value={n.toLowerCase()}>{n}</option>
          ))}
        </select>
      </div>

      {/* Porte */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
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
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
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
```

- [ ] **Step 10.2: Criar step-objetivo.tsx**

```typescript
// app/(onboarding)/components/steps/step-objetivo.tsx
"use client";

import type { OnboardingData, BusinessGoal, BusinessMaturity } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const GOALS: { value: BusinessGoal; label: string; emoji: string }[] = [
  { value: "capture", label: "Captar leads", emoji: "🎯" },
  { value: "nurture", label: "Nutrir contatos", emoji: "🌱" },
  { value: "qualify", label: "Qualificar leads", emoji: "🔍" },
  { value: "convert", label: "Converter em vendas", emoji: "💰" },
  { value: "follow", label: "Acompanhar pós-venda", emoji: "🤝" },
];

const MATURITIES: { value: BusinessMaturity; label: string; desc: string }[] = [
  { value: "beginner", label: "Iniciante", desc: "Estou começando agora" },
  { value: "intermediate", label: "Intermediário", desc: "Já tenho algum processo" },
  { value: "advanced", label: "Avançado", desc: "Processo estruturado" },
];

export function StepObjetivo({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Objetivo */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Objetivo principal
        </label>
        <div className="flex flex-col gap-1.5">
          {GOALS.map(({ value, label, emoji }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ goal: value })}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                data.goal === value
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              <span className="text-lg">{emoji}</span>
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Maturidade */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Maturidade comercial
        </label>
        <div className="grid grid-cols-3 gap-2">
          {MATURITIES.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ maturity: value })}
              className={`flex flex-col rounded-xl border p-3 text-left transition ${
                data.maturity === value
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
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
```

- [ ] **Step 10.3: Criar step-canais.tsx**

```typescript
// app/(onboarding)/components/steps/step-canais.tsx
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
```

- [ ] **Step 10.4: Criar step-ia.tsx**

```typescript
// app/(onboarding)/components/steps/step-ia.tsx
"use client";

import type { OnboardingData, AiTone } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const TONES: { value: AiTone; label: string; example: string }[] = [
  { value: "friendly", label: "Amigável", example: '"Olá! Que bom te ver aqui 😊"' },
  { value: "formal", label: "Formal", example: '"Prezado cliente, como posso ajudar?"' },
  { value: "direct", label: "Direto", example: '"Como posso te ajudar?"' },
  { value: "warm", label: "Caloroso", example: '"Seja muito bem-vindo! Vamos lá?"' },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Campo_Grande", label: "Campo Grande (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4)" },
  { value: "America/Boa_Vista", label: "Boa Vista (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
];

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

const DEFAULT_HOURS: Record<string, [string, string]> = {
  mon: ["09:00", "18:00"],
  tue: ["09:00", "18:00"],
  wed: ["09:00", "18:00"],
  thu: ["09:00", "18:00"],
  fri: ["09:00", "18:00"],
};

export function StepIA({ data, onChange }: StepProps) {
  const wh = data.working_hours ?? DEFAULT_HOURS;
  const activeDays = Object.keys(wh);

  function toggleDay(key: string) {
    const next = { ...wh };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = ["09:00", "18:00"];
    }
    onChange({ working_hours: Object.keys(next).length > 0 ? next : DEFAULT_HOURS });
  }

  function setTime(field: 0 | 1, value: string) {
    const next: Record<string, [string, string]> = {};
    for (const [day, range] of Object.entries(wh)) {
      next[day] = field === 0 ? [value, range[1]] : [range[0], value];
    }
    onChange({ working_hours: next });
  }

  const firstEntry = Object.values(wh)[0] ?? ["09:00", "18:00"];

  return (
    <div className="flex flex-col gap-5">
      {/* Nome da IA */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Nome da sua IA
        </label>
        <input
          type="text"
          placeholder="Ex: Sofia, Ana, Max..."
          value={data.ai_name ?? ""}
          onChange={(e) => onChange({ ai_name: e.target.value })}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        />
      </div>

      {/* Tom */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Tom de comunicação
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TONES.map(({ value, label, example }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ai_tone: value })}
              className={`flex flex-col rounded-xl border p-3 text-left transition ${
                data.ai_tone === value
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              <span className="text-sm font-semibold">{label}</span>
              <span className="mt-0.5 text-xs opacity-50 leading-snug">{example}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fuso horário */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Fuso horário
        </label>
        <select
          value={data.timezone ?? "America/Sao_Paulo"}
          onChange={(e) => onChange({ timezone: e.target.value })}
          className="w-full rounded-xl border border-white/[0.08] bg-[rgb(11,18,34)] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
        >
          {TIMEZONES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Horário de funcionamento */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Dias de atendimento
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleDay(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                activeDays.includes(key)
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-1">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/40">Início</label>
            <input
              type="time"
              value={firstEntry[0]}
              onChange={(e) => setTime(0, e.target.value)}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
          <span className="text-white/30 mt-5">–</span>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/40">Fim</label>
            <input
              type="time"
              value={firstEntry[1]}
              onChange={(e) => setTime(1, e.target.value)}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.5: Criar step-metas.tsx**

```typescript
// app/(onboarding)/components/steps/step-metas.tsx
"use client";

import type { OnboardingData, PrimaryMetric } from "@/lib/onboarding/types";

interface StepProps {
  data: Partial<OnboardingData>;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const METRICS: { value: PrimaryMetric; label: string; desc: string }[] = [
  { value: "leads", label: "Volume de leads", desc: "Quero captar mais contatos" },
  { value: "appointments", label: "Agendamentos", desc: "Quero lotar minha agenda" },
  { value: "conversions", label: "Conversões", desc: "Quero fechar mais vendas" },
  { value: "revenue", label: "Receita", desc: "Quero aumentar o faturamento" },
];

const TEAM_OPTIONS = [
  { value: 1, label: "Só eu" },
  { value: 3, label: "2–5" },
  { value: 10, label: "6–20" },
  { value: 30, label: "20+" },
];

export function StepMetas({ data, onChange }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Equipe */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Tamanho da equipe comercial
        </label>
        <div className="grid grid-cols-4 gap-2">
          {TEAM_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ team_size: value })}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                data.team_size === value
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Métrica */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
          Sua principal métrica de sucesso
        </label>
        <div className="flex flex-col gap-1.5">
          {METRICS.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ primary_metric: value })}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                data.primary_metric === value
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/[0.12] hover:text-white/80"
              }`}
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs opacity-50">{desc}</p>
              </div>
              {data.primary_metric === value && (
                <span className="ml-auto text-violet-400 text-sm">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.6: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 10.7: Rodar todos os testes**

```powershell
pnpm test
```

Expected: `16 tests passed`

- [ ] **Step 10.8: Commit**

```powershell
git add "app/(onboarding)/components/"
git commit -m "feat(onboarding): add all 5 step components"
```

---

## Task 11: Analytics + Guards em Server Actions Existentes

**Files:**
- Modify: `app/(onboarding)/onboarding-wizard.tsx` (analytics)
- Modify: `app/(app)/leads/actions.ts` (guard example)
- Modify: `app/(app)/inbox/actions.ts` (guard example)
- Modify: `app/(app)/agenda/actions.ts` (guard example)

- [ ] **Step 11.1: Adicionar trackEvent no wizard**

Em `onboarding-wizard.tsx`, adicionar imports:
```typescript
import { trackEvent } from "@/lib/analytics";
```

No final do `useState` inicial, adicionar `useEffect` de início:
```typescript
import { useEffect } from "react";

// Dentro do componente, após os useState:
useEffect(() => {
  if (step === 0) {
    trackEvent("onboarding_start");
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

No bloco `if (result.ok)` dentro de `handleNext`:
```typescript
if (result.ok) {
  trackEvent("onboarding_complete");
  router.push("/inbox");
  router.refresh();
}
```

- [ ] **Step 11.2: Adicionar guard em leads/actions.ts**

Abrir `app/(app)/leads/actions.ts`. No topo de cada `export async function`, adicionar:

```typescript
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { requireOnboarding } from "@/lib/onboarding/guards";

// Dentro de cada action que manipula dados sensíveis:
async function getValidatedCompanyId(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("NO_COMPANY");
  await requireOnboarding(companyId);
  return companyId;
}
```

Chamar `getValidatedCompanyId()` no início de cada action que acessa leads.

- [ ] **Step 11.3: Aplicar o mesmo padrão em inbox/actions.ts e agenda/actions.ts**

Mesma adição de `requireOnboarding()` via `getValidatedCompanyId()` em cada Server Action que acessa dados sensíveis de leads, messages, events.

- [ ] **Step 11.4: Verificar typecheck**

```powershell
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 11.5: Commit final**

```powershell
git add -A
git commit -m "feat(onboarding): add analytics tracking and server action guards"
```

---

## Task 12: Smoke Test Manual

- [ ] **Step 12.1: Rodar dev server**

```powershell
pnpm dev
```

- [ ] **Step 12.2: Teste — conta existente bloqueada**

1. Logar com conta existente (onboarding_status = 'not_started')
2. Tentar acessar `/inbox` diretamente na URL
3. Expected: redirect automático para `/onboarding`

- [ ] **Step 12.3: Teste — fluxo completo**

1. Em `/onboarding`, preencher Step 1 (nome, nicho, porte)
2. Clicar Continuar → verificar que dados foram salvos no Supabase
3. Preencher Steps 2-5
4. Clicar Concluir
5. Expected: redirect para `/inbox`, sem gate de onboarding

- [ ] **Step 12.4: Teste — retomada após refresh**

1. Completar Step 2, fechar o browser
2. Reabrir e ir para `/onboarding`
3. Expected: wizard abre no Step 2 com dados pré-preenchidos

- [ ] **Step 12.5: Teste — bypass via URL após conclusão**

1. Conta com onboarding completo
2. Tentar acessar `/onboarding` diretamente
3. Expected: redirect para `/inbox`

- [ ] **Step 12.6: Verificar no Supabase que persona_config foi aplicado**

```sql
SELECT id, name, onboarding_status, onboarding_completed_at, persona_config, ai_name, ai_tone
FROM companies
WHERE onboarding_status = 'completed'
LIMIT 5;
```

Expected: `onboarding_status = 'completed'`, `persona_config` preenchido, `ai_name` e `ai_tone` populados.

- [ ] **Step 12.7: Commit final de validação**

```powershell
git add -A
git commit -m "feat(onboarding): complete intelligent onboarding system

- 3-layer anti-bypass gate (app layout + onboarding layout + SA guards)
- 5-step adaptive wizard with legacy prefill
- Auto-save per step, resume on refresh
- applyOnboardingConfig writes persona_config + AI fields on completion
- Extensible onboarding_applied_config for future pipeline/automation hooks
- Analytics: onboarding_start + onboarding_complete events
"
```

---

## Checklist de Cobertura vs Spec

| Requisito do Spec | Task que implementa |
|---|---|
| Estado `not_started/in_progress/completed/needs_review` | Task 1 + Task 2 |
| Gate middleware | Task 6 |
| Gate layout SSR (fonte de verdade) | Task 7 |
| Gate onboarding layout (anti-reverso) | Task 8 |
| Guards em Server Actions | Task 11 |
| 5 steps core obrigatórios | Task 10 |
| Auto-save por step | Task 8 (actions) |
| Retomada após interrupção | Task 8 (page.tsx carrega onboarding_step) |
| Pré-preenchimento de contas legadas | Task 4 (prefill) + Task 8 (page.tsx) |
| applyOnboardingConfig com persona_config | Task 5 |
| onboarding_applied_config extensível | Task 5 |
| needs_review em falha de apply | Task 8 (completeOnboarding) |
| Analytics start + complete | Task 11 |
| Redirect /inbox após conclusão | Task 9 (wizard) |
| Bypass via URL bloqueado | Task 7 + Task 8 layout |
| Bypass via API bloqueado | Task 11 (SA guards) |
| Múltiplas abas | DB atomico, cada aba via SSR |
| Contas antigas forçadas ao fluxo | Task 1 (default not_started) |
| Contas completas não entram em /onboarding | Task 8 (onboarding layout redirect) |
