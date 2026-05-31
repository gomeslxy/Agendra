# 🧹 Agendra Repository Cleanup — Step-by-Step Guide

**⚠️ IMPORTANTE:** Leia o AUDIT_REPORT.md ANTES de executar estes comandos.

---

## ✅ PRÉ-REQUISITOS

```bash
# 1. Você está na branch main?
git branch

# 2. Working directory limpo?
git status

# 3. Backup remoto atualizado?
git log --oneline origin/main | head -3
```

---

## 🚀 EXECUÇÃO

### PASSO 1: Backup Local (SEGURANÇA)

Antes de qualquer coisa:

```powershell
cd "C:\antigravity projetos\Agendra"

# Criar bundle (backup completo do repo, inclusive histórico)
git bundle create agendra-backup-$(Get-Date -Format 'yyyyMMdd').bundle --all

# Verificar que criou
ls -lh agendra-backup-*.bundle
```

Se algo der errado depois, pode restaurar com:
```powershell
git fetch agendra-backup-YYYYMMDD.bundle refs/heads/*:refs/remotes/backup/*
```

---

### PASSO 2: Validar Arquivos a Serem Removidos

Listar exatamente o que será removido:

```powershell
Write-Host "=== Arquivos a REMOVER do git ===" -ForegroundColor Red

git ls-files | Select-String -Pattern "^\.clauderules$|^\.cursorrules$|^\.superpowers|^scratch/|^supabase/(schema_v|fix_rls)" | ForEach-Object { Write-Host "  $($_)" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== Verificar que estes arquivos EXISTEM localmente ===" -ForegroundColor Green

# Devem existir (não serão deletados, apenas 'unstaged')
Test-Path ".clauderules", ".cursorrules", ".superpowers", "scratch" | ForEach-Object {
  if ($_) { Write-Host "  ✅ Found" } else { Write-Host "  ❌ Not found" }
}
```

---

### PASSO 3: Remove Files from Git (Keep Local)

Execute estes comandos **na ordem exata**:

```powershell
cd "C:\antigravity projetos\Agendra"

# Remove agent rules files
Write-Host "Removing .clauderules and .cursorrules..." -ForegroundColor Cyan
git rm --cached .clauderules .cursorrules

# Remove brainstorm cache
Write-Host "Removing .superpowers/brainstorm..." -ForegroundColor Cyan
git rm --cached -r ".superpowers/brainstorm"

# Remove debug scripts
Write-Host "Removing scratch scripts..." -ForegroundColor Cyan
git rm --cached scratch/*.js scratch/*.ts

# Remove schema backups
Write-Host "Removing schema backups..." -ForegroundColor Cyan
git rm --cached supabase/schema_v2.sql supabase/schema_v3_channels.sql supabase/schema_v4_ai.sql supabase/schema_v5_gcal_sync.sql

# Remove RLS fix script
Write-Host "Removing RLS fix script..." -ForegroundColor Cyan
git rm --cached supabase/fix_rls_recursion.sql

# Verify removals staged
Write-Host ""
Write-Host "=== Staged deletions ===" -ForegroundColor Green
git status --short

Write-Host ""
Write-Host "Continuing to next step..." -ForegroundColor Green
```

---

### PASSO 4: Strengthen .gitignore

Abra `.gitignore` e verifique se tem estes padrões no final (antes do `.vercel`):

```gitignore
# Agent & IDE Configuration (local only)
.clauderules
.cursorrules

# Agent AI Brainstorm/Session Cache
.superpowers/
.copilot/
.gemini/

# One-off Scripts & Debug Files
supabase/fix_*.sql
supabase/schema_v*.sql
```

Se não tiver, adicione. Se tiver, veja se está exatamente assim.

```powershell
# Verificar
Write-Host "Checking .gitignore has new patterns..." -ForegroundColor Cyan
Select-String -Path ".gitignore" "\.superpowers/|\.clauderules" | ForEach-Object { Write-Host "  ✅ Found: $_" }
```

---

### PASSO 5: Commit & Push

```powershell
Write-Host "=== Creating commit ===" -ForegroundColor Cyan

git add .gitignore

# Commit com mensagem estruturada
git commit -m @"
chore: remove development artifacts and backups from version control

Removed files:
- .clauderules, .cursorrules (agent IDE configurations)
- .superpowers/brainstorm/ (AI design session artifacts)
- scratch/*.js, scratch/*.ts (development debug scripts)
- supabase/schema_v*.sql (backup iterations, not migrations)
- supabase/fix_rls_recursion.sql (one-off debug script)

These files are now protected by strengthened .gitignore patterns.
All files remain available locally and in git history if needed.
No functional changes to application or migrations.

Migration authority remains: supabase/migrations/

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
"@

# Verify commit
Write-Host ""
Write-Host "=== Verify commit ===" -ForegroundColor Green
git log -1 --pretty=format:"%h %s"
git log -1 --stat

# Push to main
Write-Host ""
Write-Host "=== Ready to push to main ===" -ForegroundColor Yellow
git push origin main

Write-Host "✅ Done!" -ForegroundColor Green
```

---

## ✓ VALIDAÇÃO PÓS-CLEANUP

Executar após push (ou em novo clone):

```powershell
Write-Host "=== Validation 1: Files NOT in git ===" -ForegroundColor Cyan
git ls-files | Select-String -Pattern "\.clauderules|\.cursorrules|\.superpowers|scratch/|schema_v|fix_rls"
# Deve retornar VAZIO (não deve imprimir nada)

if ($?) {
  Write-Host "  ✅ Files removed from git" -ForegroundColor Green
} else {
  Write-Host "  ❌ Some files still in git" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Validation 2: .gitignore patterns apply ===" -ForegroundColor Cyan
git check-ignore -v .clauderules .cursorrules ".superpowers/brainstorm" "scratch/test.js"
# Deve mostrar que cada arquivo está matched

Write-Host ""
Write-Host "=== Validation 3: Local files still exist ===" -ForegroundColor Cyan
Test-Path .clauderules, .cursorrules, .superpowers, scratch | ForEach-Object {
  Write-Host "  $(if ($_) { '✅ Exists' } else { '❌ Missing' })"
}

Write-Host ""
Write-Host "=== Validation 4: Repo size ===" -ForegroundColor Cyan
$repoSize = (Get-ChildItem -Path ".git" -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Host "  Total .git size: $([Math]::Round($repoSize / 1MB, 2)) MB"
```

---

## 🛟 SE ALGO DER ERRADO

### Reverter commit local (antes de push):
```powershell
git reset --soft HEAD~1
# Modifique e tente novamente
```

### Reverter push (se já fez):
```powershell
git reset --soft HEAD~1
git push origin main --force-with-lease
# ⚠️ Use --force-with-lease, não --force
```

### Restaurar de backup:
```powershell
# Se criou bundle
git fetch agendra-backup-20260530.bundle refs/heads/main:refs/remotes/backup/main

# Reset para backup
git reset --hard backup/main
git push origin main --force-with-lease
```

---

## 📋 CHECKLIST FINAL

- [ ] Leu AUDIT_REPORT.md completamente
- [ ] Criou backup com `git bundle`
- [ ] Executou todos os `git rm --cached` comandos
- [ ] Fortaleceu .gitignore
- [ ] Fez commit com mensagem estruturada
- [ ] Fez `git push origin main`
- [ ] Rodou validações pós-cleanup
- [ ] Tudo passou ✅

---

**Tempo Total:** 5-10 minutos  
**Risco:** Muito baixo (reversível com bundle)  
**Resultado:** Repositório limpo e seguro ✅
