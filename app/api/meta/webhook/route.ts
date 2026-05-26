/**
 * Unified Meta App Webhook — Route Handler
 * 
 * Responsibilities:
 *  GET  → Challenge verification for Meta Developer Console (WhatsApp & Instagram)
 *  POST → Handles webhook messages and routing for both WhatsApp and Instagram channels
 * 
 * Security:
 *  - HMAC SHA-256 validation (timing-safe) using process.env.WHATSAPP_APP_SECRET
 *  - RLS bypass via Admin Client (no user session, secured by Meta signature)
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyUsage, type CompanyUsage } from "@/lib/billing/limits";
import { logInfo, logError, logDebug, isDebug } from "@/lib/logging";
import { getAdapter } from "@/lib/channels/registry";
import { ChannelProvider, ChannelConfig, IncomingMessage } from "@/lib/channels/types";
import { routeMedia } from "@/lib/ai/media-router";
import crypto from "crypto";

export const maxDuration = 300; // seconds, Vercel Edge limit

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

// ─── POST: Message processing ───────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  if (isDebug) logDebug('[Meta Webhook] Raw body', rawBody);

  const isValid = await validateSignature(request, rawBody);
  if (!isValid) {
    console.error("[Meta Webhook] ❌ Signature verification failed.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Acknowledge immediately to avoid Meta retries timeout
  after(async () => {
    try {
      await processWebhookPayload(rawBody, request.headers);
    } catch (err: any) {
      console.error("[Meta Webhook] 💥 Background processing crash:", err.message);
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

/**
 * Asynchronously processes webhook entries.
 */
