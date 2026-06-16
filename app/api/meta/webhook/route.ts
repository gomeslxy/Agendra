/**
 * Unified Meta App Webhook — Route Handler
 * 
 * Responsibilities:
 *  GET  → Challenge verification for Meta Developer Console (WhatsApp & Instagram)
 *  POST → Handles webhook messages, records them in the DB queue, and returns 200 OK instantly.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logDebug, isDebug } from "@/lib/logging";
import { getAdapter } from "@/lib/channels/registry";
import type { ChannelProvider } from "@/lib/channels/types";
import crypto from "crypto";

export const maxDuration = 300;

/**
 * Timing-safe HMAC SHA-256 signature verification.
 */
async function validateSignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn("[Meta Webhook] ⚠️  WHATSAPP_APP_SECRET not configured — allowing in dev.");
      return true;
    }
    console.error("[Meta Webhook] ❌ WHATSAPP_APP_SECRET missing in production. Request rejected.");
    return false;
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    console.error("[Meta Webhook] ❌ x-hub-signature-256 header is missing.");
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const actualSignature = signature.replace("sha256=", "");

  const expected = Buffer.from(expectedSignature, "hex");
  const actual = Buffer.from(
    actualSignature.length === expectedSignature.length ? actualSignature : expectedSignature,
    "hex"
  );

  if (!crypto.timingSafeEqual(expected, actual) || actualSignature.length !== expectedSignature.length) {
    console.error(`[Meta Webhook] ❌ Invalid signature.`);
    return false;
  }

  return true;
}

/**
 * Resolves the channel row and token decryption from DB.
 */
async function resolveChannel(provider: ChannelProvider, providerId: string): Promise<any | null> {
  if (!providerId) return null;

  try {
    const admin = createAdminClient();
    const { data: channel, error } = await admin
      .from("channels")
      .select("*")
      .eq("provider", provider)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error || !channel) {
      console.warn(`[Nexus] ⚠️ Channel not found for ${provider} with providerId=${providerId}`);
      return null;
    }

    if (!channel.access_token && channel.access_token_secret_id) {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: channel.id });
      channel.access_token = tokenData ?? null;
    }

    return channel;
  } catch (err: any) {
    console.error(`[Nexus] 💥 Error resolving channel:`, err.message);
    return null;
  }
}

