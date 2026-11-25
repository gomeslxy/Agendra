import { z } from 'zod';
import {
  type FunctionDeclaration,
  type FunctionDeclarationSchema,
  type Schema,
  SchemaType,
} from '@google/generative-ai';
import { redis, isAvailable as isRedisAvailable } from '@/lib/infra/redis';
import { logDebug, logError } from '@/lib/logging';
import type { NeutralProperty, NeutralToolDefinition } from '../providers/types';
import { ToolValidationError } from '../error-sanitizer';
import { withTimeout } from '../timeout';
import type { ToolContext } from './types';
import {
  handleBookAppointment,
  handleCancelAppointment,
  handleGetAvailableSlots,
  handleListServices,
  handleMyAppointments,
  handleRescheduleAppointment,
} from './scheduling-tools';
import {
  handleRequestHumanAgent,
  handleUpdateLeadInfo,
  handleUpdateLeadMemory,
} from './crm-tools';
import { handleCheckPaymentStatus, handleGeneratePixCharge } from './payment-tools';

const TOOL_TIMEOUT_MS = 12_000;
const IDEM_TTL_SEC = 300;
const localIdemCache = new Map<string, { value: unknown; expiresAt: number }>();

export const ListServicesArgsSchema = z.object({});

export const GetAvailableSlotsArgsSchema = z.object({
  service_id: z.string().uuid('service_id deve ser um UUID válido do catálogo'),
  days_ahead: z.number().int().min(1).max(14).optional(),
  date_hint: z.string().max(80).optional(),
  timezone: z.string().min(3).max(64).default('America/Sao_Paulo'),
});

export const BookAppointmentArgsSchema = z.object({
  service_id: z.string().uuid('service_id deve ser um UUID válido do catálogo'),
  start_time: z
    .string()
    .datetime({ offset: true, message: 'start_time deve ser ISO 8601 com timezone' }),
  notes: z.string().max(500).optional(),
});

export const CancelAppointmentArgsSchema = z.object({
  event_id: z.string().uuid('event_id deve ser um UUID válido obtido via myAppointments'),
  reason: z.string().max(500).optional(),
  date_hint: z.string().max(80).optional(),
  service_hint: z.string().max(120).optional(),
  time_hint: z.string().max(80).optional(),
});

export const RescheduleAppointmentArgsSchema = z.object({
  event_id: z.string().uuid('event_id deve ser um UUID válido obtido via myAppointments'),
  new_start_time: z
    .string()
    .datetime({ offset: true, message: 'new_start_time deve ser ISO 8601 com timezone' }),
  date_hint: z.string().max(80).optional(),
  service_hint: z.string().max(120).optional(),
});

export const MyAppointmentsArgsSchema = z.object({});

export const UpdateLeadInfoArgsSchema = z.object({
  email: z.string().email('email inválido').optional(),
  city: z.string().min(1).max(120).optional(),
  source: z.string().min(1).max(120).optional(),
});

export const UpdateLeadMemoryArgsSchema = z.object({
  event_type: z.enum([
    'showed_interest',
    'objection_raised',
    'slot_shown',
    'slot_declined',
    'booked',
    'no_show',
    'reactivated',
    'disqualified',
  ]),
  note: z.string().max(500).optional(),
  services_mentioned: z.array(z.string().max(120)).optional(),
  objection: z.string().max(300).optional(),
  answers: z.record(z.string(), z.string()).optional(),
  intent_signal: z.string().max(200).optional(),
});

export const RequestHumanAgentArgsSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const GeneratePixChargeArgsSchema = z.object({
  amount: z.number().positive('amount deve ser maior que zero'),
  service_id: z.string().uuid('service_id deve ser um UUID válido').optional(),
});

export const CheckPaymentStatusArgsSchema = z.object({
  transaction_id: z.string().uuid('transaction_id deve ser um UUID válido'),
});

export interface ToolSpec<TSchema extends z.ZodTypeAny = z.ZodTypeAny, TResult = unknown> {
  name: string;
  description: string;
  mutatesExternalState: boolean;
  isEnabled?: () => boolean;
  schema: TSchema;
  parameters: NeutralToolDefinition['parameters'];
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<TResult>;
}

const isFintechEnabled = (): boolean => process.env.ENABLE_FINTECH === 'true';

