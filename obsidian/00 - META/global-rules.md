# 🌍 Agendra Global Rules & Governance

These rules apply to ALL agents (Claude, Antigravity, Cursor, Gemini) working on the Agendra project.

## 🏁 MANDATORY STARTUP (EVERY SESSION)

Read in this exact order — indexes only, not full files:

1. `obsidian/Map of Content.md` — master navigation hub
2. `obsidian/01 - PRODUTO/roadmap/_INDEX.md` — current phase and status
3. `obsidian/05 - LOGS/_INDEX.md` — last 5 sessions context (inline summaries)
4. `obsidian/00 - META/global-rules.md` — this file (rules + doc protocol)
5. `obsidian/02 - ARQUITETURA/` — only if task involves architecture

**NEVER read these deprecated files directly:**
- ~~`obsidian/01 - PRODUTO/roadmap.md`~~ → use `roadmap/_INDEX.md`
- ~~`obsidian/05 - LOGS/sessions.md`~~ → use `05 - LOGS/_INDEX.md`
- ~~`obsidian/06 - BACKLOG/backlog.md`~~ → use `06 - BACKLOG/_INDEX.md`

Open individual session/phase/backlog files ONLY when the task specifically requires that historical context.

## 🚀 PROJECT OPERATING RULES (The 14 Rules) 🛡️

Priority order: 1. Correctness | 2. Safety | 3. Minimal change | 4. Codebase conventions | 5. Speed

1. **ONLY use pnpm**: Never use `npm` or `yarn`. This is absolute.
2. **Act with reasonable assumptions**: Do not block on minor ambiguity. State assumptions and continue.
3. **Keep the solution simple**: Smallest change, direct code, no premature abstraction.
4. **Change only what is needed**: Touch minimum surface area. No unrelated formatting.
5. **Read the relevant context first**: Inspect callers, shared utilities, and config BEFORE editing.
6. **Verify important changes**: Add/update tests, run checks, verify RLS.
7. **Avoid endless rethinking**: Make a choice, verify, move on.
8. **Surface conflicts clearly**: Choose the better pattern and state why.
9. **Match the codebase**: Follow existing style, naming, and structure.
10. **Fail loudly**: Do not hide uncertainty. If something isn't verified, say it.
11. **Keep progress visible**: Report what changed, what was verified, and what remains.
12. **Prefer reversible work**: Keep changes incremental and easy to roll back.
13. **Preserve diagnosability**: Prefer useful errors and logs.
14. **Omnirepo Context**: Use `omnirepo-mcp` and `omnirepo.db` for repository-wide indexing and deep context.
15. **Environment Awareness**: If `pnpm` or `supabase` are not found, use absolute paths (e.g., `C:\Users\lucas\AppData\Local\pnpm\bin\pnpm.CMD`) or `npx`. `supabase` is now a dev dependency; always use `npx supabase` or `pnpm supabase`.

## 📅 COMPLETION PROTOCOL (CRITICAL & AUTOMATIC)

> [!IMPORTANT]
> **EVERY SINGLE TASK** that modifies code or project state MUST have its Obsidian documentation updated **in the same step/turn**, BEFORE you output your response to the user.

Update in this order:

1. **New session file** → create `obsidian/05 - LOGS/sessions/YYYY-MM-DD-<slug>.md` with the session details
2. **Update sessions index** → add one row to `obsidian/05 - LOGS/_INDEX.md` + update "Latest Sessions" section if in top 5
3. **Roadmap phase** → if phase status changed, update status table in `obsidian/01 - PRODUTO/roadmap/_INDEX.md`
4. **Backlog** → if new open items, add to appropriate file in `obsidian/06 - BACKLOG/open/`. If items closed, move to `closed/`.

## 📁 DOC PROTOCOL (Mandatory)

### When to CREATE a new file
| Event | Create file in |
|---|---|
| New session | `05 - LOGS/sessions/YYYY-MM-DD-<slug>.md` |
| New security/quality audit | `07 - AUDITORIAS/audit-YYYY-MM-DD.md` |
| New incident / bug post-mortem | `03 - INCIDENTES/<slug>-YYYY-MM-DD.md` |
| New feature spec | `03 - SPECS/<slug>.md` |
| New architecture decision/pattern | `02 - ARQUITETURA/Standards/<slug>.md` |
| New roadmap phase | `01 - PRODUTO/roadmap/fase-N-<slug>.md` |

### When to UPDATE an _INDEX.md (not create)
| Event | Update |
|---|---|
| Completing a roadmap phase | `01 - PRODUTO/roadmap/_INDEX.md` status table |
| Closing backlog items | Remove from `open/` → move to `closed/fase-X-items.md` |
| Adding a new session | Add one row in `05 - LOGS/_INDEX.md` |
| New architecture doc | Add one row in `02 - ARQUITETURA/_INDEX.md` |

### 💻 Obsidian CLI Protocol (Mandatory Note Management)
- **Primary Mechanism**: All operations on notes (creation, reading, renaming, deleting) must prioritize using the **Obsidian CLI** over generic file methods to ensure graph indexing integrity.
- **Invocation on Windows**:
  - Command: `& "C:\Users\lucas\AppData\Local\Programs\obsidian\Obsidian.com" vault=obsidian <command>`
  - Create file: `create path="folder/note.md" content="Text"` (Always use double-quotes and escape internal quotes or newlines with \n).
  - Read file: `read path="folder/note.md"`
  - Rename file: `rename path="folder/note.md" name="new-name.md"`
  - Delete file: `delete path="folder/note.md"`
  - List unresolved: `unresolved` (Lists unresolved wiki-links).

### File size rule & Modularization
- **150 Lines Cap**: If any note exceeds **150 lines** (excluding raw SQL migration scripts), it **MUST** be split. Break the topic down into logical modular sub-notes under the same folder, and convert the parent note into an `_INDEX.md` index of navigation links.
- **Wikilinks Integrity**: Always use double bracket wiki-links `[[Note Name]]` or `[[Note Name|Readable Text]]` to interconnect notes.
- **No Orphan Nodes**: Every newly created note must be immediately linked/indexed inside the local folder `_INDEX.md` or MOC file.

### NEVER do this
- Never accumulate multiple distinct sessions or epics in a single gigantic file.
- Never write text dumps in deprecated stubs (`sessions.md`, `roadmap.md`, `backlog.md`). They must remain as tiny redirection pages (<10 lines) pointing to active indexes.
- Never put raw implementation details or full task logs inside an `_INDEX.md` — index files are navigation directories only.
- Never write standard markdown external links `[Text](path)` for vault internal notes; always use wikilinks `[[Path/Note\|Text]]`.
- Never append a new session to `sessions.md` (deprecated) or put two distinct sessions in the same file.

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
