import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleIncomingMessage } from '@/lib/ai/engine';
import { getCompanyUsage } from '@/lib/billing/limits';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows } = await admin.from('message_buffer')
    .select('*').eq('flushed', false).lte('flush_after', new Date().toISOString())
    .order('created_at', { ascending: true }).limit(100);

  if (!rows?.length) return NextResponse.json({ flushed: 0 });

  // Agrupa por (companyId, leadPhone) e concatena bodies
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.company_id}:${r.lead_phone}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  let flushed = 0;
  for (const items of groups.values()) {
    const usage = await getCompanyUsage(items[0].company_id);
    const consolidated = items.map(i => i.body).join('\n');
    const mergedMetadata = items.reduce((acc, i) => ({ ...acc, ...(i.metadata ?? {}) }), {});

    try {
      await handleIncomingMessage(
        items[0].company_id, items[0].lead_phone,
        items[0].lead_name ?? '', consolidated,
        items[0].provider_message_id, usage,
        { ...mergedMetadata, debounce_batch_size: items.length, via_sql_fallback: true }
      );
      await admin.from('message_buffer').update({ flushed: true })
        .in('provider_message_id', items.map(i => i.provider_message_id));
      flushed += items.length;
    } catch (err: any) {
      console.error('[flush-buffer] err:', err.message);
    }
  }

  return NextResponse.json({ flushed });
}
