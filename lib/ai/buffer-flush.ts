/**
 * message_buffer drain — shared helper.
 *
 * Uses `claim_message_buffer_batch` (FOR UPDATE SKIP LOCKED) when deployed to avoid
 * overlapping drains between pg_cron and QStash fast-requeue, with automatic fallback
 * to direct SELECT when the RPC is not yet deployed.
 */
import { handleIncomingMessage } from './engine';
import { getCompanyUsage } from '@/lib/billing/limits';
import { logError, logInfo } from '@/lib/logging';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export interface FlushBufferResult {
  flushed: number;
  groups: number;
  aborted: boolean;
}

export interface FlushBufferOptions {
  rowLimit?: number;
  timeBudgetMs?: number;
}

interface MessageBufferRow {
  provider_message_id: string;
  company_id: string;
  lead_phone: string;
  lead_name: string | null;
  body: string | null;
  msg_type: string;
  metadata: Record<string, unknown> | null;
  flush_after: string;
  flushed: boolean;
  created_at?: string;
}

async function fetchEligibleRows(admin: Admin, rowLimit: number): Promise<MessageBufferRow[]> {
  if (typeof admin.rpc === 'function') {
    const { data, error } = await admin.rpc('claim_message_buffer_batch', {
      p_row_limit: rowLimit,
      p_lease_seconds: 300,
    });
    if (!error && Array.isArray(data)) {
      return data as MessageBufferRow[];
    }
    if (error) {
      const code = (error as { code?: string }).code;
      const isMissing =
        code === 'PGRST202' || /claim_message_buffer_batch/.test(error.message ?? '');
      if (!isMissing) {
        logError('[flush-buffer] claim_message_buffer_batch RPC failed:', error.message);
      }
    }
  }

  const { data: rows } = await admin
    .from('message_buffer')
    .select('*')
    .eq('flushed', false)
    .lte('flush_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(rowLimit);

  return (rows ?? []) as MessageBufferRow[];
}

export async function flushMessageBuffer(
  admin: Admin,
  opts: FlushBufferOptions = {},
): Promise<FlushBufferResult> {
  const rowLimit = opts.rowLimit ?? 100;
  const timeBudgetMs = opts.timeBudgetMs ?? Number.POSITIVE_INFINITY;
  const startedAt = Date.now();

  const rows = await fetchEligibleRows(admin, rowLimit);
  if (!rows.length) {
    return { flushed: 0, groups: 0, aborted: false };
  }

  const groups = new Map<string, MessageBufferRow[]>();
  for (const r of rows) {
    const k = `${r.company_id}:${r.lead_phone}`;
    const existing = groups.get(k);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(k, [r]);
    }
  }

  let flushed = 0;
  let aborted = false;

  for (const items of groups.values()) {
    if (Date.now() - startedAt > timeBudgetMs) {
      aborted = true;
      break;
    }

    try {
      const usage = await getCompanyUsage(items[0].company_id);
      const consolidated =
        items.length > 1
          ? `[O lead enviou ${items.length} mensagens em sequência:]\n` +
            items.map((i) => i.body ?? '').join('\n')
          : (items[0].body ?? '');

      const receivedAtList = items
        .map((i) => i.metadata?.received_at)
        .filter((v): v is number => typeof v === 'number');
      const minReceivedAt = receivedAtList.length > 0 ? Math.min(...receivedAtList) : undefined;

      const mergedMetadata = items.reduce<Record<string, unknown>>(
        (acc, i) => ({ ...acc, ...(i.metadata ?? {}) }),
        {},
      );
      if (minReceivedAt !== undefined) {
        mergedMetadata.received_at = minReceivedAt;
      }

      const preIds = items
        .map((i) => i.metadata?.pre_message_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      const outcome = await handleIncomingMessage(
        items[0].company_id,
        items[0].lead_phone,
        items[0].lead_name ?? '',
        consolidated,
        items[0].provider_message_id,
        usage,
        {
          ...mergedMetadata,
          attempt_count: Number(mergedMetadata.attempt_count ?? 1),
          debounce_batch_size: items.length,
          debounce_message_ids: items.map((i) => i.provider_message_id),
          via_sql_fallback: true,
          ...(preIds.length > 0 ? { pre_persisted_ids: preIds } : {}),
        },
      );

      if (outcome === 'requeued') {
        const otherIds = items.slice(1).map((i) => i.provider_message_id);
        if (otherIds.length > 0) {
          await admin
            .from('message_buffer')
            .update({ flushed: true })
            .in('provider_message_id', otherIds);
        }
        flushed += otherIds.length;
        continue;
      }

      await admin
        .from('message_buffer')
        .update({ flushed: true })
        .in(
          'provider_message_id',
          items.map((i) => i.provider_message_id),
        );
      flushed += items.length;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logError('[flush-buffer] group error:', errMsg);
      const currentAttempts = Number(items[0].metadata?.attempt_count ?? 1);
      const nextAttempts = currentAttempts + 1;

      const mergedMetadata = items.reduce<Record<string, unknown>>(
        (acc, i) => ({ ...acc, ...(i.metadata ?? {}) }),
        {},
      );

      if (nextAttempts > 3) {
        await admin
          .from('message_buffer')
          .update({
            flushed: true,
            metadata: {
              ...mergedMetadata,
              attempt_count: nextAttempts,
              permanent_failure: true,
              error: errMsg,
            },
          })
          .in(
            'provider_message_id',
            items.map((i) => i.provider_message_id),
          );
      } else {
        const backoffSec = nextAttempts * 30;
        const nextFlushAfter = new Date(Date.now() + backoffSec * 1000).toISOString();
        await admin
          .from('message_buffer')
          .update({
            metadata: { ...mergedMetadata, attempt_count: nextAttempts },
            flush_after: nextFlushAfter,
          })
          .in(
            'provider_message_id',
            items.map((i) => i.provider_message_id),
          );
        logInfo(
          `[flush-buffer] rescheduled group company=${items[0].company_id} retry ${nextAttempts}/3 in +${backoffSec}s`,
        );
      }
    }
  }

  return { flushed, groups: groups.size, aborted };
}