// ─── GET: Meta Webhook challenge verification ─────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log(`[Meta Webhook] 🔍 Verification Request | mode=${mode} | token=${token?.slice(0, 4)}***`);

  if (mode !== "subscribe") {
    console.error("[Meta Webhook] ❌ Invalid mode:", mode);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[Meta Webhook] ❌ WHATSAPP_VERIFY_TOKEN not configured.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (token !== verifyToken) {
    console.error("[Meta Webhook] ❌ Verification token mismatch.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.log("[Meta Webhook] ✅ Webhook verified successfully.");
  return new NextResponse(challenge, { status: 200 });
}

// ─── POST: Fast Queueing and Message Buffering ───────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const rawBody = await request.text();
  console.log(`[Meta Webhook] 📥 Received POST request (body size: ${rawBody.length} bytes)`);
  if (isDebug) logDebug('[Meta Webhook] Raw body', rawBody);

  const isValid = await validateSignature(request, rawBody);
  console.log(`[Meta Webhook] Signature verification result: ${isValid}`);
  if (!isValid) {
    console.error("[Meta Webhook] ❌ Signature verification failed.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody);
    const objectType = payload.object;
    let provider: ChannelProvider;

    console.log(`[Meta Webhook] Parsing payload: objectType=${objectType}`);

    if (objectType === "whatsapp_business_account") {
      provider = "whatsapp";
    } else if (objectType === "instagram") {
      provider = "instagram";
    } else {
      console.warn(`[Meta Webhook] ⚠️ Unsupported object type: ${objectType}`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const adapter = getAdapter(provider);
    const parsed = await adapter.parseWebhookPayload(rawBody, request.headers);
    console.log(`[Meta Webhook] Parsed webhook payload: found ${parsed.messages.length} messages, providerId=${parsed.channelProviderId}`);

    if (parsed.messages.length === 0) {
      console.log(`[Meta Webhook] No messages in payload. Exiting.`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const channel = await resolveChannel(provider, parsed.channelProviderId);
    console.log(`[Meta Webhook] Resolved channel: found=${!!channel}, id=${channel?.id}, status=${channel?.status}`);
    if (!channel) {
      console.warn(`[Meta Webhook] ⚠️ Channel not registered or found for providerId=${parsed.channelProviderId}`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    if (channel.status !== "active") {
      console.warn(`[Meta Webhook] ⏸️ Channel ${channel.id} is not active (status: ${channel.status})`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const companyId = channel.company_id;
    console.log(`[Meta Webhook] Resolved company: ${companyId}`);

    // Tenant Flood/Throttling protection check (extremely fast Redis gate)
    const { checkRateLimitAsync } = await import("@/lib/rate-limit");
    const isAllowed = await checkRateLimitAsync(`flood:${companyId}`, 20, 10000);
    console.log(`[Meta Webhook] Tenant flood check result: ${isAllowed}`);
    if (!isAllowed) {
      console.error(`[Meta Webhook] 🚫 Flood protection triggered for company ${companyId}. Webhook payload blocked.`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // Company & Subscription guard
    const adminGuard = createAdminClient();
    const { data: company } = await adminGuard
      .from("companies")
      .select("id, subscription_status")
      .eq("id", companyId)
      .maybeSingle();

    console.log(`[Meta Webhook] Subscription status check: found=${!!company}, status=${company?.subscription_status}`);
    if (!company) {
      console.warn(`[Meta Webhook] ⚠️ Company ${companyId} not found. Channel ignored.`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    if (company.subscription_status === "canceled") {
      console.warn(`[Meta Webhook] 🚫 Subscription for company ${companyId} is canceled. Ignoring.`);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const { claimMessage, bufferAndQueueMessage } = await import('@/lib/ai/debounce');

    // Side-effects that must complete before we return 200 (serverless kills the
    // instance after the response). Typing indicators go here so they fire NOW —
    // not after the debounce window + QStash round-trip + AI cold start.
    const sideEffects: Promise<unknown>[] = [];
    const typingAdapter = getAdapter(provider);

    for (const msg of parsed.messages) {
      const msgLogId = `${msg.providerMessageId.slice(-8)}`;
      console.log(`[Meta Webhook][${msgLogId}] Processing parsed message: sender=${msg.senderIdentifier}, type=${msg.type}`);

      // Lead-level Flood Protection
      const isLeadAllowed = await checkRateLimitAsync(`flood:${companyId}:${msg.senderIdentifier}`, 5, 10000);
      console.log(`[Meta Webhook][${msgLogId}] Lead flood check result: ${isLeadAllowed}`);
      if (!isLeadAllowed) {
        console.error(`[Meta Webhook][${msgLogId}] 🚫 Lead-level flood protection triggered for sender ${msg.senderIdentifier}. Message ignored.`);
        continue;
      }

      // Deduplication unique check (extremely fast Redis setNX)
      const claimed = await claimMessage(msg.providerMessageId);
      console.log(`[Meta Webhook][${msgLogId}] Deduplication claim result: ${claimed}`);
      if (!claimed) {
        console.log(`[Meta Webhook][${msgLogId}] 🔁 Deduplication hit - message already processed.`);
        continue;
      }

      // ⌨️ INSTANT typing indicator — fired the moment the message lands, using the
      // channel token we already decrypted. Independent of debounce/QStash/AI so the
      // lead sees "typing…" within the webhook latency, not seconds later. The engine
      // keeps it alive (4s interval) through AI processing until the reply is sent.
      if (typingAdapter.sendTypingIndicator && channel.access_token) {
        const tStart = Date.now();
        sideEffects.push(
          typingAdapter
            .sendTypingIndicator(
              {
                id: channel.id,
                companyId,
                provider,
                providerId: channel.provider_id,
                accessToken: channel.access_token,
                meta: channel.meta || {},
                status: channel.status,
              },
              msg.providerMessageId,
            )
            .then(() => console.log(`[Meta Webhook][${msgLogId}] ⌨️ typing fired in ${Date.now() - tStart}ms`))
            .catch(() => {}),
        );
      }

      // Capture media parameters if not text (to download and transcribe asynchronously on flush)
      const mediaMetadata: Record<string, any> = {};
      if (msg.type !== 'text') {
        if (msg.mediaId) mediaMetadata.mediaId = msg.mediaId;
        if (msg.mediaMimeType) mediaMetadata.mediaMimeType = msg.mediaMimeType;
        console.log(`[Meta Webhook][${msgLogId}] Captured media metadata:`, mediaMetadata);
      }

      const metadataContext = {
        ...mediaMetadata,
        channelProvider: provider,
        channelId: channel.id,
        received_at: start,
      };

      // Push raw message structure directly to DB queue and schedule QStash
      console.log(`[Meta Webhook][${msgLogId}] Calling bufferAndQueueMessage...`);
      await bufferAndQueueMessage({
        companyId,
        leadPhone: msg.senderIdentifier,
        leadName: msg.senderName,
        body: msg.text || '',
        providerMessageId: msg.providerMessageId,
        msgType: msg.type,
        metadata: metadataContext,
      });
      console.log(`[Meta Webhook][${msgLogId}] bufferAndQueueMessage completed.`);
    }

    // Ensure typing indicators actually flush before the serverless instance dies.
    if (sideEffects.length > 0) await Promise.allSettled(sideEffects);

  } catch (err: any) {
    console.error(`[Meta Webhook] 💥 Webhook payload processing failed:`, err.message, err.stack);
  }

  console.log(`[Meta Webhook] 🏁 POST completed in ${Date.now() - start}ms`);
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
