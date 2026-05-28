# 🔍 Visual Audit Prompt — Steel Precision Light (Phase 11 post-launch)

> Cole este prompt no início de uma nova sessão para iniciar a auditoria visual completa do dashboard.

---

## CONTEXTO

O Agendra acabou de concluir a **Phase 11 — Steel Precision Light Theme**: substituição completa do sistema de tokens dark (fundos `#09090B`, opacity soup `bg-white/[0.03]`) por um sistema light preciso. Todos os 13 arquivos do dashboard foram reescritos.

**Design system ativo:**
- Fundo de página: `#FAFAFA`
- Cards/modais: `bg-white` com `border-[#E4E4E7]` e `shadow-sm`
- Hover/raised: `bg-[#F4F4F5]`
- Texto primário: `#09090B`, secundário: `#3F3F46`, muted: `#71717A`, placeholder: `#A1A1AA`
- Brand blue: `#2563EB`, orange: `#F97316`, teal: `#14B8A6`
- Framer Motion em toda interação

**Referência autoritativa:** `obsidian/04 - DESIGN/design-system.md`

---

## MISSÃO

Você é um auditor de UI/UX senior com olho clínico para contraste, legibilidade e consistência visual. Sua missão é auditar **todo o dashboard** da Agendra pós-Phase 11 e identificar:

### 1. Tokens residuais dark
Varra todos os arquivos em `app/(app)/` e `components/app/` procurando:
- `bg-[#09090B]`, `bg-[#0f1015]`, `bg-[#0B1222]` → devem ser `bg-[#FAFAFA]` ou `bg-white`
- `bg-white/[0.0X]` qualquer opacity → substituir por sólido
- `border-white/[0.XX]` qualquer opacity → substituir por `border-[#E4E4E7]`
- `text-white/[0-95]` em contexto light → mapear para fg ramp
- `.glass` ou `.glass-strong` classe (exceto landing/auth/onboarding)
- `ShinyButton` import ou uso
- `shadow-glow-*` em contexto light (glows coloridos fora de landing)

**Arquivos a varrer:**
```
app/(app)/inbox/inbox-client.tsx
app/(app)/leads/leads-client.tsx
app/(app)/agenda/agenda-client.tsx
app/(app)/reports/reports-client.tsx
app/(app)/reports/components/RevenueChart.tsx
app/(app)/reports/components/ProviderHealthSection.tsx
app/(app)/settings/settings-shell.tsx
components/app/app-shell.tsx
components/app/sidebar.tsx
components/app/topbar.tsx
components/app/mobile-nav.tsx
components/app/notification-bell.tsx
components/ui/button.tsx
components/ui/badge.tsx
components/ui/chat-bubble.tsx
components/ui/empty-state.tsx
components/ui/glass.tsx
```

---

### 2. Problemas de contraste e legibilidade

Para cada arquivo, verifique:

- **Texto sobre fundo branco/#FAFAFA**: mínimo WCAG AA (4.5:1 para body, 3:1 para large text)
  - `#71717A` sobre `#FFFFFF` = 4.48:1 ✅ (borderline — não usar para body longo)
  - `#A1A1AA` sobre `#FFFFFF` = 2.85:1 ❌ — usar apenas para placeholders, NUNCA para texto lido
  - `#3F3F46` sobre `#FFFFFF` = 7.2:1 ✅
  - `#09090B` sobre `#FFFFFF` = 21:1 ✅

- **Labels de status/badge sobre fundo colorido**: verificar legibilidade de cada badge:
  - Sucesso: `#166534` sobre `#F0FDF4` = alto contraste ✅
  - Erro: `#DC2626` sobre `#FFF1F2` = verificar
  - Info: `#1D4ED8` sobre `#EFF6FF` = verificar
  - Teal/AI: `#0D9488` sobre `#F0FDFA` = verificar

- **Hierarquia visual**: Identifique onde a hierarquia de informação está fraca — casos onde título e subtítulo têm contraste insuficiente entre si (ex: ambos usando `text-[#3F3F46]`).

---

### 3. Consistência de espaçamento e layout

