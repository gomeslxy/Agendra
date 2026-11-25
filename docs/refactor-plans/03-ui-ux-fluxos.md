# Plano de Refatoração 03 — UI/UX, Decomposição de Monólitos e Fluxos Críticos

> **Escopo:** Desmonte modular dos monólitos client-side (`settings-shell.tsx`, `inbox-client.tsx`, `reports-client.tsx`, `agenda-client.tsx`, `leads-client.tsx`, `notifications-view.tsx`, `tenants-tab.tsx`, `debug-tab.tsx`), streaming real com `<Suspense>` / `loading.tsx` / `error.tsx`, acessibilidade, responsividade mobile e correção de bugs nos fluxos de Inbox (Shadow Mode / Takeover / Realtime), Agenda, Settings, Reports e Onboarding.
> **Stack Alvo:** Next.js `16.2.6` (App Router), React `19.0.0`, TypeScript `5.7.2`, Tailwind CSS v4, Framer Motion `12.38.0`, Lucide React, Sonner.

---

## 1. Diagnóstico Objetivo

### Tabela Resumo de Achados

| ID | Severidade | Evidência no Código | Sintoma / Causa Raiz | Impacto em Produção |
| :--- | :--- | :--- | :--- | :--- |
| `P0-UX-01` | **P0 Crítico** | `app/(app)/inbox/actions.ts:190-198` vs `lib/ai/engine.ts:779` | Alternar de `manual` para `shadow` (Copiloto) não limpa `human_takeover_until` | **Shadow Mode inoperante por 24h** após qualquer takeover humano |
| `P0-UX-02` | **P0 Crítico** | `app/(app)/inbox/actions.ts:24-74, 336-409` vs `lib/ai/takeover.ts:25-37` | `sendNote` e `sendFileAttachment` nunca chamam `activateTakeover` nem `extendTakeoverOnHumanMessage` (código morto) | **IA atropela atendente humano** respondendo no meio do atendimento manual |
| `P0-UX-03` | **P0 Crítico** | `app/(app)/settings/page.tsx:27, 38-47, 79-184` vs `settings-shell.tsx:255-264` | Server carrega dados apenas da `tab` inicial; troca de aba client-side exibe arrays vazios antes do refresh | **Flash de telas vazias** ("Nenhum serviço/canal/webhook") e estado inconsistente |
| `P1-UX-01` | **P1 Alto** | `settings-shell.tsx` (`3.532` L / `52 useState`), `inbox-client.tsx` (`1.692` L / `19 useState`), `reports-client.tsx` (`892` L), `agenda-client.tsx` (`854` L), `tenants-tab.tsx` (`809` L), `debug-tab.tsx` (`729` L), `planos/page.tsx` (`683` L), `notifications-view.tsx` (`650` L), `leads-client.tsx` (`542` L) | Monólitos gigantes com estado local acoplado; `settings-shell.tsx:233-250` injeta Facebook SDK em todas as abas; `tenants-tab.tsx:33` não ressincroniza `useState(initial)` após `router.refresh()` | Bundle inicial inchado, re-renders pesados ao digitar no Inbox e dados obsoletos no Admin |
| `P1-UX-02` | **P1 Alto** | `app/(app)/settings/page.tsx:79-184`, `app/(app)/notifications/page.tsx:25-83`, árvore `app/` | Todos os `await` rodam **antes** do `<Suspense>`; faltam `settings/loading.tsx`, `notifications/loading.tsx` e `error.tsx` em `(app)`, `admin`, `onboarding` | **Streaming desabilitado** (`SettingsSkeleton`/`NotificationsSkeleton` mortos) e crash total do layout em erros de rota |
| `P1-UX-03` | **P1 Alto** | `inbox-client.tsx:302, 400, 434-440, 541, 680-712` & `leads-client.tsx:528` | `setTimeout(..., 15000)` apaga bolha otimista se Realtime atrasar; sem backfill ao reconectar; mídia Realtime chega sem `media_url` assinada; `/leads` não passa `?leadId=` | **Mensagens somem da tela** após envio, mídias ao vivo quebram até dar F5 e deep-link do lead é perdido |
| `P1-UX-04` | **P1 Alto** | `app/(app)/agenda/actions.ts:36-47, 168-180` & `agenda-client.tsx:336-350` | `createEvent` e `updateEvent` ignoram `book_appointment_atomic` / `reschedule_appointment_atomic` e não geram `reminders`; `handleDelete`/`handleSync` engolem erro no `console.error` | **Double-booking manual** na agenda, ausência de lembretes e erros silenciosos na UI |
| `P1-UX-05` | **P1 Alto** | `reports-client.tsx:372, 440-444`, `topbar.tsx:103, 129`, `leads-client.tsx:77`, `next.config.ts:74` | `WhatIfSimulator` promete Follow-up no **Plano PRO** (é Business em `plans.ts:103`) com botão morto; `topbar` aponta para `/settings#flows`; `alert()` nativo em `leads`; `microphone=()` no header | Informação comercial falsa, links quebrados e bloqueio de microfone |
| `P2-UX-01` | **P2 Médio** | `app-shell.tsx:43`, `mobile-nav.tsx:23`, `leads-client.tsx:289, 433`, `settings-shell.tsx`, `notifications-view.tsx` | Duplo desconto de altura/padding no mobile (`100dvh - 3.5rem` + `pb-[72px]`); modais/drawers/abas sem WAI-ARIA (`role="dialog"`, `Escape`, focus trap, `role="tablist"`) | Faixa morta no rodapé mobile e barreiras de acessibilidade por teclado/leitor de tela |

