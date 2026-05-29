/**
 * Internal debounce-flush endpoint — invoked by QStash after the debounce delay.
 *
 * Security: every request MUST carry a valid `Upstash-Signature` produced with
 * our QStash signing keys. Unsigned/invalid requests are rejected (fail-closed
 * in production). This endpoint is NOT meant to be called by clients.
 *
 * The actual AI turn runs inside the Active Deadline Supervisor so the router
 * can adapt to the remaining function budget and clean up gracefully.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyQstashSignature } from '@/lib/infra/qstash';
import { flushBuffer, type FlushJob } from '@/lib/ai/debounce';
import { runWithDeadline } from '@/lib/ai/deadline';

export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get('upstash-signature');

  const valid = await verifyQstashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let job: FlushJob;
  try {
    job = JSON.parse(rawBody) as FlushJob;
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  if (!job?.companyId || !job?.leadPhone || !job?.gen) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    await runWithDeadline(() => flushBuffer(job));
  } catch (err: any) {
    // Return 500 so QStash retries (the engine already released locks / handed
    // off on a deadline bail; a retry is harmless thanks to the gen-token guard
    // and processed_messages dedup).
    console.error('[flush] processing failed:', err?.message ?? err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
