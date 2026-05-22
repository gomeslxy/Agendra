import { NextResponse } from 'next/server';

export async function GET() {
  // Placeholder cron job – no operation.
  return NextResponse.json({ ok: true, message: 'Cron executed' });
}
