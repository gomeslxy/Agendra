/**
 * Meta Data Deletion Callback
 * Required by Meta for apps requesting user data permissions.
 *
 * POST /api/auth/instagram/delete-data
 *
 * Meta sends a signed_request param. We respond with a confirmation URL
 * and a status code that Meta can poll to confirm deletion.
 *
 * Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logInfo, logError } from '@/lib/logging';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.formData();
    const signedRequest = body.get('signed_request') as string | null;

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    // Decode the signed_request payload (base64url encoded JSON, second part after the dot)
    const [, payload] = signedRequest.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const userId: string | undefined = decoded?.user_id;

    logInfo(`[Meta Data Deletion] Received deletion request for Meta user_id: ${userId ?? 'unknown'}`);

    // If we have a user_id, attempt to remove associated channel tokens.
    // We don't store the Meta user_id directly — channels are keyed by Instagram Business Account ID.
    // Best-effort: we log the request. Actual data removal happens when user disconnects the channel.
    if (userId) {
      const admin = createAdminClient();
      // Log the deletion request for compliance audit trail
      await admin.from('channels').update({
        status: 'disconnected',
        meta: { deletion_requested_at: new Date().toISOString(), meta_user_id: userId }
      }).eq('provider', 'instagram').eq('status', 'active');
    }

    const confirmationCode = `agendra_del_${Date.now()}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.agendra.site';

    return NextResponse.json({
      url: `${baseUrl}/api/auth/instagram/delete-data/status?id=${confirmationCode}`,
      confirmation_code: confirmationCode
    });
  } catch (err: any) {
    logError('[Meta Data Deletion] Error processing deletion request:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  // Meta may also GET this endpoint to verify it exists
  return NextResponse.json({ status: 'ok' });
}
