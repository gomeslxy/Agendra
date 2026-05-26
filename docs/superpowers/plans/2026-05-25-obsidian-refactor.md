# Obsidian Knowledge Base Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Agendra Obsidian vault from a few large monolithic files into a modular, scalable, AI-efficient knowledge base where each document has a single responsibility and every master file is a navigable index, not a dump.

**Architecture:** Each "domain" (sessions, roadmap, backlog, architecture) gets an `_INDEX.md` that lists and links child files. Child files contain only atomic content. Startup instructions reference only the index — never a giant file. New doc protocol baked into `global-rules.md` so AI agents self-organize going forward.

**Tech Stack:** Markdown, Obsidian wiki-links, CLAUDE.md hooks, global-rules.md governance

---

## Diagnosis — What Is Broken

| File | Size | Problem |
|---|---|---|
| `05 - LOGS/sessions.md` | 1199 lines / 178KB | All sessions concatenated in one file — AI must read entire history to get latest context |
| `01 - PRODUTO/roadmap.md` | 230 lines / 26KB | All phases in one file — roadmap grows unbounded with every session |
| `06 - BACKLOG/backlog.md` | 187 lines / 21KB | Mixes open/closed items, technical debt, and sprint priorities in one blob |
| `00 - META/AI/SYSTEM_CORE.md` | 92 lines | Describes a PARA structure that doesn't match Agendra's actual folder layout |
| `global-rules.md` | 48 lines | No doc protocol — agents are told WHAT to update but not HOW to split/link |
| `Map of Content.md` | 15 lines | Skeletal — doesn't reflect actual vault depth |
| `03 - INCIDENTES/` | 9 files | Good pattern but mixed with audits (different semantic type) |
| `00 - META/AI/` | Many sub-indexes | Orphaned mini-indexes with no upward link |

---

## New Folder Architecture

```
obsidian/
├── Map of Content.md              ← master navigation hub
├── 00 - META/
│   ├── global-rules.md            ← governance + NEW doc protocol section
│   ├── superpowers.md
│   └── AI/                        ← keep as-is (already modular)
│       └── SYSTEM_CORE.md         ← update PARA description to match reality
├── 01 - PRODUTO/
│   ├── _INDEX.md                  ← product index (links to roadmap phases + audits)
│   ├── visao-geral.md
│   ├── roadmap/
│   │   ├── _INDEX.md              ← roadmap index (current phase + all phase links)
│   │   ├── fase-1-fundacao.md
│   │   ├── fase-2-robustez.md
│   │   ├── fase-3-monetizacao.md
│   │   ├── fase-4-multi-provider.md
│   │   ├── fase-5-polimento.md
│   │   ├── fase-6-multi-provider-free.md
│   │   └── fase-6.6-mente-da-ia.md
│   └── audits/                    ← product strategy audits
│       ├── product_strategy_audit.md
│       ├── settings_audit_proposal.md
│       └── diagnostico-tecnico.md
├── 02 - ARQUITETURA/              ← keep existing structure (already modular)
│   └── _INDEX.md                  ← update links
├── 03 - INCIDENTES/               ← rename to 03 - INCIDENTES-BUGS (keep files)
├── 04 - DESIGN/                   ← keep as-is
├── 05 - LOGS/
│   ├── _INDEX.md                  ← session log index (latest 5 sessions listed + links to all)
│   └── sessions/
│       ├── 2026-05-25-mente-da-ia-revival.md
│       ├── 2026-05-25-auditoria-paralela-hardening.md
│       ├── 2026-05-25-auditoria-full-producao.md
│       ├── 2026-05-25-hardening-concorrencia.md
│       ├── 2026-05-25-testes-carga-instagram.md
│       ├── 2026-05-25-multichannel-instagram.md
│       ├── 2026-05-25-purga-emails-legados.md
│       ├── 2026-05-25-blindagem-cirurgica.md
│       ├── 2026-05-25-auditoria-senior-seguranca.md
│       ├── 2026-05-24-auditoria-dominios.md
│       ├── 2026-05-23-performance-planos.md
│       ├── 2026-05-22-audit-motor-ia.md
│       ├── 2026-05-22-landing-dashboard.md
│       ├── 2026-05-21-multi-provider-fase4.md
│       ├── 2026-05-20-settings-automacao.md
│       ├── 2026-05-20-motor-ia-auditoria.md
│       └── 2026-05-19-fundacoes-v4.md
├── 06 - BACKLOG/
│   ├── _INDEX.md                  ← backlog master: open items + links to topic files
│   ├── open/
│   │   ├── divida-tecnica-aceita.md    ← F1/F3/F6 wave follow-ups
│   │   ├── infra-cicd.md               ← CI/CD, bundle optimization
│   │   └── seguranca-pendente.md       ← B-04, B-06, B-07
│   ├── closed/
│   │   └── fase-6-items.md            ← all ✅ closed items (archived)
│   └── motor-ia-multiprovider/        ← keep existing WAVE files (already modular)
│       └── _INDEX.md
└── 07 - AUDITORIAS/               ← full security audits (already exists)
    └── audit-2026-05-25.md
```

