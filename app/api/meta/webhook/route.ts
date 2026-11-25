/**
 * Unified Meta App Webhook — Route Handler
 *
 * GET  → Challenge verification for Meta Developer Console (WHATSAPP_VERIFY_TOKEN)
 * POST → Timing-safe HMAC SHA-256 verification + durable message queueing
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleMetaWebhookPost, handleMetaWebhookVerify } from '@/lib/channels/webhook-ingress';

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleMetaWebhookVerify(request, {
    verifyTokenEnv: 'WHATSAPP_VERIFY_TOKEN',
    label: 'Meta Webhook',
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMetaWebhookPost(request, {
    appSecretEnv: 'WHATSAPP_APP_SECRET',
    label: 'Meta Webhook',
  });
}
