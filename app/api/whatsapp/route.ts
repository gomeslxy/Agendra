/**
 * WhatsApp Cloud API — Webhook Route Handler
 *
 * Responsabilidades:
 *  GET  → Verificação do Webhook pela Meta (Challenge Verification)
 *  POST → Recebimento de mensagens e eventos de status
 *
 * Segurança:
 *  - Valida assinatura HMAC SHA-256 (X-Hub-Signature-256) em todo POST
 *  - Usa Admin Client (service role) para bypassar RLS — este endpoint
 *    não tem sessão de usuário, mas é protegido pela assinatura da Meta.
 *
 * Performance:
 *  - Retorna 200 imediatamente para a Meta (evitar reenvios por timeout)
 *  - Processa a lógica de negócio de forma assíncrona (fire-and-forget)
 */

import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleIncomingMessage } from "@/lib/ai/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyUsage, type CompanyUsage } from "@/lib/billing/limits";

// ─── Tipos (Meta Webhook Payload) ────────────────────────────────────────────

interface MetaTextMessage {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location";
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
}

interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaContact[];
  messages?: MetaTextMessage[];
  statuses?: { id: string; status: string; timestamp: string; recipient_id: string }[];
}

interface MetaChange {
  value: MetaValue;
  field: string;
}

interface MetaEntry {
  id: string; // WABA ID (WhatsApp Business Account ID)
  changes: MetaChange[];
}

interface MetaWebhookPayload {
  object: "whatsapp_business_account";
  entry: MetaEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Valida a assinatura X-Hub-Signature-256 da Meta.
 * Garante que o payload veio genuinamente da Meta e não de terceiros.
 */
async function validateMetaSignature(
  request: NextRequest,
  rawBody: string,
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    // [FIX P2-4] Em desenvolvimento, permite sem secret para facilitar testes locais.
    // Em produção, qualquer POST sem secret configurado é REJEITADO — evita injeção de mensagens falsas.
    if (process.env.NODE_ENV === 'development') {
      console.warn("[WhatsApp] ⚠️  WHATSAPP_APP_SECRET não configurado — permitindo em dev.");
      return true;
    }
    console.error("[WhatsApp] ❌ WHATSAPP_APP_SECRET ausente em produção. Request rejeitada.");
    return false;
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    console.error("[WhatsApp] ❌ Header X-Hub-Signature-256 ausente.");
    return false;
  }

  const expectedSignature = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const actualSignature = signature.replace("sha256=", "");

  if (actualSignature !== expectedSignature) {
    console.error(`[WhatsApp] ❌ Assinatura inválida!
      Esperada: ${expectedSignature.slice(0, 10)}...
      Recebida: ${actualSignature.slice(0, 10)}...
    `);
    return false;
  }

  return true;
}


/**
 * Resolve o Canal (Row) a partir do `phone_number_id` da Meta.
 *
 * Além de mapear a empresa, recupera o `access_token` específico
 * deste canal (Nexus Multi-tenant).
 */
async function resolveChannel(
  phoneNumberId: string,
) {
  if (!phoneNumberId) return null;

  try {
    const admin = createAdminClient();
    
    const { data, error } = await admin
      .from("channels")
      .select("*")
      .eq("provider", "whatsapp")
      .eq("provider_id", phoneNumberId)
      .maybeSingle();

    if (error || !data) {
      console.warn(`[Nexus] ⚠️ Canal não encontrado para phone_id=${phoneNumberId}`);
      return null;
    }

    // P0-4 fix: migration 034 moved access_token to vault.secrets (access_token column = NULL).
    // Call channel_get_access_token RPC which handles both vault and plaintext fallback.
    if (!data.access_token && data.access_token_secret_id) {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: data.id });
      data.access_token = tokenData ?? null;
    }

    return data;
  } catch (err: any) {
    console.error(`[Nexus] 💥 Erro ao resolver canal:`, err.message);
    return null;
  }
}