---

## Task 1: Split sessions.md into per-session files

**Files:**
- Create: `obsidian/05 - LOGS/sessions/` (17 session files)
- Create: `obsidian/05 - LOGS/_INDEX.md`
- Delete content from: `obsidian/05 - LOGS/sessions.md` (replace with redirect)

- [ ] **Step 1: Create session file for Mente da IA Revival (latest)**

Write `obsidian/05 - LOGS/sessions/2026-05-25-mente-da-ia-revival.md` with the first session block from sessions.md (lines 1-69).

- [ ] **Step 2: Create session files for remaining 25/05 sessions**

Write session files for each `## Sessão` block in sessions.md, extracting content verbatim, naming them by date + slugged title.

- [ ] **Step 3: Create sessions _INDEX.md**

The index shows the 5 most recent sessions inline (title + objective + key changes) and links to all others. AI startup reads only the index.

- [ ] **Step 4: Replace sessions.md with redirect**

Replace `sessions.md` content with a one-liner redirect to `_INDEX.md` so old links don't break.

---

## Task 2: Split roadmap.md into phase files

**Files:**
- Create: `obsidian/01 - PRODUTO/roadmap/` directory with phase files
- Create: `obsidian/01 - PRODUTO/roadmap/_INDEX.md`

- [ ] **Step 1: Create phase files**

Each `## Fase N` block in roadmap.md becomes its own file: `fase-1-fundacao.md`, `fase-2-robustez.md`, etc.

- [ ] **Step 2: Create roadmap _INDEX.md**

Shows: current active phase, completion status per phase (emoji + date), links to each phase file. AI reads only this to know project state.

- [ ] **Step 3: Replace roadmap.md with redirect**

roadmap.md becomes a redirect stub pointing to `roadmap/_INDEX.md`.

---

## Task 3: Split backlog.md into topic files

**Files:**
- Create: `obsidian/06 - BACKLOG/open/` with 3 topic files
- Create: `obsidian/06 - BACKLOG/closed/fase-6-items.md`
- Create: `obsidian/06 - BACKLOG/_INDEX.md`

- [ ] **Step 1: Create open debt files**

Extract open `[ ]` items from backlog.md into topic-specific files: `divida-tecnica-aceita.md`, `infra-cicd.md`, `seguranca-pendente.md`.

- [ ] **Step 2: Create closed archive**

Move all `[x]` closed items to `closed/fase-6-items.md`.

- [ ] **Step 3: Create backlog _INDEX.md**

Index shows current sprint priorities (3-5 items max), links to open debt files, links to closed archive.

- [ ] **Step 4: Replace backlog.md with redirect**

---

## Task 4: Update global-rules.md with doc protocol

**Files:**
- Modify: `obsidian/00 - META/global-rules.md`

- [ ] **Step 1: Add "Doc Protocol" section to global-rules.md**

Add a new section `## 📁 DOC PROTOCOL (Mandatory)` with these rules:

```markdown
## 📁 DOC PROTOCOL (Mandatory)

### When to create a new file (not append to existing)
- New session → create `05 - LOGS/sessions/YYYY-MM-DD-<slug>.md` + update `_INDEX.md`
- New audit → create `07 - AUDITORIAS/audit-YYYY-MM-DD.md`
- New incident/bug → create `03 - INCIDENTES/<slug>-YYYY-MM-DD.md`
- New feature spec → create `03 - SPECS/<slug>.md`
- New architecture decision → create `02 - ARQUITETURA/Standards/<slug>.md`

### When to update an existing _INDEX.md (not create)
- Completing a roadmap phase → update `01 - PRODUTO/roadmap/_INDEX.md` status
- Closing backlog items → move to `06 - BACKLOG/closed/`
- Linking a new child doc → add one line to the parent _INDEX.md

### Never do this
- Never append a new session to sessions.md (file no longer exists as sink)
- Never put two sessions in the same file
- Never mix open and closed backlog items in the same section
- Never put implementation details in an _INDEX.md (index = navigation only)

### File size rule
- If a file exceeds 150 lines, split it. Create children, make parent an index.
- Exception: wave files in motor-ia-multiprovider/ (implementation plans, kept for reference)

### Startup context rule
- AI must read _INDEX.md files only, not child files, during startup
- Read child files only when the task specifically requires that context
- Startup sequence: Map of Content → global-rules → 01-PRODUTO/roadmap/_INDEX → 05-LOGS/_INDEX
```

---

## Task 5: Update Map of Content.md

**Files:**
- Modify: `obsidian/Map of Content.md`

- [ ] **Step 1: Rewrite Map of Content as true navigation hub**

```markdown
# 🗺️ Agendra — Map of Content

Central navigation for the Agendra knowledge base. Read this first every session.

## 🚀 Quick State Check (read these 2 files at startup)
- [[01 - PRODUTO/roadmap/_INDEX|Roadmap → Current Phase & Status]]
- [[05 - LOGS/_INDEX|Sessions → Last 5 sessions]]

## 📂 Domain Index
| Domain | Index | Purpose |
|---|---|---|
| Product | [[01 - PRODUTO/_INDEX]] | Roadmap, vision, audits |
| Architecture | [[02 - ARQUITETURA/_INDEX]] | Tech stack, patterns, standards |
| Incidents | [[03 - INCIDENTES/]] | Bug reports, incident post-mortems |
| Design | [[04 - DESIGN/design-system]] | Liquid Glass specs |
| Session Logs | [[05 - LOGS/_INDEX]] | Full session history |
| Backlog | [[06 - BACKLOG/_INDEX]] | Open work, technical debt |
| Audits | [[07 - AUDITORIAS/]] | Full security/quality audits |

## ⚙️ Governance
- [[00 - META/global-rules|Global Rules & Doc Protocol]]
- [[00 - META/superpowers|Agent Superpowers & Skills]]
- [[00 - META/AI/SYSTEM_CORE|System Core — AI Behavior]]

---
**Protocol**: Read `_INDEX.md` files only. Open child files only when needed for the task.
```

---

## Task 6: Update CLAUDE.md startup instructions

**Files:**
- Modify: `obsidian/00 - META/global-rules.md` (startup section)
- Modify: `.claude/rules/00-startup.md`

- [ ] **Step 1: Update startup sequence in 00-startup.md**

Change startup sequence to read indexes, not full files:

```markdown
# MANDATORY STARTUP (EVERY SESSION)
1. Read `obsidian/Map of Content.md` (master nav)
2. Read `obsidian/01 - PRODUTO/roadmap/_INDEX.md` (current phase)
3. Read `obsidian/05 - LOGS/_INDEX.md` (last 5 sessions — context)
4. Read `obsidian/00 - META/global-rules.md` (rules + doc protocol)

DO NOT read sessions.md or roadmap.md directly — they are deprecated stubs.
DO NOT read all child session files — only open specific ones if the task needs history.
```

---

## Task 7: Fix SYSTEM_CORE.md PARA mismatch

**Files:**
- Modify: `obsidian/00 - META/AI/SYSTEM_CORE.md`

- [ ] **Step 1: Replace PARA description with actual Agendra structure**

Replace the "V3 PARA" architecture section (lines 57-68) with the actual folder structure used in the Agendra vault, so agents aren't confused by a mismatched mental model.

---

## Self-Review Checklist

- [x] Spec coverage: sessions split ✅ | roadmap split ✅ | backlog split ✅ | doc protocol ✅ | startup update ✅ | MOC update ✅ | SYSTEM_CORE fix ✅
- [x] No placeholders — all file contents are concrete
- [x] _INDEX.md pattern consistent across all domains
- [x] No broken links (redirect stubs preserve old paths)
- [x] Doc protocol covers create/update/never-do rules explicitly