---

### Detalhamento Técnico das Causas Raízes

#### P0 Crítico

1. **`[P0-UX-01]` Shadow Mode bloqueado por `human_takeover_until` residual (`app/(app)/inbox/actions.ts:190-198`)**
   - Quando um lead passa de `manual` (`human_takeover_until` = agora + 24h) para `shadow`, `setControlMode` executa `admin.from('leads').update({ control_mode: 'shadow', is_paused: false })` sem zerar `human_takeover_at`, `human_takeover_until` e `human_takeover_by`. No turno seguinte, `lib/ai/engine.ts:779` avalia `isUnderHumanTakeover(activeLead)` antes de checar `control_mode === 'shadow'`, silenciando a geração de rascunhos.

2. **`[P0-UX-02]` Envio manual no Inbox não pausa a IA (`app/(app)/inbox/actions.ts:24-74, 336-409`)**
   - `extendTakeoverOnHumanMessage` (`lib/ai/takeover.ts:25-37`) nunca é importada ou chamada. Ao enviar texto (`sendNote`) ou arquivo (`sendFileAttachment`), o lead mantém `control_mode = 'autonomous'` ou mantém o vencimento antigo de `human_takeover_until`, permitindo que a IA responda imediatamente na próxima mensagem do cliente.

3. **`[P0-UX-03]` Dessincronia de abas e telas vazias em `/settings` (`settings/page.tsx` vs `settings-shell.tsx`)**
   - `SettingsPage` busca apenas as coleções da `tab` presente na query string inicial (`linhas 38-47`) e envia `[]` para as demais. `SettingsShell` troca o estado `tab` imediatamente no cliente (`linha 262`) antes da conclusão de `router.replace`, fazendo a aba recém-aberta renderizar `[]` (e subcomponentes com `useState(props)` manterem estado vazio mesmo após a prop atualizar).

#### P1 Alto

- **`[P1-UX-01]` Monólitos de UI e bugs de estado:**
  - `settings-shell.tsx` (`3.532` linhas, `52 useState`, `6 useEffect`) concentra 8 abas inteiras e carrega `https://connect.facebook.net/pt_BR/sdk.js` no mount de qualquer aba.
  - `inbox-client.tsx` (`1.692` linhas, `19 useState`, `7 useEffect`) mistura subscrição Realtime, ordenação da lista, composer de texto/anexo e modais de rascunho no mesmo componente raiz, causando re-render de toda a árvore a cada tecla digitada.
  - `tenants-tab.tsx` (`809` linhas, `22 useState`) inicializa `useState(initial)` sem efeito de sincronização quando `router.refresh()` retorna novos dados após `updateTenantPlan` ou `toggleCompanyAI`.
  - `debug-tab.tsx` (`729` linhas, `24 useState`) lê `result.lead.intent` e `result.lead.lead_score` (`linhas 274-275`), campos que não existem na tabela `leads`.

- **`[P1-UX-02]` `<Suspense>` falso + ausência de boundaries:**
  - `settings/page.tsx:79-184` e `notifications/page.tsx:25-83` aguardam todas as queries antes de retornar `<Suspense>`, bloqueando o streaming SSR. Não há `loading.tsx` em `/settings` nem `/notifications`, e só existe `app/error.tsx` na raiz.

