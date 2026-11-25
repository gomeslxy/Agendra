/**
 * Internal debounce-flush endpoint — invoked by QStash after the debounce delay.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyQstashSignature } from '@/lib/infra/qstash';
import { flushBuffer } from '@/lib/ai/debounce';
import { runWithDeadline } from '@/lib/ai/deadline';
import { FlushJobSchema } from '@/lib/ai/schemas/analytics.schema';
import { logError } from '@/lib/logging';

export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get('upstash-signature');

  const valid = await verifyQstashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  const parsed = FlushJobSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload fields' }, { status: 400 });
  }

  try {
    await runWithDeadline(() => flushBuffer(parsed.data));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[flush] processing failed:', message);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
