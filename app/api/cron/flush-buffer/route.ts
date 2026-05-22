import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder: Flush any in‑memory buffers or caches.
  return NextResponse.json({ ok: true, message: 'Buffers flushed' });
}

export async function POST() {
  // Placeholder for POST if needed.
  return NextResponse.json({ ok: true });
}