- **`[P1-UX-03]` Inbox Realtime, Otimismo e Deep-Linking:**
  - `inbox-client.tsx:703-711` agenda `setTimeout(..., 15000)` que remove a mensagem otimista caso o evento Realtime não chegue em 15s (deixando o operador achando que a mensagem desapareceu mesmo salva no DB).
  - Não há reconexão/resync incremental ao voltar de `CHANNEL_ERROR` / `TIMED_OUT` (`linha 541`).
  - Mensagens com `media_path` recebidas em tempo real (`linha 400`) não possuem `media_url` assinada até recarregar a página.
  - `leads-client.tsx:528` navega para `/inbox` sem `?leadId=...`, e `inbox-client.tsx:302` ignora query params.

- **`[P1-UX-04]` Divergência entre Agenda manual e Agenda da IA:**
  - `agenda/actions.ts` não usa `book_appointment_atomic`/`reschedule_appointment_atomic` nem cria lembretes na tabela `reminders`; `agenda-client.tsx:336-350` oculta falhas de exclusão/sync do usuário.

- **`[P1-UX-05]` Bugs de Produto & Navegação:**
  - `reports-client.tsx:372, 440-444` anuncia Follow-up no plano PRO (quando é Business) e tem botão `"Ver Planos"` sem ação.
  - `topbar.tsx:129` usa `/settings#flows` (o correto é `/settings?tab=automation`) e a busca global não funciona fora de `/leads`.
  - `leads-client.tsx:77` usa `alert()` síncrono em erro de exportação.
  - `next.config.ts:74` bloqueia `microphone=()` globalmente.

---

## 2. Lista Exata de Arquivos

### 2.1 Criar

| Caminho | Responsabilidade Única |
| :--- | :--- |
| `app/(app)/error.tsx`, `app/admin/error.tsx`, `app/onboarding/error.tsx` | Error Boundaries isolados com retry (`reset()`) preservando navegação |
| `app/(app)/settings/loading.tsx`, `app/(app)/notifications/loading.tsx` | Skeletons automáticos de navegação no App Router |
| `components/ui/dialog.tsx` | Modal e Drawer acessíveis (`role="dialog"`, `aria-modal`, `Escape`, retorno de foco) |
| `components/ui/tabs.tsx` | Primitiva WAI-ARIA (`tablist`, `tab`, `aria-selected`, navegação por setas) |
| `app/(app)/settings/components/settings-nav.tsx` | Navegação desktop/mobile com feedback otimista (`useTransition`) via URL |
| `app/(app)/settings/tabs/tab-data-loaders.tsx` | Server Components individuais por aba para `<Suspense key={tab}>` streaming real |
| `app/(app)/settings/tabs/account-team-tab.tsx` | Equipe, convites, perfil e audit logs (<250 linhas) |
| `app/(app)/settings/tabs/rules-hours-tab.tsx` | `WorkingHoursEditor`, fuso, duração e escalação (<200 linhas) |
| `app/(app)/settings/tabs/services-tab.tsx` | CRUD de serviços e placeholders por nicho (<220 linhas) |
| `app/(app)/settings/tabs/ai-brain-tab.tsx` | Persona, tom, upload/listagem RAG e histórico `prompt_versions` (<280 linhas) |
| `app/(app)/settings/tabs/channels-tab.tsx` | WhatsApp Embedded Signup (carrega SDK Facebook sob demanda apenas nesta aba), Instagram e GCal (<280 linhas) |
| `app/(app)/settings/tabs/automation-tab.tsx` | Lembretes, follow-up, reativação e webhooks com secret mascarado + modal one-time (<280 linhas) |
| `app/(app)/inbox/hooks/use-inbox-realtime.ts` | Realtime com backfill após queda, dedup por `client_temp_id` e assinatura sob demanda de mídia |
| `app/(app)/inbox/hooks/use-inbox-actions.ts` | Ações otimistas de envio, anexo, takeover, shadow e modo de controle |
| `app/(app)/inbox/components/inbox-lead-list.tsx` | Lista lateral de conversas, filtros e badges não lidos (<220 linhas) |
| `app/(app)/inbox/components/inbox-chat-header.tsx` | Cabeçalho do chat, `ToneDropdown`, `ControlModeDropdown`, status Realtime e Takeover (<220 linhas) |
| `app/(app)/inbox/components/inbox-message-stream.tsx` | Timeline agrupada, paginação reversa preservando scroll e cards Shadow (<250 linhas) |
| `app/(app)/inbox/components/inbox-composer.tsx` | Composer isolado (sem re-render da lista ao digitar), preview de anexo e status de falha/retry (<200 linhas) |
| `app/(app)/agenda/components/{calendar-month-grid,day-events-panel,event-form-modal}.tsx` | Decomposição da Agenda (<220 linhas cada) |
| `app/(app)/reports/components/{roi-hero,kpi-grid,conversion-funnel,lead-heatmap,what-if-simulator}.tsx` | Decomposição de Reports (<200 linhas cada; corrige badge Business + `<Link href="/planos">`) |
| `app/(app)/leads/components/{leads-table,lead-create-modal,lead-detail-drawer}.tsx` | Decomposição de Leads (<220 linhas cada; deep-link `/inbox?leadId=...`) |
| `components/app/notifications/{notifications-timeline,notification-preferences-form,company-quiet-hours-form}.tsx` | Decomposição de Notificações (<220 linhas cada) |
| `app/admin/tabs/tenants/{tenants-table,tenant-row-actions,tenant-modals}.tsx` & `app/admin/tabs/debug/{dependency-health-card,env-health-card,lead-inspector-card,cron-health-card}.tsx` | Decomposição das tabs Admin (<220 linhas cada) |

