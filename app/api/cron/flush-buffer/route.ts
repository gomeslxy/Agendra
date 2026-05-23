import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleIncomingMessage } from '@/lib/ai/engine';

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await admin
    .from('message_buffer')
    .select('*')
    .lte('flush_after', now)
    .limit(100)
    .order('flush_after', { ascending: true });

  if (error) {
    console.error('[flush-buffer] DB select error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ ok: true, flushed: 0, groups: 0 });
  }

  // Group by (company_id, lead_phone)
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.company_id}:${row.lead_phone}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let flushed = 0;
  let failed = 0;

  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.flush_after).getTime() - new Date(b.flush_after).getTime());

    const { company_id, lead_phone, lead_name } = group[0];
    const mergedBody = group.map(r => r.body).join('\n');
    const firstId = group[0].provider_message_id;
    const ids = group.map(r => r.id as string);

    // Delete before processing to avoid double-send if the process crashes after
    await admin.from('message_buffer').delete().in('id', ids);

    try {
      await handleIncomingMessage(
        company_id,
        lead_phone,
        lead_name,
        mergedBody,
        firstId,
        undefined,
        {
          flushed_from_db: true,
          batch_size: group.length,
          message_ids: group.map(r => r.provider_message_id),
        },
      );
      flushed += group.length;
    } catch (err: any) {
      console.error(`[flush-buffer] handleIncomingMessage failed for ${lead_phone}:`, err.message);
      failed += group.length;
    }
  }

  console.log(`[flush-buffer] done — flushed=${flushed} failed=${failed} groups=${groups.size}`);
  return NextResponse.json({ ok: true, flushed, failed, groups: groups.size });
}

export async function POST(request: Request) {
  return GET(request);
}
