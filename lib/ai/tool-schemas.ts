import type { NeutralToolDefinition } from './providers/types';

const baseDefs: NeutralToolDefinition[] = [
  {
    name: 'listServices',
    description:
      'Lista todos os serviços, preços e durações oferecidos pela empresa. ' +
      'Use quando o lead perguntar quais serviços estão disponíveis ou o que a empresa faz. ' +
      'NÃO use se o lead já especificou o serviço que deseja.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'checkAvailability',
    description:
      'Consulta horários disponíveis nos próximos dias para um serviço específico. ' +
      'Use quando o lead demonstrar interesse real em agendar um serviço específico. ' +
      'OBRIGATÓRIO informar o service_id. NÃO use se você ainda não sabe qual serviço o lead deseja agendar.',
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
      'Cria um novo agendamento de forma atômica no calendário. ' +
      'Use SOMENTE depois de ter confirmado explicitamente com o lead o serviço, a data e o horário selecionados. ' +
      'IMPORTANTE: start_time DEVE ser exatamente o valor "start" ISO retornado por checkAvailability, NUNCA reconstrua o horário manualmente.',
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
    description:
      'Cancela um agendamento futuro existente do lead. ' +
      'Use quando o lead solicitar expressamente o cancelamento de um horário agendado.',
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
    description:
      'Altera o horário de um agendamento futuro existente do lead. ' +
      'Use quando o lead pedir para mudar, remarcar ou reagendar o seu horário atual. ' +
      'Exige o event_id e o novo horário (new_start_time).',
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
    description:
      'Lista todos os agendamentos futuros e ativos do lead. ' +
      'Use quando o lead perguntar sobre seus horários marcados ou se tem algum agendamento.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'updateLeadInfo',
    description:
      'Atualiza informações cadastrais do lead no CRM (email, cidade ou origem/canal). ' +
      'Use quando o lead informar espontaneamente esses dados na conversa.',
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
    description:
      'Atualiza a memória comportamental e o funil estratégico do lead no CRM. ' +
      'Use para registrar interesses reais, objeções superadas ou desqualificação. NÃO use para registrar saudações casuais.',
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
      'Pausa o atendimento automático da IA e solicita intervenção humana urgente. ' +
      'Use imediatamente quando o lead demonstrar forte irritação, exigir falar com um humano, ou se a dúvida for complexa e fora do escopo comercial/agendamento.',
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
            'Gera uma cobrança Pix (QR code e chave copia e cola) para o lead efetuar o pagamento. ' +
            'Use somente após o lead concordar com o agendamento e o valor do serviço em planos pagos que exigem sinal. ' +
            'NÃO use se o lead não aceitou o valor.',
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
          description:
            'Verifica em tempo real o status de pagamento de uma cobrança Pix gerada anteriormente. ' +
            'Use após enviar a cobrança para validar se o pagamento foi confirmado antes de concluir o agendamento.',
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