- Cards que misturam `p-4`, `p-5`, `p-6` sem sistema claro → padronizar
- Gaps inconsistentes em grids: `gap-3` vs `gap-4` vs `gap-6` no mesmo contexto
- Seções sem separação clara (falta de divisor `border-t border-[#E4E4E7]` ou espaço)
- Títulos de seção sem `mb-4` / `mb-6` consistente
- Botões de ação misturando tamanhos (`h-8`, `h-9`, `h-10`, `h-11`) sem justificativa

---

### 4. Melhorias visuais (oportunidades, não bugs)

Para cada rota, sugira até 3 melhorias concretas que fariam a UI "wow":

**Inbox `/inbox`:**
- Estado vazio: é visual o suficiente? Tem ícone + CTA claro?
- Bubbles de chat: o contraste do timestamp está OK?
- Sidebar de contatos: separação entre items clara?

**Leads `/leads`:**
- Tabela: linhas muito densas ou muita respiração?
- Status badges: todos têm a mesma altura/padding?
- Drawer de lead: hierarquia de informação clara?
- Filtros ativos: indicação visual de filtro aplicado?

**Agenda `/agenda`:**
- Calendário: dia atual destacado o suficiente vs dia selecionado?
- Eventos: quando há 3+ eventos num dia, o overflow é tratado?
- Time labels teal: o contraste `#14B8A6` sobre `#FFFFFF` é suficiente? (2.7:1 — pode ser problema)

**Reports `/reports`:**
- KPI cards: delta badges legíveis nos dois estados (positivo/negativo)?
- Revenue chart: eixos Y/X legíveis? Labels sobrepostos?
- ROI Hero gradient: o texto sobre o gradiente tem contraste garantido?
- Heatmap: células vazias vs peak — diferença visual clara o suficiente?

**Settings `/settings`:**
- Seções longas: navegação interna (âncoras/tabs) clara?
- Form labels: todos alinhados e com espaçamento consistente?
- Save button: visível ao final de formulários longos (sticky bottom)?

---

### 5. Análise de `globals.css` pós-Phase 11

Verifique o arquivo `app/globals.css`:
- Algum `.glass`, `.glass-strong` ainda está definido? Se sim, remover ou limitar ao escopo `(landing)`.
- `shiny-btn` / `shiny-cta` — ainda necessário? Ou pode ser removido se só landing usa?
- Variáveis `--color-*` obsoletas (ex: `--color-graphite`) — documentar se ainda usadas.
- `@layer base` — verificar se `html, body` usa os tokens corretos de light theme.

---

### 6. Acessibilidade rápida

- Inputs: todos têm `placeholder` com cor `#A1A1AA` (não mais escuro)? Não usar `placeholder-[#09090B]`.
- Focus rings: todos inputs/buttons têm `focus:ring-2 focus:ring-[#2563EB]/20` ou equivalente?
- Aria labels: botões icon-only (`<Bell>`, `<X>`, `<Search>`) têm `aria-label`?
- Cores não podem ser o único indicador de estado (ex: erro vermelho sem ícone ou texto).

---

## OUTPUT ESPERADO

Para cada issue encontrado, reportar no formato:

```
arquivo:linha — SEVERITY — descrição do problema — fix recomendado
```

Severidades:
- 🔴 CRÍTICO — contraste abaixo de WCAG AA, token dark residual visível, quebra funcional
- 🟠 ALTO — inconsistência que gera sensação de "bagunça" visual
- 🟡 MÉDIO — melhoria de hierarquia ou espaçamento que elevaria qualidade
- 🟢 BAIXO — oportunidade de polish opcional

Ao final, gerar um resumo:
- Total por severidade
- Top 3 prioridades para próxima sessão
- Arquivos mais problemáticos (ranking)

---

## ESCOPO EXCLUÍDO (não tocar)

- `app/page.tsx`
- `components/landing/`
- `app/(auth)/`
- `app/onboarding/`

---

**Referências:**
- Design system: `obsidian/04 - DESIGN/design-system.md`
- Token source: `app/globals.css` `@theme {}`
- Phase 11 session log: `obsidian/05 - LOGS/sessions/2026-05-28-steel-precision-light-theme.md`
