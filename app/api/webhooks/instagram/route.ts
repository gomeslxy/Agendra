/**
 * Instagram Webhook — Route Handler
 *
 * Dedicated endpoint for the Instagram Business API (separate Meta App).
 * Uses unified durable ingress pipeline with INSTAGRAM_VERIFY_TOKEN / INSTAGRAM_APP_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleMetaWebhookPost, handleMetaWebhookVerify } from '@/lib/channels/webhook-ingress';

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleMetaWebhookVerify(request, {
    verifyTokenEnv: 'INSTAGRAM_VERIFY_TOKEN',
    label: 'Instagram Webhook',
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMetaWebhookPost(request, {
    appSecretEnv: 'INSTAGRAM_APP_SECRET',
    providerOverride: 'instagram',
    label: 'Instagram Webhook',
  });
}
