# 🛡️ CLAUDE.md — Agendra Operating System

These rules are MANDATORY for every task in Agendra. They ensure architectural integrity, design excellence, and synchronization with the "Obsidian Truth".

## 🏁 MANDATORY STARTUP (EVERY SESSION)
Before taking any action, you MUST:
1. **Search & Read**: List the `obsidian/` folder and read relevant files (Roadmap, Architecture, Design).
2. **Context**: Read `obsidian/04 - LOGS/sessions.md` for the latest session summary.
3. **Rules**: Review the operational protocols in `ANTIGRAVITY.md` and `CLAUDE.md`.

## 🦸 Agent Skills (Activated)
- **Primary Skill**: [Stitch Loop](file:///C:/Users/lucas/.agents/skills/stitch-loop/SKILL.md) (Task Automation & Agentic Loops).
- **UI Skill**: [Shadcn UI](file:///C:/Users/lucas/.agents/skills/shadcn-ui/SKILL.md) (Standardized Components).
- **Internal Skill**: [API Patterns](file:///c:/antigravity%20projetos/Agendra/obsidian/02%20-%20ARQUITETURA/padroes-api.md) (Safety & Multitenancy).

## 🚀 Core Principles
1. **Global Rules**: Follow [[obsidian/00 - META/global-rules.md|Global Rules & Governance]] as the primary directive.
2. **Correctness & Safety First**: Never compromise on multitenancy (`company_id`) or data integrity.
3. **Obsidian-First**: The `obsidian/` folder is the DEFINITIVE source of truth. Read it before coding. Update it after coding.
4. **Liquid Glass Aesthetic**: Every UI change MUST follow the premium "Liquid Glass" design system (tokens in `globals.css`).
5. **Minimal Surface Area**: Change only what is needed. Simple > Clever.

---

## 🛠️ Tech Stack (Non-Negotiable)
- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript (Strict).
- **Styling**: TailwindCSS v4 + Framer Motion 12 (Fluid & Elegant).
- **Backend**: Supabase (Postgres, Auth, Realtime).
- **IA**: Gemini 2.0 Flash (Loop Agêntico). Veja [obsidian/02 - ARQUITETURA/stack-tecnica.md](./obsidian/02%20-%20ARQUITETURA/stack-tecnica.md) para detalhes.
- **Integrations**: WhatsApp Cloud API, Google Calendar, Stripe.

---

## 🛡️ Project Governance (The 12 Rules)

### 1 — Act with reasonable assumptions
Do not block on minor ambiguity. State assumptions briefly and continue. Ask only if it changes architecture or safety.

### 2 — Keep the solution simple
Use the smallest change. No premature abstractions. Prefer direct code.

### 3 — Change only what is needed
Touch the minimum surface area. Do not rewrite unrelated code or formatting.

### 4 — Read the relevant context first
Inspect callers, exports, utilities, and config. Check `package.json` and project structure.

### 5 — Verify important changes
Update tests when practical. Run relevant checks before finishing.

### 6 — Avoid endless rethinking
Make the best choice, verify, and move on. Do not loop on the same uncertainty.

### 7 — Surface conflicts clearly
Choose the better-tested/recent pattern. State why. Do not compromise quality.

### 8 — Match the codebase
Follow existing style, naming, and structure. Mention harmful conventions instead of silently changing them.

### 9 — Fail loudly
Do not claim success if work was skipped or tests weren't run. Say what remains unverified.

### 10 — Keep progress visible
Report: what changed, what was verified, what remains.

### 11 — Prefer reversible work
Keep changes incremental and easy to roll back. Avoid destructive operations.

### 12 — Preserve diagnosability
Prefer clear errors and logs. Do not remove useful context.

---

## 📅 Synchronization & Documentation
Whenever you complete a task:
1. **Sync Obsidian**:
   - Update `obsidian/01 - PRODUTO/roadmap.md`.
   - Log decisions in `obsidian/02 - ARQUITETURA/`.
   - Add technical debt to `obsidian/05 - BACKLOG/backlog.md`.
2. **Multitenancy**: Always enforce `company_id` filters in Supabase queries.
3. **Motion**: Ensure all decorative animations respect `prefers-reduced-motion`.

---

## 🎨 Design Guidelines (Liquid Glass)
- **Tokens**: Use `globals.css` vars. Palette: Graphite, Blue-core, Teal-flow, Orange-spark.
- **Glass**: Always use the `.glass` utility for cards and containers.
- **Typography**: Inter Tight for headings, Inter Italic VF for `<em>`.
- **Motion**: Use `components/motion/` variants (`fadeUp`, `stagger`, `spring`).

---

## 🗺️ Documentation Map (Obsidian Vault)
Use these files to understand the project's soul and structure:
- **Product Vision**: [obsidian/01 - PRODUTO/visao-geral.md](./obsidian/01%20-%20PRODUTO/visao-geral.md)
- **Technical Stack**: [obsidian/02 - ARQUITETURA/stack-tecnica.md](./obsidian/02%20-%20ARQUITETURA/stack-tecnica.md)
- **Roadmap**: [obsidian/01 - PRODUTO/roadmap.md](./obsidian/01%20-%20PRODUTO/roadmap.md)
- **Design System**: [obsidian/03 - DESIGN/design-system.md](./obsidian/03%20-%20DESIGN/design-system.md)
- **Session Logs**: [obsidian/04 - LOGS/sessions.md](./obsidian/04%20-%20LOGS/sessions.md)
- **Backlog**: [obsidian/05 - BACKLOG/backlog.md](./obsidian/05%20-%20BACKLOG/backlog.md)

**DO NOT proceed with major code changes without confirming the current state in Obsidian.**
