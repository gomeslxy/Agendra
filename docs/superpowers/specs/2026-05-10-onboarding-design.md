# Onboarding Inteligente — Design Spec
**Data:** 2026-05-10  
**Status:** Aprovado para implementação  
**Stack:** Next.js 15 App Router · Supabase · Tailwind v4 · Framer Motion · shadcn/ui

---

## 1. Contexto & Decisões

| Decisão | Escolha |
|---|---|
| Contas legadas com `persona_config` | Forçar fluxo com pré-preenchimento — usuário confirma/ajusta |
| Mínimo para desbloquear | 5 campos core obrigatórios; resto não-bloqueante em Settings |
| Renderização | Rota `/onboarding` com layout próprio (sem sidebar/topbar) |
| Arquitetura de gate | Opção 1: Layout SSR check + cookie sync + API guards (3 camadas) |
| Side effects | Aplicar o que existe hoje + `onboarding_applied_config` extensível |
| Pós-conclusão | Redireciona para `/inbox` (nova e legada) |

---

## 2. State Machine

```
not_started ──► in_progress ──► completed
                     │
                     └──► needs_review   (edge: dados legados quebrados)
```

**Transições:**
- `not_started → in_progress`: primeiro step salvo
- `in_progress → completed`: step 5 (último core) concluído + `applyOnboardingConfig()` executado com sucesso
- `* → needs_review`: `applyOnboardingConfig()` falha por dados inconsistentes — exibe erro, não bloqueia indefinidamente
- `needs_review → completed`: usuário corrige e re-submete

**Regra de domínio:** qualquer acesso a rota protegida com status ≠ `completed` → redirect `/onboarding`.

---

## 3. Schema — Migration

**Arquivo:** `supabase/migrations/005_onboarding.sql`

```sql
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

**Backfill:** nenhum UPDATE necessário — `DEFAULT 'not_started'` já cobre todos os existentes. Pré-preenchimento vem de `persona_config` na hora de carregar o form (não de um backfill de status).

**`onboarding_data` shape:**
```typescript
interface OnboardingData {
  // Step 1 — Empresa
  company_name?: string;
  niche?: string;           // ex: "salão de beleza", "clínica", "consultoria"
  size?: 'solo' | 'small' | 'medium' | 'large';  // 1 / 2-10 / 11-50 / 50+

  // Step 2 — Objetivo
  goal?: 'capture' | 'nurture' | 'qualify' | 'convert' | 'follow';
  maturity?: 'beginner' | 'intermediate' | 'advanced';

  // Step 3 — Canais
  channels?: Array<'whatsapp' | 'instagram' | 'form'>;
  uses_crm?: boolean;
  crm_name?: string;

  // Step 4 — Persona da IA (core unlock gate)
  ai_name?: string;
  ai_tone?: string;         // 'formal' | 'friendly' | 'direct' | 'warm'
  ai_language?: string;     // default 'pt-BR'
  timezone?: string;        // default 'America/Sao_Paulo'
  working_hours?: Record<string, [string, string]>;

