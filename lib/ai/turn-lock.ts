import type { createAdminClient } from '@/lib/supabase/admin';
import type { Lead } from '@/lib/types/database';
import { logDebug, logError, logInfo } from '@/lib/logging';
import { TURN_BUDGET_MS } from './deadline';
import { EMPTY_MEMORY } from './memory';

type Admin = ReturnType<typeof createAdminClient>;

export const LOCK_REQUEUE_BASE_DELAY_MS = 5_000;
export const LOCK_REQUEUE_MAX_DELAY_MS = 60_000;
export const MAX_LOCK_REQUEUES = 8;
export const STALE_LOCK_MS = TURN_BUDGET_MS + 30_000;

export interface AcquireLeadLockParams {
  companyId: string;
  phone: string;
  senderName: string;
  channel: string;
  channelId: string | null;
  existingLead?: Lead | null;
}

export interface AcquireLeadLockResult {
  acquired: boolean;
  lead: Lead;
  previousLastMessageAt: string | null;
}

function buildLockUpdatePayload(controlMode?: string | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    is_processing: true,
    processing_started_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
  };
  if (controlMode !== 'shadow') {
    payload.followup_count = 0;
  }
  return payload;
}

async function tryAcquireOnExistingLead(
  admin: Admin,
  companyId: string,
  lead: Lead,
): Promise<boolean> {
  const updatePayload = buildLockUpdatePayload(lead.control_mode);

  const { data: locked } = await admin
    .from('leads')
    .update(updatePayload)
    .eq('id', lead.id)
    .eq('company_id', companyId)
    .eq('is_processing', false)
    .select('id')
    .maybeSingle();

  if (locked) {
    return true;
  }

  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data: reclaimed } = await admin
    .from('leads')
    .update(updatePayload)
    .eq('id', lead.id)
    .eq('company_id', companyId)
    .eq('is_processing', true)
    .lt('processing_started_at', staleBefore)
    .select('id')
    .maybeSingle();

  if (reclaimed) {
    logInfo(`[TurnLock] Reclaimed stale lock for lead=${lead.id}`);
    return true;
  }

  return false;
}

/**
 * Adquire lock de turno para o lead ou cria o lead atomicamente quando inédito.
 * Usa a RPC `acquire_or_create_lead_turn_lock` quando disponível e mantém fallback JS seguro
 * para ambientes legados/testes onde a RPC ainda não existe.
 */
export async function acquireOrCreateLeadLock(
  admin: Admin,
  params: AcquireLeadLockParams,
): Promise<AcquireLeadLockResult> {
  const useLegacy = process.env.USE_LEGACY_TURN_LOCK === 'true';

  if (!useLegacy && typeof admin.rpc === 'function') {
    const { data, error } = await admin.rpc('acquire_or_create_lead_turn_lock', {
      p_company_id: params.companyId,
      p_phone: params.phone,
      p_name: params.senderName,
      p_channel: params.channel,
      p_channel_id: params.channelId,
      p_stale_after_ms: STALE_LOCK_MS,
    });

    if (!error && data) {
      const row = Array.isArray(data)
        ? (data[0] as {
            acquired: boolean;
            lead_row: Lead | null;
            previous_last_message_at: string | null;
          } | undefined)
        : (data as {
            acquired: boolean;
            lead_row: Lead | null;
            previous_last_message_at: string | null;
          });

      if (row?.lead_row) {
        return {
          acquired: Boolean(row.acquired),
          lead: row.lead_row,
          previousLastMessageAt: row.previous_last_message_at ?? null,
        };
      }
    } else if (error) {
      const errCode = (error as { code?: string }).code;
      const isMissingRpc =
        errCode === 'PGRST202' ||
        /acquire_or_create_lead_turn_lock/.test(error.message ?? '');
      if (!isMissingRpc) {
        logError('[TurnLock] RPC acquire_or_create_lead_turn_lock failed:', error.message);
      }
    }
  }

  // Fallback JS seguro (também usado quando existingLead já veio carregado em mocks sem RPC)
  let currentLead = params.existingLead ?? null;
  if (!currentLead) {
    const { data: fetched } = await admin
      .from('leads')
      .select('*')
      .eq('company_id', params.companyId)
      .eq('phone', params.phone)
      .maybeSingle();
    currentLead = (fetched as Lead | null) ?? null;
  }

  if (currentLead) {
    const previousLastMessageAt = currentLead.last_message_at ?? null;
    logDebug('Attempting atomic lock acquisition for existing lead');
    const acquired = await tryAcquireOnExistingLead(admin, params.companyId, currentLead);
    return { acquired, lead: currentLead, previousLastMessageAt };
  }

  // Lead inédito: tenta INSERT já travado
  const { data: created, error: createErr } = await admin
    .from('leads')
    .insert({
      company_id: params.companyId,
      name: params.senderName,
      phone: params.phone,
      channel: params.channel,
      channel_id: params.channelId,
      lead_memory: EMPTY_MEMORY,
      is_processing: true,
      processing_started_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      followup_count: 0,
    })
    .select()
    .single();

  if (created) {
    return {
      acquired: true,
      lead: created as Lead,
      previousLastMessageAt: null,
    };
  }

  // P0-ENG-04: Race na criação concorrente — re-SELECT + tentativa obrigatória de lock/reclaim
  logError(
    `[TurnLock] lead insert race (${(createErr as { code?: string } | null)?.code ?? 'unknown'}) — re-selecting and acquiring lock`,
  );
  const { data: existing } = await admin
    .from('leads')
    .select('*')
    .eq('company_id', params.companyId)
    .eq('phone', params.phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    throw new Error(`Falha ao criar lead: ${createErr?.message ?? 'unknown'}`);
  }

  const existingLead = existing as Lead;
  const acquired = await tryAcquireOnExistingLead(admin, params.companyId, existingLead);
  return {
    acquired,
    lead: existingLead,
    previousLastMessageAt: existingLead.last_message_at ?? null,
  };
}

