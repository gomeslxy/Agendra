/**
 * Sanitização separada por contexto:
 * - `sanitizeAIResponse` (alias `sanitizeClientResponse`): rigorosa para saídas de LLM,
 *   preservando payloads Pix EMV válidos (`000201...6304XXXX`).
 * - `sanitizeOutboundText`: segura para mensagens de operadores humanos (preserva URLs,
 *   UUIDs, chaves, blocos e links enviados pelo time).
 */

const TOOL_NAMES = [
  'bookAppointment',
  'get_available_slots',
  'checkAvailability',
  'listServices',
  'cancelAppointment',
  'rescheduleAppointment',
  'myAppointments',
  'updateLeadInfo',
  'updateLeadMemory',
  'requestHumanAgent',
  'generatePixCharge',
  'checkPaymentStatus',
];

const TECHNICAL_JARGON = [
  'company_id',
  'lead_id',
  'service_id',
  'start_time',
  'end_time',
  'timezone',
  'parameter',
  'argument',
  'metadata',
  'uuid',
  'iso 8601',
  'string',
  'boolean',
  'json',
  'xml',
  'stack trace',
  'system_prompt',
  'userMessage',
  'assistant',
  'timeline',
  'objections_raised',
  'is_paused',
  'control_mode',
];

const PLACEHOLDER_TERMS = [
  'placeholder',
  'inserir',
  'insira',
  'digite',
  'coloque',
  'nome',
  'cliente',
  'data',
  'hora',
  'horário',
  'horario',
  'serviço',
  'servico',
  'empresa',
  'telefone',
  'uuid',
  'id',
  'link',
];

// EMV Pix BR Code starts with 000201 and ends with CRC16 (6304 + 4 hex chars)
const PIX_EMV_REGEX = /000201[0-9A-Za-z./\-@*+_:;,= ]{20,}6304[0-9A-Fa-f]{4}/g;

