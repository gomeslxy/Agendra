import { describe, it, expect } from 'vitest';
import { truncateSentences } from '../response-composer';
import { sanitizeAIResponse, sanitizeOutboundText } from '../sanitizer';
import { formatTimeElapsed } from '../prompt-builder';

describe('Response Composer & Context-Aware Sanitizer', () => {
  it('Intl.Segmenter preserves currency (R$ 150.00), abbreviations (Dr. João), and URLs', () => {
    const input =
      'O Dr. João atende amanhã! O valor da consulta é R$ 150.00. Veja detalhes em https://agendra.site/dr.joao/info. Podemos confirmar?';
    const out = truncateSentences(input, 3);
    expect(out).toContain('Dr. João');
    expect(out).toContain('R$ 150.00');
    expect(out).toContain('https://agendra.site/dr.joao/info.');
    expect(out).not.toContain('Podemos confirmar?');
  });

  it('preserves valid EMV Pix payloads inside AI responses', () => {
    const pixCode =
      '00020101021226830014br.gov.bcb.pix2561api.agendra.site/v2/cobv/1234567890123455802BR5920Agendra Tecnologia6009Sao Paulo62070503***6304ABCD';
    const aiReply = `Cobrança Pix gerada:\n\`\`\`\n${pixCode}\n\`\`\``;
    const sanitized = sanitizeAIResponse(aiReply);
    expect(sanitized).toContain(pixCode);
  });

  it('sanitizeOutboundText preserves UUID checkout URLs sent by human operators', () => {
    const humanMsg =
      'Segue seu link de pagamento: https://app.agendra.site/pay/9c0e5a6a-d2d8-4f18-bb5c-15a9abfae7c9';
    expect(sanitizeOutboundText(humanMsg)).toBe(humanMsg);
  });

  it('formatTimeElapsed formats minutes instead of raw seconds (P2-ENG-01)', () => {
    expect(formatTimeElapsed(45 * 60 * 1000)).toBe('45 minutos');
    expect(formatTimeElapsed(60 * 1000)).toBe('1 minuto');
    expect(formatTimeElapsed(2 * 60 * 60 * 1000)).toBe('2 horas');
  });
});