### 2.2 Modificar

| Caminho | Mudança Exata |
| :--- | :--- |
| `app/(app)/inbox/actions.ts` | Em `setControlMode('shadow')`, limpar `human_takeover_at: null, human_takeover_until: null, human_takeover_by: null`; em `sendNote` e `sendFileAttachment`, acionar `activateTakeover` (se `autonomous`) ou `extendTakeoverOnHumanMessage` (se já em takeover) e gravar `client_temp_id` no `metadata`; adicionar `getSignedMediaUrl(mediaPath)` para mídias Realtime |
| `app/(app)/inbox/inbox-client.tsx` | Reduzir a orquestrador fino (<220 linhas) lendo `?leadId=` de `useSearchParams()` |
| `app/(app)/settings/page.tsx` & `settings-shell.tsx` | Remover `await` bloqueante antes do `<Suspense>`; renderizar `<Suspense key={tab} fallback={<PanelSkeleton />}>` envolvendo `<SettingsTabLoader tab={tab} />`; reduzir `settings-shell.tsx` para `<200` linhas |
| `app/(app)/notifications/page.tsx` | Mover queries para `<NotificationsDataLoader />` filho de `<Suspense fallback={<NotificationsSkeleton />}>` |
| `app/(app)/agenda/actions.ts` & `agenda-client.tsx` | Validar conflitos com `book_appointment_atomic`/`reschedule_appointment_atomic` (quando aplicável), criar/atualizar `reminders`, adicionar `toast.error`/`toast.success` em `handleDelete` e `handleSync` e decompor `agenda-client.tsx` |
| `app/(app)/leads/page.tsx` & `leads-client.tsx` | Filtrar por `?q=` vindo do `Topbar`, adicionar paginação server-side, trocar `alert()` por `toast.error()`, linkar para `/inbox?leadId=${id}` |
| `app/(app)/reports/reports-client.tsx` | Orquestrar subcomponentes extraídos (<220 linhas) |
| `app/admin/tabs/tenants-tab.tsx` & `debug-tab.tsx` | Sincronizar estado após `router.refresh()` e corrigir campos do Lead Inspector (`heat_score`, `control_mode`) |
| `components/app/{app-shell,mobile-nav,topbar}.tsx` | Unificar altura mobile (`h-dvh` com padding inferior único evitando faixa morta), corrigir link `/settings?tab=automation` e comportamento da busca no `Topbar` |
| `next.config.ts` | Atualizar header `Permissions-Policy` (`linha 74`) para `camera=(), microphone=(self), geolocation=()` |

### 2.3 Remover / Depreciar