async function processWebhookPayload(rawBody: string, headers: Headers): Promise<void> {
  const webId = crypto.randomBytes(4).toString('hex');
  const start = Date.now();
  let payload: { object?: string };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error(`[Meta Webhook][${webId}] ❌ Invalid payload (not a valid JSON).`);
    return;
  }

  // 1. Resolve Provider and Adapter
  const objectType = payload.object;
  let provider: ChannelProvider;

  if (objectType === "whatsapp_business_account") {
    provider = "whatsapp";
  } else if (objectType === "instagram") {
    provider = "instagram";
  } else {
    console.warn(`[Meta Webhook][${webId}] ⚠️ Unsupported object type: ${objectType}`);
    return;
  }

  console.log(`[Meta Webhook][${webId}] 📦 [${provider.toUpperCase()}] Webhook payload received`);

  const adapter = getAdapter(provider);
  const parsed = await adapter.parseWebhookPayload(rawBody, headers);

  if (parsed.statusUpdates.length > 0) {
    console.log(`[Meta Webhook][${webId}] 📊 Status updates in payload: ${parsed.statusUpdates.length}`);
  }

  if (parsed.messages.length === 0) {
    return;
  }

  // 2. Resolve Channel Config
  const channel = await resolveChannel(provider, parsed.channelProviderId);
  if (!channel) {
    console.warn(`[Meta Webhook][${webId}] ⚠️ Channel not registered or found for providerId=${parsed.channelProviderId}`);
    return;
  }

  if (channel.status !== "active") {
    console.warn(`[Meta Webhook][${webId}] ⏸️ Channel ${channel.id} is not active (status: ${channel.status})`);
    return;
  }

  const companyId = channel.company_id;

  // 2.5 Webhook Flood / Throttling Protection
  const { checkRateLimitAsync } = await import("@/lib/rate-limit");
  const isAllowed = await checkRateLimitAsync(`flood:${companyId}`, 20, 10000); // 20 requests per 10s max
  if (!isAllowed) {
    console.error(`[Meta Webhook][${webId}] 🚫 Flood protection triggered for company ${companyId}. Webhook payload blocked.`);
    return;
  }

  // 3. Company & Subscription Guard
  const adminGuard = createAdminClient();
  const { data: company } = await adminGuard
    .from("companies")
    .select("id, subscription_status")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    console.warn(`[Meta Webhook][${webId}] ⚠️ Company ${companyId} not found. Channel ignored.`);
    return;
  }

  if (company.subscription_status === "canceled") {
    console.warn(`[Meta Webhook][${webId}] 🚫 Subscription for company ${companyId} is canceled. Ignoring.`);
    return;
  }

  // 4. Billing Gate / Usage limits
  console.log(`[Meta Webhook][${webId}] 🛡️ Checking company usage limits for ${companyId}`);
  let usage: CompanyUsage | undefined;
  try {
    usage = await getCompanyUsage(companyId);
    if (usage.isLimitReached) {
      console.error(`[Meta Webhook][${webId}] 🚫 Limit reached or subscription expired for ${companyId}. Blocking AI response.`);
      return;
    }
  } catch (err) {
    console.error(`[Meta Webhook][${webId}] ❌ Error evaluating limits:`, err);
  }

  const pendingPromises: Promise<void>[] = [];

  // 5. Process incoming messages
  for (const msg of parsed.messages) {
    // Inject database context
    msg.companyId = companyId;
    msg.channelId = channel.id;

    const msgLogId = `${webId}:${msg.providerMessageId.slice(-8)}`;
    console.log(`[Meta Webhook][${msgLogId}] 📨 incoming message [${msg.type}] from=${msg.senderIdentifier.substring(0, 6)}***`);

    // 5.1 Deduplication (Unique check)
    const { claimMessage, bufferAndDebounce, bufferInDB } = await import('@/lib/ai/debounce');
    const claimed = await claimMessage(msg.providerMessageId);
    if (!claimed) {
      console.log(`[Meta Webhook][${msgLogId}] 🔁 Deduplication hit - message already processed.`);
      continue;
    }

    // 5.2 Typing Indicator
    if (adapter.capabilities.supportsTypingIndicator) {
      const { redis } = await import('@/lib/infra/redis');
      const typingKey = `ch:typing:${companyId}:${msg.senderIdentifier}`;
      const shouldType = await redis.setNX(typingKey, '1', 6);
      if (shouldType === true && channel.access_token) {
        const channelConfig: ChannelConfig = {
          id: channel.id,
          companyId: channel.company_id,
          provider: channel.provider,
          providerId: channel.provider_id,
          accessToken: channel.access_token.trim(),
          meta: channel.meta || {},
          status: channel.status,
        };
        void adapter.sendTypingIndicator?.(channelConfig, msg.providerMessageId);
      }
    }

    // 5.3 Route Media Attachments (Transcribe/Analyze)
    const { body: messageText, metadata: mediaMetadata } = await routeMedia(
      msg,
      channel.access_token ?? '',
      msg.providerMessageId
    );

    if (!messageText) {
      console.warn(`[Meta Webhook][${msgLogId}] ⚠️ Empty body after routing media, skipping.`);
      continue;
    }

    console.log(`[Meta Webhook][${msgLogId}] ➡️ Debouncing processed text (length=${messageText.length})`);

    // 5.4 Flusher debounce routine
    const debouncePromise = (async () => {
      const dbStart = Date.now();
      const metadataContext = {
        ...mediaMetadata,
        channelProvider: msg.provider,
        channelId: channel.id,
      };

      try {
        await bufferAndDebounce({
          companyId,
          leadPhone: msg.senderIdentifier,
          leadName: msg.senderName,
          body: messageText,
          providerMessageId: msg.providerMessageId,
          msgType: msg.type,
          usage,
          metadata: metadataContext,
        });
        console.log(`[Meta Webhook][${msgLogId}] Flushed successfully in ${Date.now() - dbStart}ms`);
      } catch (err: any) {
        console.error(`[Meta Webhook][${msgLogId}] 💥 Debounce execution failed: ${err.message}`);
        // Fallback: SQL buffering
        try {
          await bufferInDB({
            companyId,
            leadPhone: msg.senderIdentifier,
            leadName: msg.senderName,
            body: messageText,
            providerMessageId: msg.providerMessageId,
            msgType: msg.type,
            metadata: metadataContext,
          });
          console.log(`[Meta Webhook][${msgLogId}] 🛟 Buffered to DB buffer fallback.`);
        } catch (dbErr: any) {
          console.error(`[Meta Webhook][${msgLogId}] 💥 DB buffer fallback also failed: ${dbErr.message}`);
        }
      }
    })();

    pendingPromises.push(debouncePromise);
  }

  // Await in-flight operations so the serverless wrapper doesn't shut down prematurely
  if (pendingPromises.length > 0) {
    console.log(`[Meta Webhook][${webId}] ⏳ Awaiting ${pendingPromises.length} debouncing tasks`);
    await Promise.allSettled(pendingPromises);
  }

  console.log(`[Meta Webhook][${webId}] 🏁 Processing complete in ${Date.now() - start}ms`);
}
