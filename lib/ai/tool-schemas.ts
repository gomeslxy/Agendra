import type { NeutralToolDefinition } from './providers/types';

const baseDefs: NeutralToolDefinition[] = [
  {
    name: 'listServices',
    description: 'Lista todos os serviços, preços e durações oferecidos pela empresa.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'checkAvailability',
    description:
      'Consulta horários disponíveis nos próximos dias. ' +
      'Obrigatório informar o service_id para calcular a duração correta.',
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'ID do serviço desejado' },
        days_ahead: { type: 'number', description: 'Dias à frente (padrão 7)' },
      },
      required: ['service_id'],
    },
  },
  {
    name: 'bookAppointment',
    description:
      'Cria um novo agendamento. Use após o lead escolher um horário de checkAvailability. ' +
      'IMPORTANTE: start_time DEVE ser o valor "start" ISO retornado por checkAvailability, NUNCA reconstrua o horário manualmente.',
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'ID do serviço' },
        start_time: {
          type: 'string',
          description:
            'ISO 8601 — OBRIGATORIAMENTE use o campo "start" do slot retornado por checkAvailability. Nunca tente reconstruir manualmente.',
        },
        notes: { type: 'string', description: 'Observações adicionais' },
      },
      required: ['service_id', 'start_time'],
    },
  },
  {
    name: 'cancelAppointment',
    description: 'Cancela um agendamento existente do lead.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID do agendamento (do myAppointments)' },
        reason: { type: 'string', description: 'Motivo do cancelamento' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'rescheduleAppointment',
    description: 'Altera o horário de um agendamento existente.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID do agendamento' },
        new_start_time: { type: 'string', description: 'Novo ISO 8601 de início' },
      },
      required: ['event_id', 'new_start_time'],
    },
  },
  {
    name: 'myAppointments',
    description: 'Lista todos os agendamentos futuros do lead.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'updateLeadInfo',
    description: 'Atualiza email, cidade ou origem do lead.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        city: { type: 'string' },
        source: { type: 'string' },
      },
    },
  },
  {
    name: 'updateLeadMemory',
    description: 'Atualiza a memória estratégica e comportamental do lead.',
    parameters: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          format: 'enum',
          enum: [
            'showed_interest', 'objection_raised', 'slot_shown', 'slot_declined',
            'booked', 'no_show', 'reactivated', 'disqualified',
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
  },
  {
    name: 'requestHumanAgent',
    description:
      'Pausa o atendimento da IA e solicita a intervenção de um atendente humano. ' +
      'Use quando o lead demonstrar irritação, pedir explicitamente por um humano ou se o problema for complexo demais para a IA.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Breve motivo da transferência' },
      },
    },
  },
];

const fintechDefs: NeutralToolDefinition[] =
  process.env.ENABLE_FINTECH === 'true'
    ? [
        {
          name: 'generatePixCharge',
          description:
            'Gera cobrança Pix para o lead confirmar agendamento. Use SOMENTE em planos Business após qualificar o agendamento.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Valor em reais (ex: 150.00)' },
              service_id: { type: 'string', description: 'ID do serviço cobrado' },
            },
            required: ['amount'],
          },
        },
        {
          name: 'checkPaymentStatus',
          description: 'Verifica se uma cobrança Pix foi paga.',
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
        },
      ]
    : [];

export const neutralToolDefinitions: NeutralToolDefinition[] = [...baseDefs, ...fintechDefs];
