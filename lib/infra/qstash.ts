/**
 * QStash — durable, delayed HTTP scheduling for the message debounce window.
 *
 * Instead of blocking a serverless instance with `setTimeout(4000)` (which burns
 * Active CPU and dies if the instance is recycled), we ask QStash to deliver a
 * POST to our internal flush endpoint AFTER a delay. QStash persists the job and
 * retries on failure — fully serverless-native.
 *
 * Configuration (env):
 *   QSTASH_TOKEN               — publish auth token
 *   QSTASH_CURRENT_SIGNING_KEY — verify inbound deliveries
 *   QSTASH_NEXT_SIGNING_KEY    — key rotation support
 *   SERVER_APP_URL / NEXT_PUBLIC_APP_URL — public base URL QStash calls back
 */
import { Client, Receiver } from '@upstash/qstash';

export function qstashEnabled(): boolean {
  if (!process.env.QSTASH_TOKEN) return false;
  const url = publicBaseUrl();
  const isLoopback = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
  return !isLoopback;
}

export function publicBaseUrl(): string {
  return (
    process.env.SERVER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://www.agendra.site'
  ).replace(/\/$/, '');
}

let _client: Client | null = null;
export function client(): Client {
  if (!_client) {
    const token = process.env.QSTASH_TOKEN!;
    const url = process.env.QSTASH_URL;
    _client = new Client({
      token,
      ...(url ? { baseUrl: url } : {}),
    });
  }
  return _client;
}

let _receiver: Receiver | null = null;
function receiver(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  if (!_receiver) _receiver = new Receiver({ currentSigningKey, nextSigningKey });
  return _receiver;
}

/**
 * Schedule a delayed POST to an internal route.
 * @param path absolute path, e.g. "/api/internal/flush"
 * @param body JSON payload
 * @param delaySeconds delivery delay
 * @returns true if the job was accepted by QStash
 */
export async function scheduleDelayed(
  path: string,
  body: unknown,
  delaySeconds: number,
): Promise<boolean> {
  if (!qstashEnabled()) return false;
  await client().publishJSON({
    url: `${publicBaseUrl()}${path}`,
    body,
    delay: delaySeconds,
    retries: 2,
  });
  return true;
}

/**
 * Verify an inbound QStash delivery signature. Returns false when verification
 * fails OR when signing keys aren't configured (fail-closed in production).
 */
export async function verifyQstashSignature(signature: string | null, rawBody: string): Promise<boolean> {
  const r = receiver();
  if (!r) {
    // No keys configured. Allow in dev only.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[QStash] signing keys missing — allowing in non-production.');
      return true;
    }
    console.error('[QStash] signing keys missing in production — rejecting delivery.');
    return false;
  }
  if (!signature) return false;
  try {
    return await r.verify({ signature, body: rawBody });
  } catch (err) {
    console.error('[QStash] signature verification error:', (err as Error).message);
    return false;
  }
}