  // Step 5 — Metas (completa o core)
  team_size?: number;
  primary_metric?: 'leads' | 'appointments' | 'conversions' | 'revenue';
  desired_integrations?: string[];
}
```

**`onboarding_applied_config` shape:**
```typescript
interface OnboardingAppliedConfig {
  persona_config_set: boolean;
  ai_settings_set: boolean;
  pipeline_created: boolean;    // sempre false hoje; extensível no futuro
  automations_created: boolean; // sempre false hoje
  applied_at: string;           // ISO timestamp
  applied_version: number;      // 1 = schema v1 deste sistema
}
```

---

## 4. Steps do Fluxo

5 steps core (bloqueantes) + barra de progresso visível.

| # | Nome | Campos | Obrigatório p/ unlock |
|---|------|--------|----------------------|
| 1 | Sua Empresa | `company_name`, `niche`, `size` | ✅ |
| 2 | Seu Objetivo | `goal`, `maturity` | ✅ |
| 3 | Seus Canais | `channels`, `uses_crm`, `crm_name` | ✅ |
| 4 | Sua IA | `ai_name`, `ai_tone`, `timezone`, `working_hours` | ✅ |
| 5 | Suas Metas | `team_size`, `primary_metric` | ✅ (último — dispara apply) |

**Auto-save:** cada step salva `onboarding_data` + `onboarding_step` via Server Action antes de avançar. Interrupcção = retoma do step salvo.

**Pré-preenchimento legado:** ao carregar `/onboarding`, o Server Component lê `persona_config` + campos AI existentes e injeta em `onboarding_data` se ainda vazio.

---

## 5. Arquitetura de Gate (3 camadas)

### Camada 1 — `middleware.ts`
```
Lê cookie `agendra_ob` (valor: 'completed' | ausente)
Se rota protegida + cookie ausente/diferente → redirect /onboarding
Se rota /onboarding + cookie = 'completed' → redirect /inbox
```
Cookie é HttpOnly, SameSite=Lax, setado pelo layout SSR.

### Camada 2 — `app/(app)/layout.tsx` (source of truth)
```
getUser() → getCachedUserProfile() → getCompanyOnboardingStatus(companyId)
Se status !== 'completed' → seta cookie (ausente) + redirect /onboarding
Se status === 'completed' → seta cookie 'completed' + renderiza normalmente
```
Sempre consulta DB — não confia só no cookie.

### Camada 3 — Server Actions & API Routes
```typescript
// lib/onboarding/guards.ts
export async function requireOnboarding(companyId: string): Promise<void>
// Lança NextResponse 403 se onboarding_status !== 'completed'
// Chamado no início de toda Server Action sensível
```

**Por que 3 camadas:**
- Middleware: intercepta antes do React render (sem DB = rápido)
- Layout: valida contra DB a cada render (não confia em cookie)
- Guards: última linha de defesa para chamadas diretas à API

### Rota `/onboarding`

```
app/(onboarding)/
  layout.tsx          ← layout próprio (bg-aurora, sem sidebar)
  page.tsx            ← Server Component: carrega estado atual, pre-fill
  onboarding-wizard.tsx ← Client Component: state machine UI
```

**O layout de onboarding também redireciona se `status === 'completed'`** — impede acesso direto a `/onboarding` após conclusão.

---

## 6. Side Effects — `applyOnboardingConfig()`

Executado no final do Step 5 via Server Action com admin client.

```typescript
// lib/onboarding/apply.ts
export async function applyOnboardingConfig(
  companyId: string,
  data: OnboardingData
): Promise<{ ok: boolean; error?: string }>
```

**O que aplica hoje:**

1. **`persona_config`** — monta o JSONB completo a partir das respostas:
   ```json
   {
     "name": data.ai_name,
     "business_name": data.company_name,
     "business_type": data.niche,
     "tone": data.ai_tone,
     "timezone": data.timezone,
     "working_hours": data.working_hours,
     "slot_duration_minutes": 60
   }
   ```

2. **Campos diretos de `companies`:**
   - `ai_name = data.ai_name`
   - `ai_tone = data.ai_tone`
   - `ai_greeting` — gerado automaticamente: `"Olá! Sou ${data.ai_name}, assistente virtual de ${data.company_name}."`

3. **`onboarding_status = 'completed'`**, `onboarding_completed_at = now()`

4. **`onboarding_applied_config`** — registra o que foi aplicado (extensível)

**Resiliência:** se `applyOnboardingConfig()` falha → status vai para `needs_review`, UI mostra erro com retry, app NÃO desbloqueia.

---

## 7. UI — Onboarding Wizard

**Design:** Liquid Glass do Agendra — `bg-aurora`, cards glass, sem sidebar.

**Layout da tela:**
```
┌─────────────────────────────────────────┐
│  [Logo Agendra]              Step X de 5 │
│  ════════════════░░░░░░░░░░░░░░░░░░░░░  │  ← progress bar
│                                          │
│         [Título do Step]                 │
│         [Subtítulo curto]                │
│                                          │
│    [Card glass com campos do step]       │
│                                          │
│    [← Voltar]          [Continuar →]    │
└─────────────────────────────────────────┘
```

**Animações:** Framer Motion — slide horizontal entre steps (direita ao avançar, esquerda ao voltar). Sem AnimatePresence mode=wait (já aprendido).

**Componentes a criar:**
- `OnboardingWizard` — state machine client, gerencia step atual
- `OnboardingProgress` — barra de progresso animada
- `StepEmpresa`, `StepObjetivo`, `StepCanais`, `StepIA`, `StepMetas` — cada step isolado
- `OnboardingLayout` — wrapper glass full-screen

**Server Actions para o wizard:**
```typescript
// app/(onboarding)/actions.ts
saveOnboardingStep(step: number, data: Partial<OnboardingData>): Promise<void>
completeOnboarding(data: OnboardingData): Promise<{ ok: boolean; error?: string }>
getOnboardingState(companyId: string): Promise<OnboardingState>
```

---

## 8. Proteção Anti-Bypass

| Vetor de ataque | Proteção |
|---|---|
| Mudar URL para `/inbox` | Middleware lê cookie + Layout consulta DB → redirect `/onboarding` |
| Deletar cookie | Layout SSR sempre consulta DB e redefine cookie |
| Chamar Server Action diretamente | `requireOnboarding()` no início de cada action |
| Chamada direta a API route | `requireOnboarding()` no handler |
| Múltiplas abas | Cada aba executa layout SSR independente — DB é fonte de verdade |
| Refresh no meio do fluxo | `onboarding_step` salvo no DB — wizard retoma de onde parou |
| Race condition (2 abas no wizard) | DB update é atômico; `onboarding_step` só avança, nunca volta |
| Manipular `localStorage` | Nenhum estado crítico no client storage |
| Alterar query params | Nenhuma decisão de gate baseada em query params |
| Forçar cookie `agendra_ob=completed` | Layout consulta DB e sobrescreve cookie — bypass dura 1 render |

---

## 9. Analytics

Eventos GA4 existentes que serão disparados (já declarados em `lib/analytics.ts`):
- `onboarding_start` — ao carregar o wizard pela primeira vez
- `onboarding_complete` — após `applyOnboardingConfig()` com sucesso

Novos eventos a adicionar:
- `onboarding_step_completed` com `{ step: number }`
- `onboarding_abandoned` — se sessão expira com status `in_progress`

---

## 10. Estrutura de Arquivos

```
supabase/migrations/
  005_onboarding.sql