// ─── Handler: GET — Challenge Verification ───────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log(`[WhatsApp] 🔍 Verificação de Webhook | mode=${mode} | token=${token}`);

  if (mode !== "subscribe") {
    console.error("[WhatsApp] ❌ Modo inválido:", mode);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[WhatsApp] ❌ WHATSAPP_VERIFY_TOKEN não configurado.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (token !== verifyToken) {
    console.error("[WhatsApp] ❌ Token de verificação inválido.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.log("[WhatsApp] ✅ Webhook verificado com sucesso.");
  return new NextResponse(challenge, { status: 200 });
}

// ─── Handler: POST — Recebimento de Eventos ──────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("[WhatsApp Webhook] 🔔 Sinal recebido");
  
  // ── Ler o body como texto (necessário para validação HMAC) ─────────────────
  const rawBody = await request.text();

  // ── Validar assinatura da Meta ANTES de qualquer processamento ─────────────
  const isValid = await validateMetaSignature(request, rawBody);
  if (!isValid) {
    console.error("[WhatsApp] ❌ Assinatura inválida — request rejeitada.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Responder 200 IMEDIATAMENTE e processar em background ─────────────────
  // O after() do Next.js garante que o processamento continua após o response
  after(async () => {
    try {
      await processWebhookPayload(rawBody);
    } catch (err: any) {
      console.error("[WhatsApp] 💥 Erro no processamento em background:", err.message);
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ─── Processamento Assíncrono ─────────────────────────────────────────────────

async function processWebhookPayload(rawBody: string): Promise<void> {
  let payload: MetaWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    console.error("[WhatsApp] ❌ Payload inválido — não é JSON válido.");
    return;
  }

  // Verificar se é um payload de WhatsApp Business
  if (payload.object !== "whatsapp_business_account") {
    console.warn("[WhatsApp] ⚠️  Objeto inesperado:", payload.object);
    return;
  }

  console.log(`[WhatsApp] 📦 Payload recebido | entries=${payload.entry?.length ?? 0}`);

  for (const entry of payload.entry ?? []) {
    
    // ─── Processar Mudanças (Changes) ─────────────────────────────────────────
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const metadata = value.metadata;
      const phoneNumberId = metadata?.phone_number_id;

      const messages = value.messages ?? [];
      const contacts = value.contacts ?? [];
      console.log(`[WhatsApp] 📩 Mensagens no payload: ${messages.length} | Contatos: ${contacts.length}`);

      if (messages.length === 0) {
        const statuses = value.statuses ?? [];
        console.log(`[WhatsApp] 📊 Nenhum conteúdo de mensagem. Status updates: ${statuses.length}`);
        continue;
      }

      console.log(`[WhatsApp] 🔍 Buscando canal para phone_id=${phoneNumberId}...`);
      const channel = await resolveChannel(phoneNumberId);

      if (!channel) {
        console.warn(`[WhatsApp] ⚠️ Canal não registrado: ${phoneNumberId}`);
        continue;
      }

      if (channel.status !== "active") {
        console.warn(`[WhatsApp] ⏸️ Canal pausado ou com erro: ${channel.id} (${channel.status})`);
        continue;
      }

      const companyId = channel.company_id;

      // ─── COMPANY GUARD: Validar empresa existe e está ativa ───────────────────
      {
        const adminGuard = createAdminClient();
        const { data: company } = await adminGuard
          .from("companies")
          .select("id, subscription_status")
          .eq("id", companyId)
          .maybeSingle();

        if (!company) {
          console.warn(`[WhatsApp] ⚠️ Empresa ${companyId} não encontrada — channel órfão. Ignorando.`);
          continue;
        }

        if (company.subscription_status === "canceled") {
          console.warn(`[WhatsApp] 🚫 Empresa ${companyId} cancelada. Ignorando mensagem.`);
          continue;
        }
      }

      // ─── BILLING GATE: Proteção de Margem ─────────────────────────────────────
      console.log(`[WhatsApp] 🛡️ Verificando limites para empresa: ${companyId}`);
      let usage: CompanyUsage | undefined;
      try {
        usage = await getCompanyUsage(companyId);
        if (usage.isLimitReached) {
          console.error(`[WhatsApp] 🚫 BLOQUEADO: Limite atingido ou assinatura expirada para ${companyId}`);
          // Opcional: Enviar mensagem de aviso via Cloud API (sem IA) se for WhatsApp
          continue;
        }
      } catch (usageErr) {
        console.error(`[WhatsApp] ❌ Erro ao verificar billing:`, usageErr);
        // Em caso de erro no billing, por segurança, bloqueamos ou permitimos?
        // Na Agendra, permitimos para não degradar UX por falha interna temporária.
      }

      // ── Processar cada mensagem individualmente ─────────────────────────────
      for (const msg of messages) {
        // Encontrar o contato correspondente
        const contact = contacts.find((c) => c.wa_id === msg.from);

        if (!contact) {
          console.warn(`[WhatsApp] ⚠️  Contato não encontrado para from=${msg.from}`);
          continue;
        }

        // Definir o texto da mensagem (fallback para mídia)
        let messageText = "";
        let incomingMetadata: Record<string, any> | undefined;
        if (msg.type === "text" && msg.text?.body) {
          messageText = msg.text.body;
        } else if (msg.type === "image") {
          messageText = "[Imagem recebida]";
        } else if (msg.type === "audio") {
          const channelToken = channel?.access_token;
          if (msg.audio?.id && channelToken) {
            const { transcribeWhatsAppAudio } = await import('@/lib/ai/transcribe');
            const result = await transcribeWhatsAppAudio(msg.audio.id, channelToken);
            messageText = result.text;
            incomingMetadata = { ...(incomingMetadata ?? {}), is_audio: true, audio_id: msg.audio.id };
          } else {
            messageText = "[Áudio recebido]";
          }
        } else if (msg.type === "video") {
          messageText = "[Vídeo recebido]";
        } else if (msg.type === "document") {
          messageText = "[Documento recebido]";
        } else {
          messageText = `[Mídia recebida: ${msg.type}]`;
        }

        if (!messageText) {
          console.log(`[WhatsApp] ⏭️  Conteúdo vazio ou ignorado para tipo: ${msg.type}`);
          continue;
        }

        console.log(
          `[WhatsApp] 📩 Nova mensagem | from=${msg.from} | name="${contact.profile.name}" | type=${msg.type} | text="${messageText.slice(0, 80)}"`
        );

        console.log(`[WhatsApp] 🧠 Chamando handleIncomingMessage...`);
        try {
          await handleIncomingMessage(
            companyId,
            msg.from,
            contact.profile.name,
            messageText,
            msg.id, // Passando providerMessageId para deduplicação
            usage,  // pass pre-fetched CompanyUsage to avoid double DB call
            incomingMetadata
          );
          console.log(`[WhatsApp] ✅ handleIncomingMessage finalizado com sucesso.`);
        } catch (err: any) {
          console.error(`[WhatsApp] ❌ Erro no handleIncomingMessage:`, err.message || err);
        }
      }
    }
  }
}
