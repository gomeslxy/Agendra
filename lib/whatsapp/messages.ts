/**
 * WhatsApp message templates for Agendra.
 * Uses WhatsApp-native formatting: *bold*, _italic_, emojis.
 * NO markdown (**, ##, ---) — those show as raw characters on WhatsApp.
 */

export interface BookingConfirmationParams {
  leadFirstName: string;
  serviceName: string;
  dateStr: string; // e.g. "sexta-feira, 16 de maio"
  timeStr: string; // e.g. "15:00"
  businessName: string;
  notes?: string;
}

export function buildBookingConfirmation(p: BookingConfirmationParams): string {
  return [
    `*Agendamento Confirmado!* ✅`,
    ``,
    `Ola, ${p.leadFirstName}! Seu horario foi reservado com sucesso.`,
    ``,
    `*📋 Detalhes do agendamento*`,
    `Servico: *${p.serviceName}*`,
    `Data: *${p.dateStr}*`,
    `Horario: *${p.timeStr}*`,
    `Local: *${p.businessName}*`,
    p.notes ? `Obs: ${p.notes}` : null,
    ``,
    `_Voce recebera um lembrete antes do horario. Se precisar cancelar ou reagendar, e so me avisar aqui!_ 😊`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export interface ReminderParams {
  leadFirstName: string;
  serviceName: string;
  dateStr: string;
  timeStr: string;
  businessName: string;
  hoursAhead: number;
}

export function buildReminderMessage(p: ReminderParams): string {
  const timeLabel = p.hoursAhead <= 2 ? 'daqui a pouco' : `amanha`;
  return [
    `*Lembrete de Agendamento* 🗓`,
    ``,
    `Oi, ${p.leadFirstName}! Passando para lembrar do seu horario ${timeLabel}.`,
    ``,
    `*${p.serviceName}*`,
    `📅 ${p.dateStr} as ${p.timeStr}`,
    `📍 ${p.businessName}`,
    ``,
    `_Se precisar cancelar ou reagendar, e so responder aqui!_`,
  ].join('\n');
}

export interface CancellationParams {
  leadFirstName: string;
  serviceName: string;
  dateStr: string;
  timeStr: string;
}

export function buildCancellationMessage(p: CancellationParams): string {
  return [
    `*Agendamento Cancelado* ❌`,
    ``,
    `Oi, ${p.leadFirstName}! Confirmamos o cancelamento do seu agendamento.`,
    ``,
    `_${p.serviceName} — ${p.dateStr} as ${p.timeStr}_`,
    ``,
    `Quando quiser remarcar, e so me chamar aqui! 😊`,
  ].join('\n');
}

/** Formats a Date into readable date and time strings in the given IANA timezone. */
export function formatDateTime(
  date: Date,
  timezone: string,
): { dateStr: string; timeStr: string } {
  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return {
    dateStr: dateFmt.format(date),
    timeStr: timeFmt.format(date),
  };
}