lib/onboarding/
  types.ts            ← OnboardingData, OnboardingState, OnboardingStatus
  guards.ts           ← requireOnboarding(), getOnboardingStatus()
  apply.ts            ← applyOnboardingConfig()
  prefill.ts          ← buildPrefillFromLegacy(company) → Partial<OnboardingData>

app/(onboarding)/
  layout.tsx          ← guard: se completed → /inbox; seta cookie
  page.tsx            ← Server Component: carrega estado + prefill
  actions.ts          ← saveOnboardingStep(), completeOnboarding()
  onboarding-wizard.tsx
  components/
    onboarding-progress.tsx
    steps/
      step-empresa.tsx
      step-objetivo.tsx
      step-canais.tsx
      step-ia.tsx
      step-metas.tsx

middleware.ts           ← adiciona lógica de cookie onboarding ao existente
app/(app)/layout.tsx    ← adiciona check onboarding + set cookie
```

---

## 11. Compatibilidade Legada

**Empresas com `persona_config` não-vazio:**
- `onboarding_status = 'not_started'` (default do migration)
- Ao acessar `/onboarding`, `buildPrefillFromLegacy()` converte `persona_config` → `OnboardingData`
- Form aparece pré-preenchido — usuário confirma/ajusta e completa

**Empresas com `ai_name` / `ai_tone` diretamente em companies:**
- Mesma lógica — `buildPrefillFromLegacy()` lê esses campos também

**Empresas sem nenhum dado:**
- Form em branco — onboarding normal

**Schema legado com campos faltando:**
- Todos os campos do onboarding são nullable — sem risco de crash em leitura

---

## 12. Testes a Cobrir

- [ ] Conta nova → redirecionada para `/onboarding` automaticamente
- [ ] Conta antiga sem onboarding → redirecionada para `/onboarding`
- [ ] Conta antiga com `persona_config` → form pré-preenchido
- [ ] Acesso direto a `/inbox` sem onboarding → redirect `/onboarding`
- [ ] Refresh no step 3 → retoma do step 3
- [ ] Múltiplas abas no wizard → DB serializa progresso corretamente
- [ ] Chamada direta a Server Action sem onboarding → 403
- [ ] `applyOnboardingConfig()` falha → status `needs_review`, app não desbloqueia
- [ ] Após conclusão, `/onboarding` redireciona para `/inbox`
- [ ] Cookie deletado manualmente → layout re-valida e corrige
- [ ] Mudança de plano durante onboarding → fluxo não quebra