export function isResponseSuspicious(text: string): boolean {
  if (!text) return false;

  if (/<[a-zA-Z=/!#%_?-][^>]*>?/i.test(text)) return true;
  if (/<=+[^>]*\/*>/i.test(text)) return true;
  if (/<\/[a-zA-Z]+>/i.test(text)) return true;
  if (/\/>/.test(text)) return true;

  if (/{{\s*[\w.-]+\s*}}/i.test(text)) return true;
  if (/\${\s*[\w.-]+\s*}/i.test(text)) return true;
  if (/%[\w.-]+%/i.test(text)) return true;
  if (/__[\w.-]+__/i.test(text)) return true;

  for (const term of PLACEHOLDER_TERMS) {
    const regexBracket = new RegExp(`\\[\\s*${term}\\s*\\]`, 'gi');
    const regexAngle = new RegExp(`<\\s*${term}\\s*>`, 'gi');
    const regexBrace = new RegExp(`{\\s*${term}\\s*}`, 'gi');
    if (regexBracket.test(text) || regexAngle.test(text) || regexBrace.test(text)) return true;
  }

  if (/```json/i.test(text)) return true;
  if (/---JSON---/i.test(text)) return true;
  if (/"(heat_score|status|summary)"\s*:/i.test(text)) return true;

  for (const tool of TOOL_NAMES) {
    const regex = new RegExp(`\\b${tool}\\b`, 'i');
    if (regex.test(text)) return true;
  }

  for (const jargon of TECHNICAL_JARGON) {
    const regex = new RegExp(`\\b${jargon.replace(/_/g, '[_\\s]?')}\\b`, 'i');
    if (regex.test(text)) return true;
  }

  return false;
}

/**
 * Sanitização rigorosa para respostas geradas por IA.
 * Preserva payloads Pix EMV válidos (mesmo que venham cercados por ```).
 */
export function sanitizeAIResponse(text: string): string {
  if (!text) return '';
  let clean = text.trim();

  // Preservar códigos Pix EMV válidos antes de limpar markdown/code blocks
  const preservedPix: string[] = [];
  clean = clean.replace(/```(?:[a-z]+)?\s*(000201[\s\S]*?6304[0-9A-Fa-f]{4})\s*```/g, (_m, pix: string) => {
    const idx = preservedPix.length;
    preservedPix.push(pix.trim());
    return `__PIX_PAYLOAD_${idx}__`;
  });
  clean = clean.replace(PIX_EMV_REGEX, (pix) => {
    const idx = preservedPix.length;
    preservedPix.push(pix.trim());
    return `__PIX_PAYLOAD_${idx}__`;
  });

  // 0. Template variables
  clean = clean.replace(/\${\s*[\w.-]+\s*}/g, '');
  clean = clean.replace(/{{\s*[\w.-]+\s*}}/g, '');

  // 1. Bracketed ID tags and UUIDs
  clean = clean.replace(/\[ID:\s*[^\]]+\]/gi, '');
  clean = clean.replace(/\bID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');
  clean = clean.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');

  // 1b. Markdown json/code blocks
  clean = clean.replace(/```json[\s\S]*?```/gi, '').trim();
  clean = clean.replace(/```[\s\S]*?```/gi, '').trim();

  // 2. Balanced curly brace groups { ... }
  let braceDepth = 0;
  let newClean = '';
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      if (braceDepth > 0) braceDepth--;
    } else if (braceDepth === 0) {
      newClean += char;
    }
  }
  if (braceDepth === 0) {
    clean = newClean.trim();
  }

  // 3. Raw ---JSON---
  clean = clean.replace(/---JSON---/gi, '').trim();

  // 4. XML/HTML tags
  clean = clean.replace(/<=+[^>]*\/*>/gi, '');
  clean = clean.replace(/<[^>]+>/g, '');
  clean = clean.replace(/<[^>]*$/g, '');
  clean = clean.replace(/\/>/g, '');

  // 5. Placeholders (protect __PIX_PAYLOAD_N__ tokens while stripping __VAR__)
  clean = clean.replace(/{{\s*[\w.-]+\s*}}/g, '');
  clean = clean.replace(/{\s*[\w.-]+\s*}/g, '');
  clean = clean.replace(/\${\s*[\w.-]+\s*}/g, '');
  clean = clean.replace(/%[\w.-]+%/g, '');
  clean = clean.replace(/__(?!PIX_PAYLOAD_\d+__)[\w.-]+__/g, '');

  for (const term of PLACEHOLDER_TERMS) {
    const regexBracket = new RegExp(`\\[\\s*${term}\\s*\\]`, 'gi');
    const regexAngle = new RegExp(`<\\s*${term}\\s*>`, 'gi');
    const regexBrace = new RegExp(`{\\s*${term}\\s*}`, 'gi');
    clean = clean.replace(regexBracket, '').replace(regexAngle, '').replace(regexBrace, '');
  }

  // 6. Strip internal tool names
  for (const name of TOOL_NAMES) {
    const regex = new RegExp(`\\b${name}\\b`, 'gi');
    clean = clean.replace(regex, '');
  }

  // 7. Strip jargon
  for (const jargon of TECHNICAL_JARGON) {
    const regex = new RegExp(`\\b${jargon.replace(/_/g, '[_\\s]?')}\\b`, 'gi');
    clean = clean.replace(regex, '');
  }

  // 8. Copy-editing
  clean = clean.replace(/\s+(\.{3,}|[.,!?;:…])/g, '$1');
  clean = clean.replace(/\n{3,}/g, '\n\n');
  clean = clean.replace(/[ \t]{2,}/g, ' ');
  clean = clean.trim();

  // Restore preserved Pix payloads
  preservedPix.forEach((pix, idx) => {
    clean = clean.replace(`__PIX_PAYLOAD_${idx}__`, pix);
  });

  if (!clean.replace(/[.,/#!$%^&*;:{}=\-_`~()?\s]/g, '').trim()) {
    return 'Entendido! Como posso ajudar você hoje?';
  }

  return clean;
}

/**
 * Alias de compatibilidade para callers legados.
 */
export const sanitizeClientResponse = sanitizeAIResponse;

/**
 * Sanitização leve para mensagens enviadas por operadores humanos.
 * Preserva links com UUIDs, blocos de código e texto livre do atendente.
 */
export function sanitizeOutboundText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