const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'listServices',
    description:
      'Lista todos os serviços, preços e durações oferecidos pela empresa. ' +
      'Use quando o lead perguntar quais serviços estão disponíveis ou o que a empresa faz. ' +
      'NÃO use se o lead já especificou o serviço que deseja.',
    mutatesExternalState: false,
    schema: ListServicesArgsSchema,
    parameters: { type: 'object', properties: {}, required: [] },
    execute: (args, ctx) => handleListServices(args as Record<string, never>, ctx),
  },
  {
    name: 'get_available_slots',
    description:
      'Consulta horários disponíveis nos próximos dias para um serviço específico em um fuso horário definido. ' +
      'Use quando o lead demonstrar interesse real em agendar um serviço específico. ' +
      'OBRIGATÓRIO informar o service_id e o timezone (fuso horário).',
    mutatesExternalState: false,
    schema: GetAvailableSlotsArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'ID do serviço desejado' },
        days_ahead: { type: 'number', description: 'Dias à frente (padrão 7)' },
        date_hint: {
          type: 'string',
          description: 'Dica de data mencionada pelo lead (ex: "hoje", "amanhã", "terça") para otimizar a busca',
        },
        timezone: {
          type: 'string',
          description: 'Timezone do lead/tenant (ex: "America/Sao_Paulo", "America/Manaus", "America/Bahia")',
        },
      },
      required: ['service_id', 'timezone'],
    },
    execute: (args, ctx) =>
      handleGetAvailableSlots(args as z.infer<typeof GetAvailableSlotsArgsSchema>, ctx),
  },
  {
    name: 'bookAppointment',
    description:
      'Cria um novo agendamento de forma atômica no calendário. ' +
      'Use SOMENTE depois de ter confirmado explicitamente com o lead o serviço, a data e o horário selecionados. ' +
      'IMPORTANTE: start_time DEVE ser exatamente o valor "start" ISO retornado por get_available_slots, NUNCA reconstrua o horário manualmente.',
    mutatesExternalState: true,
    schema: BookAppointmentArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'ID do serviço' },
        start_time: {
          type: 'string',
          description:
            'ISO 8601 — OBRIGATORIAMENTE use o campo "start" do slot retornado por get_available_slots. Nunca tente reconstruir manualmente.',
        },
        notes: { type: 'string', description: 'Observações adicionais' },
      },
      required: ['service_id', 'start_time'],
    },
    execute: (args, ctx) =>
      handleBookAppointment(args as z.infer<typeof BookAppointmentArgsSchema>, ctx),
  },
  {
    name: 'cancelAppointment',
    description:
      'Cancela um agendamento futuro existente do lead. ' +
      'FLUXO OBRIGATÓRIO: (1) Chame myAppointments para obter a lista de agendamentos futuros. ' +
      '(2) Identifique o agendamento correto usando o contexto da conversa (data, serviço, horário). ' +
      '(3) Se houver apenas 1 agendamento, confirme com o lead antes de cancelar. ' +
      '(4) Se houver múltiplos, faça uma pergunta natural para identificar qual o lead deseja cancelar. ' +
      'NUNCA solicite ou mencione o event_id ao cliente — use-o apenas internamente após identificá-lo via myAppointments.',
    mutatesExternalState: true,
    schema: CancelAppointmentArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'ID interno do agendamento — obtido de myAppointments, NUNCA solicitado ao cliente',
        },
        reason: { type: 'string', description: 'Motivo do cancelamento (opcional, inferido da conversa)' },
        date_hint: {
          type: 'string',
          description: 'Data mencionada pelo cliente para ajudar a identificar o agendamento (ex: "amanhã", "sexta")',
        },
        service_hint: {
          type: 'string',
          description: 'Serviço mencionado pelo cliente (ex: "corte", "barba")',
        },
        time_hint: {
          type: 'string',
          description: 'Horário mencionado pelo cliente (ex: "14h", "manhã")',
        },
      },
      required: ['event_id'],
    },
    execute: (args, ctx) =>
      handleCancelAppointment(args as z.infer<typeof CancelAppointmentArgsSchema>, ctx),
  },
  {
    name: 'rescheduleAppointment',
    description:
      'Altera o horário de um agendamento futuro existente do lead. ' +
      'Use quando o lead pedir para mudar, remarcar ou reagendar o seu horário atual. ' +
      'FLUXO OBRIGATÓRIO: (1) Chame myAppointments para obter a lista de agendamentos futuros. ' +
      '(2) Identifique o agendamento correto usando o contexto da conversa. ' +
      '(3) Se houver apenas 1 agendamento, confirme qual é e pergunte o novo horário desejado. ' +
      '(4) Use get_available_slots para verificar disponibilidade do novo horário. ' +
      'NUNCA solicite ou mencione o event_id ao cliente — use-o apenas internamente após identificá-lo via myAppointments.',
    mutatesExternalState: true,
    schema: RescheduleAppointmentArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'ID interno do agendamento — obtido de myAppointments, NUNCA solicitado ao cliente',
        },
        new_start_time: {
          type: 'string',
          description: 'Novo ISO 8601 de início — use o campo "start" exato retornado por get_available_slots',
        },
        date_hint: {
          type: 'string',
          description: 'Data mencionada pelo cliente para ajudar a identificar o agendamento',
        },
        service_hint: { type: 'string', description: 'Serviço mencionado pelo cliente' },
      },
      required: ['event_id', 'new_start_time'],
    },
    execute: (args, ctx) =>
      handleRescheduleAppointment(args as z.infer<typeof RescheduleAppointmentArgsSchema>, ctx),
  },
  {
    name: 'myAppointments',
    description:
      'Lista todos os agendamentos futuros e ativos do lead. ' +
      'Use quando o lead perguntar sobre seus horários marcados ou se tem algum agendamento.',
    mutatesExternalState: false,
    schema: MyAppointmentsArgsSchema,
    parameters: { type: 'object', properties: {}, required: [] },
    execute: (args, ctx) => handleMyAppointments(args as Record<string, never>, ctx),
  },
  {
    name: 'updateLeadInfo',
    description:
      'Atualiza informações cadastrais do lead no CRM (email, cidade ou origem/canal). ' +
      'Use quando o lead informar espontaneamente esses dados na conversa.',
    mutatesExternalState: false,
    schema: UpdateLeadInfoArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        city: { type: 'string' },
        source: { type: 'string' },
      },
    },
    execute: (args, ctx) =>
      handleUpdateLeadInfo(args as z.infer<typeof UpdateLeadInfoArgsSchema>, ctx),
  },
  {
    name: 'updateLeadMemory',
    description:
      'Atualiza a memória comportamental e o funil estratégico do lead no CRM. ' +
      'Use para registrar interesses reais, objeções superadas ou desqualificação. NÃO use para registrar saudações casuais.',
    mutatesExternalState: false,
    schema: UpdateLeadMemoryArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          format: 'enum',
          enum: [
            'showed_interest',
            'objection_raised',
            'slot_shown',
            'slot_declined',
            'booked',
            'no_show',
            'reactivated',
            'disqualified',
          ],
        },
        note: { type: 'string' },
        services_mentioned: { type: 'array', items: { type: 'string' } },
        objection: { type: 'string' },
        answers: { type: 'object', properties: {} },
        intent_signal: { type: 'string' },
      },
      required: ['event_type'],
    },
    execute: (args, ctx) =>
      handleUpdateLeadMemory(args as z.infer<typeof UpdateLeadMemoryArgsSchema>, ctx),
  },
  {
    name: 'requestHumanAgent',
    description:
      'Pausa o atendimento automático da IA e solicita intervenção humana urgente. ' +
      'Use imediatamente quando o lead demonstrar forte irritação, exigir falar com um humano, ou se a dúvida for complexa e fora do escopo comercial/agendamento.',
    mutatesExternalState: true,
    schema: RequestHumanAgentArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Breve motivo da transferência' },
      },
    },
    execute: (args, ctx) =>
      handleRequestHumanAgent(args as z.infer<typeof RequestHumanAgentArgsSchema>, ctx),
  },
  {
    name: 'generatePixCharge',
    description:
      'Gera uma cobrança Pix (QR code e chave copia e cola) para o lead efetuar o pagamento. ' +
      'Use somente após o lead concordar com o agendamento e o valor do serviço em planos pagos que exigem sinal. ' +
      'NÃO use se o lead não aceitou o valor.',
    mutatesExternalState: true,
    isEnabled: isFintechEnabled,
    schema: GeneratePixChargeArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Valor em reais (ex: 150.00)' },
        service_id: { type: 'string', description: 'ID do serviço cobrado' },
      },
      required: ['amount'],
    },
    execute: (args, ctx) =>
      handleGeneratePixCharge(args as z.infer<typeof GeneratePixChargeArgsSchema>, ctx),
  },
  {
    name: 'checkPaymentStatus',
    description:
      'Verifica em tempo real o status de pagamento de uma cobrança Pix gerada anteriormente. ' +
      'Use após enviar a cobrança para validar se o pagamento foi confirmado antes de concluir o agendamento.',
    mutatesExternalState: false,
    isEnabled: isFintechEnabled,
    schema: CheckPaymentStatusArgsSchema,
    parameters: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'ID da transação retornado por generatePixCharge',
        },
      },
      required: ['transaction_id'],
    },
    execute: (args, ctx) =>
      handleCheckPaymentStatus(args as z.infer<typeof CheckPaymentStatusArgsSchema>, ctx),
  },
];

