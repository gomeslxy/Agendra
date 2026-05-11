# 🌍 Agendra Global Rules & Governance

These rules apply to ALL agents (Claude, Antigravity, Gemini) working on the Agendra project. They override any individual agent settings.

## 1. The Obsidian Truth 📖
- **Mandatory Read**: At the start of every task, you MUST list `obsidian/` and read relevant context.
- **Mandatory Write**: After every task, you MUST update:
    - `obsidian/01 - PRODUTO/roadmap.md` (Progress status).
    - `obsidian/05 - BACKLOG/backlog.md` (Technical debt or new tasks).
    - `obsidian/04 - LOGS/sessions.md` (Log your actions).
- **Architecture Integrity**: Check `obsidian/02 - ARQUITETURA/padroes-api.md` before touching the backend.

## 2. Multi-tenant Safety 🛡️
- **Rule**: Every query to the database MUST include a `company_id` filter.
- **Exception**: Only if explicitly requested for cross-tenant admin tools (rare).
- **Security**: Never expose Supabase service roles or sensitive keys in client-side code.

## 3. Liquid Glass Design System 💎
- **Class**: Always use `.glass` for containers, cards, and interactive elements.
- **Tokens**: Use CSS variables from `globals.css`.
- **Motion**: Every interactive element MUST have a Framer Motion animation (`initial`, `animate`, `whileHover`).
- **Standard**: Follow `obsidian/03 - DESIGN/design-system.md`.

## 4. Communication & Progress 📡
- **Transparency**: Report what was changed, what was verified, and what remains.
- **Fail Loudly**: If a task could not be fully completed or verified, state it clearly.
- **Assume Reasonably**: Don't block on small details; state your assumption and proceed.

## 5. Technical Excellence 🚀
- **Strict Typing**: No `any`. Use interfaces and types for everything.
- **Minimal Surface**: Only change the files necessary for the task.
- **Standard Stack**: Next.js 15, Tailwind v4, Supabase, Framer Motion 12.

---
[[superpowers|⬅️ Voltar para Superpowers]]
