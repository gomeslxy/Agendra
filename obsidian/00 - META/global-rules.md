# 🌍 Agendra Global Rules & Governance

These rules apply to ALL agents (Claude, Antigravity, Cursor, Gemini) working on the Agendra project.

## 🏁 MANDATORY STARTUP (EVERY SESSION)
1. **Sync with Truth**: At the start of every task, you MUST list `obsidian/` and read relevant context.
2. **Definitive Files**:
    - `obsidian/01 - PRODUTO/roadmap.md` (Current state & progress).
    - `obsidian/02 - ARQUITETURA/` (Technical patterns).
    - `obsidian/05 - LOGS/sessions.md` (Latest session context).
3. **Operational Protocol**: Read `CLAUDE.md` or `ANTIGRAVITY.md` for agent-specific commands.

## 🚀 PROJECT OPERATING RULES (The 12 Rules) 🛡️

Priority order: 1. Correctness | 2. Safety | 3. Minimal change | 4. Codebase conventions | 5. Speed

1. **Act with reasonable assumptions**: Do not block on minor ambiguity. State assumptions and continue.
2. **Keep the solution simple**: Smallest change, direct code, no premature abstraction.
3. **Change only what is needed**: Touch minimum surface area. No unrelated formatting.
4. **Read the relevant context first**: Inspect callers, shared utilities, and config BEFORE editing.
5. **Verify important changes**: Add/update tests, run checks, verify RLS.
6. **Avoid endless rethinking**: Make a choice, verify, move on.
7. **Surface conflicts clearly**: Choose the better pattern and state why.
8. **Match the codebase**: Follow existing style, naming, and structure.
9. **Fail loudly**: Do not hide uncertainty. If something isn't verified, say it.
10. **Keep progress visible**: Report what changed, what was verified, and what remains.
11. **Prefer reversible work**: Keep changes incremental and easy to roll back.
12. **Preserve diagnosability**: Prefer useful errors and logs.

## 📅 COMPLETION PROTOCOL (EVERY TASK)
After completing a task, you MUST update:
- `obsidian/01 - PRODUTO/roadmap.md` (Mark as done/update status).
- `obsidian/06 - BACKLOG/backlog.md` (Add technical debt or next steps).
- `obsidian/05 - LOGS/sessions.md` (Summarize what was done).

## 💎 Liquid Glass Design System
- **Philosophy**: Premium, transparent, animated, responsive.
- **Glass utility**: Use `.glass` for all containers.
- **Motion**: Every interaction must have a `framer-motion` effect.
- **Reference**: `obsidian/04 - DESIGN/design-system.md`.

## 🔒 Security & Multitenancy
- **Rule**: Every database query MUST filter by `company_id`.
- **Privacy**: Never expose internal IDs or sensitive metadata in logs.

## ✨ Kaizen Protocol (Auto-Improvement)
- **Self-Refining Docs**: If you find an outdated instruction or a missing pattern while working, you ARE AUTHORIZED to update the Obsidian vault immediately. Don't wait for permission to keep the "Truth" updated.
- **Code Health**: After every task, spend 30 seconds scanning for one "Quick Win" improvement (refactor, comment, or performance) in the files you touched.
- **Feedback Loop**: If a rule (1-12) causes friction or is unclear, propose an amendment to `global-rules.md`.

---
[[obsidian-skills|🎓 Como usar o Obsidian]] | [[superpowers|⚡ Agent Superpowers]] | [[obsidian-mastery|🎓 Mastery Skills]]