const TOOL_MAP = new Map<string, ToolSpec>(TOOL_SPECS.map((s) => [s.name, s]));

export function getNeutralToolDefinitions(): NeutralToolDefinition[] {
  return TOOL_SPECS.filter((s) => (s.isEnabled ? s.isEnabled() : true)).map((s) => ({
    name: s.name,
    description: s.description,
    parameters: s.parameters,
  }));
}

function mapType(t: NeutralProperty['type']): SchemaType {
  const m: Record<NeutralProperty['type'], SchemaType> = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    boolean: SchemaType.BOOLEAN,
    array: SchemaType.ARRAY,
    object: SchemaType.OBJECT,
  };
  return m[t] ?? SchemaType.STRING;
}

function toGeminiProperty(p: NeutralProperty): Schema {
  const base: Record<string, unknown> = { type: mapType(p.type) };
  if (p.description) base.description = p.description;
  if (p.enum) base.enum = p.enum;
  if (p.format) base.format = p.format;
  if (p.items) base.items = toGeminiProperty(p.items);
  if (p.properties) {
    base.properties = Object.fromEntries(
      Object.entries(p.properties).map(([k, v]) => [k, toGeminiProperty(v)]),
    );
  }
  return base as unknown as Schema;
}

export function toGeminiFunctionDeclarations(): FunctionDeclaration[] {
  return getNeutralToolDefinitions().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([k, v]) => [k, toGeminiProperty(v)]),
      ),
      required: t.parameters.required ?? [],
    } as FunctionDeclarationSchema,
  }));
}

