# Instagram Webhook Setup — 2026-05-25

## Status
✅ **Completo** — Webhook configurado e pronto para testes de ponta a ponta

---

## O Que Foi Feito

### 1. Meta Developers Configuration
- **App:** 1805751197054552 (mesma app que WhatsApp)
- **Casos de Uso Adicionados:**
  - ✅ Gerenciar mensagens e conteúdo no Instagram
  - ✅ Gerenciar tudo na sua Página (Facebook)
- **Webhook URL:** `https://www.agendra.site/api/webhooks/instagram`
- **Verify Token:** `agendra_ig_webhook_2026`
- **Instagram Business Login:** Configurado com redirect URI `https://www.agendra.site/api/auth/instagram/callback`

### 2. Environment Variables

#### Local (`.env.local`)
```bash
NEXT_PUBLIC_INSTAGRAM_APP_ID=1805751197054552       # Mesma app que WhatsApp
INSTAGRAM_APP_SECRET=2c36fd8a82e5e5ef...           # Mesma secret que WhatsApp
INSTAGRAM_VERIFY_TOKEN=agendra_ig_webhook_2026     # Verificação webhook
```

#### Vercel (Production + Preview)
- `NEXT_PUBLIC_INSTAGRAM_APP_ID` = `1805751197054552`
- `INSTAGRAM_APP_SECRET` = `2c36fd8a82e5e5ef...` (Sensitive)
- `INSTAGRAM_VERIFY_TOKEN` = `agendra_ig_webhook_2026`

### 3. Code Changes

#### New Endpoint
- **File:** `/app/api/webhooks/instagram/route.ts`
- **Purpose:** Dedicated webhook handler para Instagram (separado do `/api/meta/webhook`)
- **GET:** Challenge verification com `INSTAGRAM_VERIFY_TOKEN`
- **POST:** HMAC SHA-256 validation com `INSTAGRAM_APP_SECRET` + background processing

#### Fixed OAuth
- **File:** `/lib/channels/adapters/instagram-auth.ts`
- **Changes:**
  - Line 21: `NEXT_PUBLIC_META_APP_ID` → `NEXT_PUBLIC_INSTAGRAM_APP_ID`
  - Line 44: `NEXT_PUBLIC_META_APP_ID` → `NEXT_PUBLIC_INSTAGRAM_APP_ID`
  - Line 45: `WHATSAPP_APP_SECRET` → `INSTAGRAM_APP_SECRET`
  - Line 210-211: Mesmas correções
  - **Reason:** App ID/Secret eram iguais (mesma app), mas código estava referenciando nome errado

---

## Architecture

### Webhook Flow
```
Instagram User DM
  ↓
POST /api/webhooks/instagram
  ↓
Validate HMAC (INSTAGRAM_APP_SECRET)
  ↓
Parse Instagram payload (object: "instagram")
  ↓
Resolve channel from DB
  ↓
Dedup + Buffer + Media routing
  ↓
AI Engine processes message
  ↓
Response sent via Instagram API (/me/messages)
  ↓
Stored in messages + leads tables
```

### Key Differences from WhatsApp
| Aspect | WhatsApp | Instagram |
|--------|----------|-----------|
| Webhook URL | `/api/meta/webhook` | `/api/webhooks/instagram` |
| Verify Token | `WHATSAPP_VERIFY_TOKEN` | `INSTAGRAM_VERIFY_TOKEN` |
| App Secret | `WHATSAPP_APP_SECRET` | `INSTAGRAM_APP_SECRET` |
| Object Type | `whatsapp_business_account` | `instagram` |
| Max Text Length | 4096 | 1000 |
| Typing Indicator | ✅ Supported | ❌ Not in adapter |
| Rich Text | ✅ Markdown | ❌ Plain text only |

---

## Testing Checklist

- [ ] **Vercel Deploy** — Redeploy com todas as mudanças
- [ ] **Meta Validation** — Clica "Verify and Save" no Meta Developers
- [ ] **Instagram Business Login** — Conecta conta Instagram profissional (Passo 4)
- [ ] **Send Test DM** — Manda mensagem via Instagram para agendra.app
- [ ] **Validate in DB** — Checa se mensagem chegou em `leads` + `messages` tables
- [ ] **Validate Response** — Confirma que resposta foi enviada de volta via Instagram

---

## Notes

1. **App ID/Secret:** Mesma app que WhatsApp — apenas casos de uso e scopes diferentes
2. **OAuth Scopes:** `instagram_manage_messages`, `pages_manage_metadata`, `pages_show_list`, `pages_messaging`
3. **Token Lifecycle:** Page access token armazenado no Supabase Vault (criptografado) + refresh automático a cada 60 dias
4. **App Review:** Opcional — Development mode funciona pra usuários que são admin/developer da app
5. **Webhook Security:** HMAC SHA-256 + timing-safe compare (mesmo padrão que WhatsApp)

---

## Files Modified

1. `/app/api/webhooks/instagram/route.ts` — ✨ NEW
2. `/lib/channels/adapters/instagram-auth.ts` — Fixed App ID/Secret references
3. `.env.local` — Added INSTAGRAM_* vars
4. `Vercel` (dashboard) — Added env vars

---

## Next Steps

1. Validate webhook em Meta Developers
2. Connect Instagram Business account
3. Test end-to-end (send/receive messages)
4. Monitor logs: `ai_logs`, `message_buffer`, `dedup_keys`
5. When ready: App Review → Production