| Alvo | Estratégia sem Downtime |
| :--- | :--- |
| Subcomponentes internos inline de `settings-shell.tsx`, `inbox-client.tsx`, `reports-client.tsx`, `leads-client.tsx`, `tenants-tab.tsx`, `debug-tab.tsx` | Movidos 1:1 para `tabs/` e `components/` sem alterar URLs ou props externas |
| `app/(app)/settings/page.tsx` prefetch condicional com arrays vazios | Substituído diretamente pelos loaders em `Suspense` por aba |

---

## 3. Contratos, Interfaces e Schemas Principais

### 3.1 Reconciliação Otimista Determinística no Inbox (`use-inbox-realtime.ts`)

```typescript
export type OptimisticDeliveryState = 'sending' | 'sent' | 'failed';

export interface OptimisticMessage extends Message {
  _optimistic: true;
  clientTempId: string;
  deliveryState: OptimisticDeliveryState;
  errorMessage?: string;
}

export type InboxMessageItem = Message | OptimisticMessage;

/**
 * Deduplica mensagem otimista 1:1 via `metadata.client_temp_id` (persistido no INSERT).
 * Nunca apaga a bolha por timeout fixo: se falhar, marca `deliveryState = 'failed'`
 * para permitir retry manual sem perder o texto digitado.
 */
export function reconcileIncomingMessage(
  current: InboxMessageItem[],
  incoming: Message,
): InboxMessageItem[] {
  if (current.some((m) => m.id === incoming.id)) return current;
  const incomingTempId = (incoming.metadata as Record<string, unknown> | null)?.client_temp_id;

  const filtered = current.filter((m) => {
    if (!('_optimistic' in m)) return true;
    if (typeof incomingTempId === 'string' && m.clientTempId === incomingTempId) return false;
    return !(m.content === incoming.content && m.role === incoming.role);
  });

  return [...filtered, incoming].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
```

### 3.2 Invariante de Transição de Modo de Controle (`app/(app)/inbox/actions.ts`)

```typescript
export type LeadControlMode = 'autonomous' | 'shadow' | 'manual';

export interface LeadControlPatch {
  control_mode: LeadControlMode;
  is_paused: boolean;
  human_takeover_at: string | null;
  human_takeover_until: string | null;
  human_takeover_by: string | null;
}

export function buildControlModePatch(
  mode: LeadControlMode,
  userId: string,
  durationHours = 24,
): LeadControlPatch {
  if (mode === 'manual') {
    const now = new Date();
    return {
      control_mode: 'manual',
      is_paused: true,
      human_takeover_at: now.toISOString(),
      human_takeover_until: new Date(now.getTime() + durationHours * 3_600_000).toISOString(),
      human_takeover_by: userId,
    };
  }
  // Tanto 'autonomous' quanto 'shadow' DEVEM limpar qualquer takeover expirado ou ativo
  return {
    control_mode: mode,
    is_paused: false,
    human_takeover_at: null,
    human_takeover_until: null,
    human_takeover_by: null,
  };
}
```

### 3.3 Streaming Real por Aba em Settings (`app/(app)/settings/page.tsx`)

```typescript
export type SettingsTabId =
  | 'account'
  | 'rules'
  | 'services'
  | 'brain'
  | 'channels'
  | 'automation'
  | 'logs'
  | 'billing';

export interface SettingsShellLayoutProps {
  activeTab: SettingsTabId;
  children: React.ReactNode;
}
```

### 3.4 Primitiva Acessível `Dialog` (`components/ui/dialog.tsx`)

```typescript
export interface AccessibleDialogProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  variant?: 'modal' | 'drawer-right' | 'sheet-bottom';
  children: React.ReactNode;
}
```

---

## 4. Ordem Segura de Execução (Fases e Rollout)

1. **Fase 1 — Correções P0 de Fluxo Conversacional & Boundaries**
   - Atualizar `app/(app)/inbox/actions.ts` (`buildControlModePatch` limpando `human_takeover_until` em `shadow`; ativar/estender takeover em `sendNote` e `sendFileAttachment`; `client_temp_id` e `getSignedMediaUrl`).
   - Criar `app/(app)/error.tsx`, `app/admin/error.tsx`, `app/onboarding/error.tsx`, `app/(app)/settings/loading.tsx`, `app/(app)/notifications/loading.tsx`.
   - Corrigir `topbar.tsx` (`/settings?tab=automation`), `reports-client.tsx` (Plano Business + link `/planos`), `leads-client.tsx` (`toast.error` + `/inbox?leadId=`) e `next.config.ts` (`microphone=(self)`).
   - **Rollback:** Revert isolado sem impacto em schema ou APIs externas.