function pruneLocalIdemCache(): void {
  if (localIdemCache.size <= 500) return;
  const now = Date.now();
  for (const [key, entry] of localIdemCache) {
    if (entry.expiresAt <= now) localIdemCache.delete(key);
  }
  while (localIdemCache.size > 500) {
    const oldest = localIdemCache.keys().next().value;
    if (oldest === undefined) break;
    localIdemCache.delete(oldest);
  }
}

async function readIdempotentResult(idemKey: string): Promise<{ hit: boolean; value?: unknown }> {
  const local = localIdemCache.get(idemKey);
  if (local && local.expiresAt > Date.now()) {
    return { hit: true, value: local.value };
  }

  if (isRedisAvailable()) {
    try {
      const raw = await redis.get(idemKey);
      if (raw) {
        return { hit: true, value: JSON.parse(raw) as unknown };
      }
    } catch (err) {
      logError('[ToolRegistry] idempotency read failed (falling back):', err);
    }
  }

  return { hit: false };
}

async function writeIdempotentResult(idemKey: string, value: unknown): Promise<void> {
  pruneLocalIdemCache();
  localIdemCache.set(idemKey, { value, expiresAt: Date.now() + IDEM_TTL_SEC * 1000 });

  if (isRedisAvailable()) {
    try {
      await redis.set(idemKey, JSON.stringify(value), IDEM_TTL_SEC);
    } catch (err) {
      logError('[ToolRegistry] idempotency write failed (non-fatal):', err);
    }
  }
}

export function clearLocalToolIdempotencyCache(): void {
  localIdemCache.clear();
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const canonicalName = name === 'checkAvailability' ? 'get_available_slots' : name;
  const spec = TOOL_MAP.get(canonicalName);

  if (!spec) {
    return { error: 'Ferramenta desconhecida' };
  }

  if (spec.isEnabled && !spec.isEnabled()) {
    throw new ToolValidationError(`A ferramenta ${canonicalName} está desabilitada neste ambiente.`);
  }

  const normalizedInput: Record<string, unknown> =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? { ...(rawArgs as Record<string, unknown>) }
      : {};

  if (canonicalName === 'get_available_slots' && !normalizedInput.timezone) {
    normalizedInput.timezone = ctx.defaultTimezone ?? 'America/Sao_Paulo';
  }

  const parsed = spec.schema.safeParse(normalizedInput);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'args'}: ${issue.message}`)
      .join('; ');
    throw new ToolValidationError(`Argumentos inválidos para ${canonicalName}: ${details}`);
  }

  const idemKey =
    spec.mutatesExternalState && ctx.traceId
      ? `ch:tool_idem:${ctx.traceId}:${canonicalName}`
      : null;

  if (idemKey) {
    const cached = await readIdempotentResult(idemKey);
    if (cached.hit) {
      logDebug(`[ToolRegistry] idempotent hit for ${canonicalName} trace=${ctx.traceId}`);
      return cached.value;
    }
  }

  const result = await withTimeout(
    spec.execute(parsed.data, ctx),
    TOOL_TIMEOUT_MS,
    `tool_timeout:${canonicalName}:${TOOL_TIMEOUT_MS}ms`,
  );

  if (idemKey) {
    await writeIdempotentResult(idemKey, result);
  }

  return result;
}
