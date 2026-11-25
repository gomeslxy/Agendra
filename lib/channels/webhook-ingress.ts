import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from './registry';
import type { ChannelProvider } from './types';
import { resolveChannelRoute } from './channel-cache';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { claimMessage, bufferAndQueueMessage } from '@/lib/ai/debounce';
import { safeTimingEqualHex, safeTimingEqualText } from '@/lib/security/crypto-compare';
import { isDebug, logDebug, logError, logInfo } from '@/lib/logging';

export interface MetaWebhookVerifyOptions {
  verifyTokenEnv: 'WHATSAPP_VERIFY_TOKEN' | 'INSTAGRAM_VERIFY_TOKEN';
  label: string;
}

export interface MetaWebhookPostOptions {
  appSecretEnv: 'WHATSAPP_APP_SECRET' | 'INSTAGRAM_APP_SECRET';
  providerOverride?: ChannelProvider;
  label: string;
}

function validateMetaSignature(
  request: NextRequest,
  rawBody: string,
  appSecret: string | undefined,
  label: string,
): boolean {
  if (!appSecret) {
    if (process.env.NODE_ENV === 'development') {
      logInfo(`[${label}] Secret not configured — allowing in dev.`);
      return true;
    }
    logError(`[${label}] App secret missing in production. Request rejected.`);
    return false;
  }

  const signature = request.headers.get('x-hub-signature-256');
  if (!signature || !signature.startsWith('sha256=')) {
    logError(`[${label}] Missing or malformed x-hub-signature-256 header.`);
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const actualSignature = signature.slice('sha256='.length).trim();
  const isValid = safeTimingEqualHex(expectedSignature, actualSignature);
  if (!isValid) {
    logError(`[${label}] Invalid HMAC signature.`);
  }
  return isValid;
}

export async function handleMetaWebhookVerify(
  request: NextRequest,
  opts: MetaWebhookVerifyOptions,
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token') ?? '';
  const challenge = searchParams.get('hub.challenge');

  if (mode !== 'subscribe') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const verifyToken = process.env[opts.verifyTokenEnv];
  if (!verifyToken) {
    logError(`[${opts.label}] ${opts.verifyTokenEnv} not configured.`);
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!safeTimingEqualText(token, verifyToken)) {
    logError(`[${opts.label}] Verification token mismatch.`);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  logInfo(`[${opts.label}] Webhook verified successfully.`);
  return new NextResponse(challenge, { status: 200 });
}

export async function handleMetaWebhookPost(
  request: NextRequest,
  opts: MetaWebhookPostOptions,
): Promise<NextResponse> {
  const start = Date.now();
  const rawBody = await request.text();
  if (isDebug) logDebug(`[${opts.label}] Raw body`, rawBody);

  const appSecret = process.env[opts.appSecretEnv];
  if (!validateMetaSignature(request, rawBody, appSecret, opts.label)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as { object?: string };
    const objectType = payload.object;

    let provider: ChannelProvider;
    if (opts.providerOverride) {
      if (
        (opts.providerOverride === 'instagram' && objectType !== 'instagram') ||
        (opts.providerOverride === 'whatsapp' && objectType !== 'whatsapp_business_account')
      ) {
        logInfo(`[${opts.label}] Unexpected object type: ${String(objectType)}`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }
      provider = opts.providerOverride;
    } else if (objectType === 'whatsapp_business_account') {
      provider = 'whatsapp';
    } else if (objectType === 'instagram') {
      provider = 'instagram';
    } else {
      logInfo(`[${opts.label}] Unsupported object type: ${String(objectType)}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const adapter = getAdapter(provider);
    const parsed = await adapter.parseWebhookPayload(rawBody, request.headers);

    if (parsed.messages.length === 0) {
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const channel = await resolveChannelRoute(provider, parsed.channelProviderId);
    if (!channel) {
      logInfo(`[${opts.label}] Channel not found for ${provider}:${parsed.channelProviderId}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    if (channel.status !== 'active') {
      logInfo(`[${opts.label}] Channel ${channel.id} not active (${channel.status})`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    if (channel.subscriptionStatus === 'canceled') {
      logInfo(`[${opts.label}] Subscription canceled for company ${channel.companyId}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const companyId = channel.companyId;
    const isCompanyAllowed = await checkRateLimitAsync(`flood:${companyId}`, 20, 10_000);
    if (!isCompanyAllowed) {
      logInfo(`[${opts.label}] Tenant flood protection triggered for company ${companyId}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const sideEffects: Promise<unknown>[] = [];

    for (const msg of parsed.messages) {
      const msgLogId = msg.providerMessageId.slice(-8);

      const isLeadAllowed = await checkRateLimitAsync(
        `flood:${companyId}:${msg.senderIdentifier}`,
        5,
        10_000,
      );
      if (!isLeadAllowed) {
        logInfo(`[${opts.label}][${msgLogId}] Lead flood limit for ${msg.senderIdentifier}`);
        continue;
      }

      const claimed = await claimMessage(msg.providerMessageId);
      if (!claimed) {
        logDebug(`[${opts.label}][${msgLogId}] Deduplication hit — already processed`);
        continue;
      }

      if (adapter.sendTypingIndicator && channel.accessToken) {
        sideEffects.push(
          adapter
            .sendTypingIndicator(
              {
                id: channel.id,
                companyId,
                provider,
                providerId: channel.providerId,
                accessToken: channel.accessToken,
                meta: channel.meta,
                status: channel.status,
              },
              msg.providerMessageId,
            )
            .catch(() => {}),
        );
      }

      const mediaMetadata: Record<string, unknown> = {};
      if (msg.type !== 'text') {
        if (msg.mediaId) mediaMetadata.mediaId = msg.mediaId;
        if (msg.mediaMimeType) mediaMetadata.mediaMimeType = msg.mediaMimeType;
      }

      // Durable PG enqueue + QStash schedule BEFORE returning 200 OK
      await bufferAndQueueMessage({
        companyId,
        leadPhone: msg.senderIdentifier,
        leadName: msg.senderName,
        body: msg.text || '',
        providerMessageId: msg.providerMessageId,
        msgType: msg.type,
        metadata: {
          ...mediaMetadata,
          channelProvider: provider,
          channelId: channel.id,
          received_at: start,
        },
      });
    }

    if (sideEffects.length > 0) {
      await Promise.allSettled(sideEffects);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`[${opts.label}] Webhook payload processing failed:`, msg);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