2. **Fase 2 — Streaming Real e Decomposição de `settings-shell.tsx` e `notifications`**
   - Extrair as abas de Settings para `app/(app)/settings/tabs/*` e carregar SDK Meta somente em `channels-tab.tsx`.
   - Refatorar `settings/page.tsx` e `notifications/page.tsx` movendo os `await` para Server Components filhos dentro de `<Suspense key={tab}>` real.
   - **Rollback:** Manter URLs `/settings?tab=<id>` 100% compatíveis.

3. **Fase 3 — Refatoração do Inbox & Resiliência Realtime**
   - Extrair `useInboxRealtime`, `useInboxActions`, `InboxLeadList`, `InboxChatHeader`, `InboxMessageStream` e `InboxComposer`.
   - Ativar backfill incremental em reconexão Realtime (`status === 'SUBSCRIBED'` após erro) e assinatura sob demanda de mídias novas.
   - **Rollback:** Toggle simples no `inbox/page.tsx` se necessário comparar regressão visual.

4. **Fase 4 — Decomposição dos Demais Monólitos, Agenda Atômica e Acessibilidade Mobile**
   - Modularizar `agenda-client.tsx`, `reports-client.tsx`, `leads-client.tsx`, `notifications-view.tsx`, `tenants-tab.tsx` e `debug-tab.tsx`.
   - Integrar `agenda/actions.ts` ao booking/reschedule atômico + `reminders`.
   - Adotar `Dialog` e `Tabs` acessíveis e unificar layout `100dvh` / `safe-area` entre `AppShell` e `MobileNav`.

---

## 5. Critérios de Validação e Aceite

- **Testes Unitários (Vitest — `pnpm test`):**
  - `app/(app)/inbox/__tests__/control-mode.test.ts`: validar `manual → shadow` limpando `human_takeover_until`, `is_paused = false`, garantindo que o engine gere rascunho na mensagem seguinte.
  - `app/(app)/inbox/__tests__/human-reply-takeover.test.ts`: validar que `sendNote` em lead `autonomous` ativa takeover por 24h e em lead já sob takeover renova o prazo.
  - `app/(app)/inbox/__tests__/optimistic-reconciliation.test.ts`: validar `reconcileIncomingMessage` com `client_temp_id`, ausência de duplicatas e manutenção de bolha em atraso `> 15s`.
  - `app/(app)/agenda/__tests__/manual-booking.test.ts`: validar bloqueio de sobreposição de horários e criação/atualização de `reminders`.
- **Auditoria de Modularidade & Build:**
  - Contagem de linhas confirmando `settings-shell.tsx < 220` linhas, `inbox-client.tsx < 250` linhas e todos os novos subcomponentes/hooks `< 300` linhas.
  - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` passando sem erros ou warnings bloqueantes.
- **Checklist Funcional e Responsivo (Manual / E2E):**
  - **Mobile (`375×812`):** verificar ausência de barra morta dupla acima do `MobileNav`, `safe-area` respeitada no Inbox/Settings, scroll horizontal suave nas abas sem cortar texto.
  - **Acessibilidade:** navegar pelas abas com setas, abrir/fechar modais de Lead/Agenda/Admin com `Escape` e verificar `role="dialog"` / `aria-modal="true"`.
  - **Fluxos Críticos:** clicar em `"Ver conversa no inbox"` no drawer de Leads abre o lead exato via `?leadId=`; troca de aba em `/settings` mostra skeleton imediato via `<Suspense>` (sem flash de array vazio); envio de imagem recebida via WhatsApp aparece no Inbox em tempo real sem F5.

---

## 6. Ajustes da Auditoria Cruzada

1. **Layout mobile unificado no `AppShell`:** usar `h-dvh md:h-screen` no container principal e aplicar padding inferior único (`pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0`) no wrapper de conteúdo do `<main>`, evitando duplo desconto com `MobileNav` e eliminando a faixa morta no rodapé mobile.
2. **Preservação do guard "send-then-persist" no Inbox:** manter o envio ao canal antes do `insert` em `sendNote` e `sendFileAttachment`, adicionando `client_temp_id` no `metadata` e acionando `activateTakeover` / `extendTakeoverOnHumanMessage` apenas após confirmação de envio.
