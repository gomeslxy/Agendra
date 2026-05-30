import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../intent';

describe('classifyIntent', () => {
  it('classifies bare greetings (no tools, no RAG)', () => {
    for (const msg of ['oi', 'Olá', 'bom dia', 'boa tarde!', 'opa', 'e aí', 'tudo bem?', 'voltei']) {
      const r = classifyIntent(msg);
      expect(r.type, msg).toBe('greeting');
      expect(r.needsTools, msg).toBe(false);
      expect(r.needsRAG, msg).toBe(false);
    }
  });

  it('classifies scheduling intent and skips RAG', () => {
    for (const msg of ['quero agendar um corte', 'tem horário terça?', 'pode marcar amanhã de manhã?', 'queria remarcar meu horário']) {
      const r = classifyIntent(msg);
      expect(r.type, msg).toBe('scheduling');
      expect(r.schedulingSignal, msg).toBe(true);
      expect(r.needsTools, msg).toBe(true);
      expect(r.needsRAG, msg).toBe(false);
    }
  });

  it('classifies informational questions as needing RAG but not tools', () => {
    for (const msg of ['qual o preço do corte?', 'onde fica a clínica?', 'como funciona o atendimento?']) {
      const r = classifyIntent(msg);
      expect(r.type, msg).toBe('info');
      expect(r.needsRAG, msg).toBe(true);
      expect(r.needsTools, msg).toBe(false);
    }
  });

  it('classifies complaints as needing tools (escalation) and RAG', () => {
    for (const msg of ['isso é péssimo, quero reembolso', 'o serviço não funcionou', 'quero cancelar, fui enganado']) {
      const r = classifyIntent(msg);
      expect(r.type, msg).toBe('complaint');
      expect(r.needsTools, msg).toBe(true);
    }
  });

  it('detects urgency independent of type', () => {
    expect(classifyIntent('preciso agendar AGORA, urgente').urgent).toBe(true);
    expect(classifyIntent('quanto custa?').urgent).toBe(false);
  });

  it('defaults ambiguous messages to info (safe: no tools, RAG on)', () => {
    const r = classifyIntent('mais ou menos isso');
    expect(r.type).toBe('info');
    expect(r.needsTools).toBe(false);
  });

  it('handles empty/whitespace input without throwing', () => {
    expect(() => classifyIntent('')).not.toThrow();
    expect(classifyIntent('   ').type).toBe('info');
  });

  it('prioritizes complaint over scheduling when both present', () => {
    // "cancelar" matches scheduling regex but complaint takes precedence
    const r = classifyIntent('que serviço péssimo, quero cancelar meu horário');
    expect(r.type).toBe('complaint');
  });
});
