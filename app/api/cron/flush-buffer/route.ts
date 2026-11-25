/**
 * /api/cron/flush-buffer — high-frequency drain of the SQL message_buffer fallback.
 *
 * Called by pg_cron `agendra_flush_buffer` every minute via pg_net (GET + Bearer CRON_SECRET),
 * and by QStash fast-requeue retries (POST + Upstash-Signature or Bearer CRON_SECRET).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { flushMessageBuffer } from '@/lib/ai/buffer-flush';
import { verifyQstashSignature } from '@/lib/infra/qstash';
import { verifyBearerSecret } from '@/lib/security/crypto-compare';
import { logError, logInfo } from '@/lib/logging';

export const maxDuration = 300;

function isAuthorizedCron(req: NextRequest): boolean {
  return verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET);
}

async function handleFlushBuffer(): Promise<NextResponse> {
  const admin = createAdminClient();
  try {
    const result = await flushMessageBuffer(admin, {
      rowLimit: 30,
      timeBudgetMs: 240_000,
    });
    if (result.flushed > 0 || result.aborted) {
      logInfo('[cron/flush-buffer]', result);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[cron/flush-buffer] failed:', message);
    return NextResponse.json({ error: message || 'flush failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleFlushBuffer();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');

  const cronOk = isAuthorizedCron(req);
  const qstashOk = signature ? await verifyQstashSignature(signature, rawBody) : false;

  if (!cronOk && !qstashOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleFlushBuffer();
}
