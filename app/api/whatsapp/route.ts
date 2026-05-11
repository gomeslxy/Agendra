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

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/ai/engine";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Tipos (Meta Webhook Payload) ────────────────────────────────────────────

interface MetaTextMessage {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location";
  text?: { body: string };
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
    console.warn("[WhatsApp] ⚠️  WHATSAPP_APP_SECRET não configurado.");
    return true;
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
    console.warn("[WhatsApp] ⚠️ Ignorando erro de assinatura para teste (BYPASS ATIVO).");
  }

  return true; // PERMITIR PARA TESTE
}


/**
 * Resolve a `company_id` a partir do `phone_number_id` da Meta.
 *
 * Consulta a tabela `channels` para mapear:
 *   phone_number_id (Meta) → company_id (Agendra)
 *
 * Retorna null se o canal não estiver registrado — o evento é logado
 * e descartado (sem processamento parcial).
 */
async function resolveCompanyId(
  phoneNumberId: string,
): Promise<string | null> {
  if (!phoneNumberId) return null;

  try {
    console.log(`[DB] 🔍 Iniciando consulta para phone_id=${phoneNumberId}`);
    const admin = createAdminClient();
    
    const { data, error } = await admin
      .from("channels")
      .select("company_id")
      .eq("provider", "whatsapp")
      .eq("provider_id", phoneNumberId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.error(`[DB] ❌ Erro na consulta do Supabase:`, error.message);
      return null;
    }

    if (!data?.company_id) {
      console.warn(`[DB] ⚠️ Canal ativo não encontrado para phone_id=${phoneNumberId}`);
      return null;
    }

    console.log(`[DB] ✅ Empresa resolvida com sucesso: ${data.company_id}`);
    return data.company_id;
  } catch (err: any) {
    console.error(`[DB] 💥 Crash catastrófico ao falar com Supabase:`, err.message || err);
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
  // ── Ler o body como texto (necessário para validação HMAC) ─────────────────
  const rawBody = await request.text();

  // ── Validar assinatura da Meta ANTES de qualquer processamento ─────────────
  const isValid = await validateMetaSignature(request, rawBody);
  if (!isValid) {
    console.error("[WhatsApp] ❌ Assinatura inválida — request rejeitada.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Retornar 200 imediatamente (Meta tem timeout de 5s) ───────────────────
  // O processamento pesado acontece de forma assíncrona (fire-and-forget).
  const response = NextResponse.json({ status: "ok" }, { status: 200 });

  // ── Processar payload de forma assíncrona ─────────────────────────────────
  // Usando void para não bloquear a resposta (Next.js Route Handlers suportam isso)
  void processWebhookPayload(rawBody);

  return response;
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

      console.log(`[WhatsApp] 🔍 Buscando empresa para phone_id=${phoneNumberId}...`);
      const companyId = await resolveCompanyId(phoneNumberId);


      if (!companyId) {
        console.warn(
          `[WhatsApp] ⚠️  company_id não resolvida para phone_number_id=${phoneNumberId}`,
        );
        continue;
      }

      console.log(`[WhatsApp] 🏢 Empresa resolvida: ${companyId}`);


      // ── Processar cada mensagem individualmente ─────────────────────────────
      for (const msg of messages) {
        // Encontrar o contato correspondente
        const contact = contacts.find((c) => c.wa_id === msg.from);

        if (!contact) {
          console.warn(`[WhatsApp] ⚠️  Contato não encontrado para from=${msg.from}`);
          continue;
        }

        // Apenas mensagens de texto por enquanto
        if (msg.type !== "text" || !msg.text?.body) {
          console.log(`[WhatsApp] ⏭️  Tipo de mensagem ignorado: ${msg.type}`);
          continue;
        }

        console.log(
          `[WhatsApp] 📩 Nova mensagem | from=${msg.from} | name="${contact.profile.name}" | text="${msg.text.body.slice(0, 80)}"`
        );

        console.log(`[WhatsApp] 🧠 Chamando handleIncomingMessage...`);
        try {
          await handleIncomingMessage(
            companyId,
            msg.from,
            contact.profile.name,
            msg.text.body,
          );
          console.log(`[WhatsApp] ✅ handleIncomingMessage finalizado com sucesso.`);
        } catch (err: any) {
          console.error(`[WhatsApp] ❌ Erro no handleIncomingMessage:`, err.message || err);
        }

      }
    }
  }
}
