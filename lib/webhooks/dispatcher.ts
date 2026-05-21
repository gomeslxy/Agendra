/**
 * Webhook Dispatcher — Agendra
 *
 * Dispara eventos assíncronos para URLs externas cadastradas por empresa.
 * Utiliza HMAC-SHA256 para assinatura de payload (cabeçalho: x-agendra-signature).
 *
 * IMPORTANTE: Esta função deve ser chamada de forma não-bloqueante com `void dispatchWebhook(...)`.
 * Ela não propaga erros para não interromper o fluxo principal da IA.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

export type WebhookEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'lead.qualified'
  | 'lead.disqualified'
  | 'lead.status_changed'
  | 'reactivation.sent';

export interface WebhookPayload {
  event: WebhookEventType;
  company_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Gera assinatura HMAC-SHA256 para o payload serializado.
 * O receptor deve comparar com: HMAC-SHA256(secret, rawBody).
 */
function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Despacha um evento de webhook para todos os endpoints inscritos da empresa.
 * Filtra apenas assinaturas ativas que cobrem o tipo de evento.
 *
 * @param companyId - UUID da empresa
 * @param event     - Tipo do evento (ex: 'booking.created')
 * @param data      - Payload específico do evento
 */
export async function dispatchWebhook(
  companyId: string,
  event: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();

    // 1. Verificar plano: apenas Business tem webhooks
    const { data: company } = await admin
      .from('companies')
      .select('plan_type')
      .eq('id', companyId)
      .single();

    if (!company || company.plan_type !== 'business') return;

    // 2. Buscar assinaturas ativas para este evento
    const { data: subscriptions, error } = await admin
      .from('webhook_subscriptions')
      .select('id, url, secret, event_types')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (error || !subscriptions?.length) return;

    const payload: WebhookPayload = {
      event,
      company_id: companyId,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    // 3. Disparar para cada URL inscrita no evento
    const targets = subscriptions.filter(
      (s) => !s.event_types?.length || s.event_types.includes(event)
    );

    await Promise.allSettled(
      targets.map(async (sub) => {
        const signature = signPayload(sub.secret, body);
        let lastError: string | null = null;

        try {
          const response = await fetch(sub.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-agendra-signature': `sha256=${signature}`,
              'x-agendra-event': event,
              'x-agendra-timestamp': payload.timestamp,
              'User-Agent': 'Agendra-Webhooks/1.0',
            },
            body,
            signal: AbortSignal.timeout(5000), // 5s timeout
          });

          if (!response.ok) {
            lastError = `HTTP ${response.status} ${response.statusText}`;
          }
        } catch (err: any) {
          lastError = err?.message ?? 'Unknown error';
        }

        // 4. Atualizar registro de último disparo (não-bloqueante)
        const updatePatch: Record<string, unknown> = {
          last_fired_at: new Date().toISOString(),
        };
        if (lastError) {
          updatePatch.last_error = lastError.slice(0, 500);
        } else {
          updatePatch.last_error = null;
        }

        await admin
          .from('webhook_subscriptions')
          .update(updatePatch)
          .eq('id', sub.id)
          .eq('company_id', companyId); // Segurança extra
      })
    );
  } catch (err) {
    // Nunca propaga — não deve interromper o fluxo principal
    console.error('[WebhookDispatcher] Falha ao despachar webhook:', err);
  }
}
