/**
 * Backward-compatible WhatsApp Webhook Proxy Shim
 * 
 * Redirects all GET/POST requests directly to the unified Meta webhook.
 * This guarantees zero downtime and no immediate need to modify the webhook URL
 * in the Meta Developer Console during migration.
 */

import { GET as unifiedGET, POST as unifiedPOST } from '../meta/webhook/route';

export const maxDuration = 300;

export async function GET(request: any) {
  return unifiedGET(request);
}

export async function POST(request: any) {
  return unifiedPOST(request);
}