export interface RequeueTurnParams {
  companyId: string;
  phone: string;
  senderName: string;
  messageText: string;
  providerMessageId?: string;
  traceId: string;
  requeueCount: number;
  incomingMetadata?: Record<string, unknown>;
  preSavedIds: string[];
}

export async function requeueTurn(
  admin: Admin,
  params: RequeueTurnParams,
): Promise<{ status: 'requeued'; nextFlushAt: string; requeueCount: number } | { status: 'exhausted' }> {
  if (params.requeueCount >= MAX_LOCK_REQUEUES) {
    if (params.providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'error', error_message: 'lead lock contention' })
        .eq('provider_message_id', params.providerMessageId);
    }
    return { status: 'exhausted' };
  }

  const delayMs = Math.min(
    LOCK_REQUEUE_BASE_DELAY_MS * 2 ** params.requeueCount,
    LOCK_REQUEUE_MAX_DELAY_MS,
  );
  const nextFlushAt = new Date(Date.now() + delayMs).toISOString();
  const requeueId = params.providerMessageId ?? `requeue:${params.traceId}`;

  const { error: requeueErr } = await admin.from('message_buffer').upsert(
    {
      provider_message_id: requeueId,
      company_id: params.companyId,
      lead_phone: params.phone,
      lead_name: params.senderName,
      body: params.messageText,
      msg_type: 'text',
      metadata: {
        ...(params.incomingMetadata ?? {}),
        requeue_count: params.requeueCount + 1,
        ...(params.preSavedIds.length > 0 ? { pre_persisted_ids: params.preSavedIds } : {}),
      },
      flush_after: nextFlushAt,
      flushed: false,
    },
    { onConflict: 'provider_message_id' },
  );

  if (requeueErr) {
    logError('[TurnLock] requeue insert failed:', requeueErr.message);
    if (params.providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'error', error_message: 'lead lock contention' })
        .eq('provider_message_id', params.providerMessageId);
    }
    return { status: 'exhausted' };
  }

  // Fast requeue retry via QStash POST /api/cron/flush-buffer
  try {
    const { qstashEnabled, client: qstashClient, publicBaseUrl } = await import(
      '@/lib/infra/qstash'
    );
    if (qstashEnabled()) {
      const delaySec = Math.ceil(delayMs / 1000);
      await qstashClient().publishJSON({
        url: `${publicBaseUrl()}/api/cron/flush-buffer`,
        body: {},
        delay: delaySec,
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        retries: 1,
      });
      logDebug(`[TurnLock] scheduled QStash flush-buffer retry in ${delaySec}s`);
    }
  } catch (qstashErr: unknown) {
    const msg = qstashErr instanceof Error ? qstashErr.message : String(qstashErr);
    logError('[TurnLock] failed to schedule QStash flush-buffer retry:', msg);
  }

  if (params.providerMessageId) {
    const { error: delErr } = await admin
      .from('processed_messages')
      .delete()
      .eq('provider_message_id', params.providerMessageId);
    if (delErr) {
      logError('[TurnLock] requeue dedup release failed:', delErr.message);
    }
  }

  return {
    status: 'requeued',
    nextFlushAt,
    requeueCount: params.requeueCount + 1,
  };
}

export async function releaseLeadLock(
  admin: Admin,
  companyId: string,
  leadId: string,
  lastMessageId?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    is_processing: false,
    processing_started_at: null,
  };
  if (lastMessageId !== undefined) {
    patch.last_message_id = lastMessageId;
  }
  await admin
    .from('leads')
    .update(patch)
    .eq('id', leadId)
    .eq('company_id', companyId);
}
