/**
 * Instagram Webhook — Route Handler
 *
 * Dedicated endpoint for the Instagram Business API (separate Meta App).
 *
 * GET  → Challenge verification (hub.verify_token = INSTAGRAM_VERIFY_TOKEN)
 * POST → HMAC SHA-256 validation (INSTAGRAM_APP_SECRET) + background processing
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyUsage, type CompanyUsage } from "@/lib/billing/limits";
import { logInfo, logError, logDebug, isDebug } from "@/lib/logging";
import { getAdapter } from "@/lib/channels/registry";
import { ChannelConfig } from "@/lib/channels/types";
import { routeMedia } from "@/lib/ai/media-router";
import crypto from "crypto";

export const maxDuration = 300;

async function validateSignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appSecret) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Instagram Webhook] ⚠️ INSTAGRAM_APP_SECRET not configured — allowing in dev.");
      return true;
    }
    console.error("[Instagram Webhook] ❌ INSTAGRAM_APP_SECRET missing in production.");
    return false;
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    console.error("[Instagram Webhook] ❌ x-hub-signature-256 header missing.");
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
    console.error("[Instagram Webhook] ❌ Invalid signature.");
    return false;
  }

  return true;
}

async function resolveChannel(providerId: string): Promise<any | null> {
  if (!providerId) return null;
  try {
    const admin = createAdminClient();
    const { data: channel, error } = await admin
      .from("channels")
      .select("*")
      .eq("provider", "instagram")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error || !channel) {
      console.warn(`[Instagram Webhook] ⚠️ Channel not found for providerId=${providerId}`);
      return null;
    }

    if (!channel.access_token && channel.access_token_secret_id) {
      const { data: tokenData } = await admin.rpc("channel_get_access_token", { p_channel_id: channel.id });
      channel.access_token = tokenData ?? null;
    }

    return channel;
  } catch (err: any) {
    console.error("[Instagram Webhook] 💥 Error resolving channel:", err.message);
    return null;
  }
}

// ─── GET: Challenge verification ─────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log(`[Instagram Webhook] 🔍 Verification | mode=${mode} | token=${token?.slice(0, 8)}***`);

  if (mode !== "subscribe") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[Instagram Webhook] ❌ INSTAGRAM_VERIFY_TOKEN not configured.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (token !== verifyToken) {
    console.error("[Instagram Webhook] ❌ Verification token mismatch.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.log("[Instagram Webhook] ✅ Verified successfully.");
  return new NextResponse(challenge, { status: 200 });
}

// ─── POST: Message processing ─────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  if (isDebug) logDebug("[Instagram Webhook] Raw body", rawBody);

  const isValid = await validateSignature(request, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(async () => {
    try {
      await processPayload(rawBody);
    } catch (err: any) {
      console.error("[Instagram Webhook] 💥 Background crash:", err.message);
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function processPayload(rawBody: string): Promise<void> {
  const webId = crypto.randomBytes(4).toString("hex");
  const start = Date.now();

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error(`[Instagram Webhook][${webId}] ❌ Invalid JSON payload.`);
    return;
  }

  if (payload.object !== "instagram") {
    console.warn(`[Instagram Webhook][${webId}] ⚠️ Unexpected object type: ${payload.object}`);
    return;
  }

  const adapter = getAdapter("instagram");
  const parsed = await adapter.parseWebhookPayload(rawBody, new Headers());

  if (parsed.statusUpdates.length > 0) {
    console.log(`[Instagram Webhook][${webId}] 📊 Status updates: ${parsed.statusUpdates.length}`);
  }

  if (parsed.messages.length === 0) return;

  const channel = await resolveChannel(parsed.channelProviderId);
  if (!channel) {
    console.warn(`[Instagram Webhook][${webId}] ⚠️ No channel for providerId=${parsed.channelProviderId}`);
    return;
  }

  if (channel.status !== "active") {
    console.warn(`[Instagram Webhook][${webId}] ⏸️ Channel ${channel.id} not active (${channel.status})`);
    return;
  }

  const companyId = channel.company_id;

  const { checkRateLimitAsync } = await import("@/lib/rate-limit");
  const isAllowed = await checkRateLimitAsync(`flood:${companyId}`, 20, 10000);
  if (!isAllowed) {
    console.error(`[Instagram Webhook][${webId}] 🚫 Flood protection triggered for ${companyId}`);
    return;
  }

  const adminGuard = createAdminClient();
  const { data: company } = await adminGuard
    .from("companies")
    .select("id, subscription_status")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    console.warn(`[Instagram Webhook][${webId}] ⚠️ Company ${companyId} not found.`);
    return;
  }

  if (company.subscription_status === "canceled") {
    console.warn(`[Instagram Webhook][${webId}] 🚫 Subscription canceled for ${companyId}.`);
    return;
  }

  let usage: CompanyUsage | undefined;
  try {
    usage = await getCompanyUsage(companyId);
    if (usage.isLimitReached) {
      console.error(`[Instagram Webhook][${webId}] 🚫 Usage limit reached for ${companyId}.`);
      return;
    }
  } catch (err) {
    console.error(`[Instagram Webhook][${webId}] ❌ Error evaluating limits:`, err);
  }

  const pendingPromises: Promise<void>[] = [];

  for (const msg of parsed.messages) {
    msg.companyId = companyId;
    msg.channelId = channel.id;

    const msgLogId = `${webId}:${msg.providerMessageId.slice(-8)}`;
    console.log(`[Instagram Webhook][${msgLogId}] 📨 [${msg.type}] from=${msg.senderIdentifier.substring(0, 6)}***`);

    const { claimMessage, bufferAndDebounce, bufferInDB } = await import("@/lib/ai/debounce");
    const claimed = await claimMessage(msg.providerMessageId);
    if (!claimed) {
      console.log(`[Instagram Webhook][${msgLogId}] 🔁 Dedup hit — already processed.`);
      continue;
    }

    const { body: messageText, metadata: mediaMetadata } = await routeMedia(
      msg,
      channel.access_token ?? "",
      msg.providerMessageId
    );

    if (!messageText) {
      console.warn(`[Instagram Webhook][${msgLogId}] ⚠️ Empty body after media routing, skipping.`);
      continue;
    }

    const debouncePromise = (async () => {
      const metadataContext = {
        ...mediaMetadata,
        channelProvider: "instagram",
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
        console.log(`[Instagram Webhook][${msgLogId}] ✅ Flushed successfully.`);
      } catch (err: any) {
        console.error(`[Instagram Webhook][${msgLogId}] 💥 Debounce failed: ${err.message}`);
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
          console.log(`[Instagram Webhook][${msgLogId}] 🛟 Buffered to DB fallback.`);
        } catch (dbErr: any) {
          console.error(`[Instagram Webhook][${msgLogId}] 💥 DB fallback also failed: ${dbErr.message}`);
        }
      }
    })();

    pendingPromises.push(debouncePromise);
  }

  if (pendingPromises.length > 0) {
    await Promise.allSettled(pendingPromises);
  }

  console.log(`[Instagram Webhook][${webId}] 🏁 Done in ${Date.now() - start}ms`);
}
