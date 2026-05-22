import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Placeholder cron job - implement actual logic later
  return NextResponse.json({ ok: true, job: 'followup' });
}
