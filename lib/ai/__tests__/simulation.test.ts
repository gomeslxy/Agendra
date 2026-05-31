// lib/ai/__tests__/simulation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountContext } from '../memory';
import { sanitizeClientResponse, processLeadMessage } from '../engine';
import { routeChat } from '../providers/router';
import type { Lead, Message } from '@/lib/types/database';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        })),
      })),
    })),
  })),
}));

// Mock router
vi.mock('../providers/router', () => ({
  routeChat: vi.fn(),
  routeGenerate: vi.fn(),
}));

describe('Conversational Sales Engine Simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mountContext - Super-Memory', () => {
    it('correctly mounts active objections and pending services in memory', () => {
      const mockMemory = {
        timeline: [{ date: new Date().toISOString(), event: 'first_contact' as const }],
        services_mentioned: ['Corte de Cabelo Premium'],
        objections_raised: ['Preço muito alto'],
        score_history: [],
        last_intent_signal: 'price_inquiry',
        qualification_answers: { 'horário preferido': 'tarde' },
      };

      const context = mountContext(mockMemory, 'Lead em dúvida sobre valores');

      expect(context).toContain('## Memória Estratégica do Lead');
      expect(context).toContain('Situação Atual: Lead em dúvida sobre valores');
      expect(context).toContain('Última Intenção Identificada: price_inquiry');
      expect(context).toContain('Interesse: Corte de Cabelo Premium');
      expect(context).toContain('Objeções: "Preço muito alto"');
      expect(context).toContain('horário preferido: tarde');
    });
  });

  describe('sanitizeClientResponse - Clean and Premium UX', () => {
    it('removes tool/function names and raw JSON blocks completely', () => {
      const input = 'Com certeza! Aqui estão os horários { "heat_score": 100 } ```json { "test": true } ``` checkAvailability.';
      const output = sanitizeClientResponse(input);
      expect(output).toContain('Com certeza! Aqui estão os horários');
      expect(output).not.toContain('checkAvailability');
      expect(output).not.toContain('json');
      expect(output).not.toContain('{');
      expect(output).not.toContain('}');
    });

    it('removes technical database/programming jargon', () => {
      const input = 'O agendamento do lead_id com start_time em formato ISO 8601 e uuid foi concluído.';
      const output = sanitizeClientResponse(input);
      expect(output).not.toContain('lead_id');
      expect(output).not.toContain('start_time');
      expect(output).not.toContain('ISO 8601');
      expect(output).not.toContain('uuid');
      expect(output).toContain('O agendamento do');
    });

    it('returns a fallback message if response becomes entirely empty', () => {
      const input = '```json\n{ "error": true }\n```';
      const output = sanitizeClientResponse(input);
      expect(output).toBe('Entendido! Como posso ajudar você hoje?');
    });

    it('removes internal UUID brackets [ID: ...] or ID formatters', () => {
      const input = 'Corte (30min) - R$35 [ID: 2c125df9-1a4f-45b9-b33c-389f41de6001] e Barba (30min) - R$25 [ID: internal-barba-id]';
      const output = sanitizeClientResponse(input);
      expect(output).not.toContain('[ID:');
      expect(output).not.toContain('2c125df9');
      expect(output).not.toContain('internal-barba-id');
      expect(output).toContain('Corte (30min) - R$35');
      expect(output).toContain('Barba (30min) - R$25');
    });

    it('removes loose raw UUIDs and technical ID prefix patterns', () => {
      const input = 'Seu agendamento tem ID: 2c125df9-1a4f-45b9-b33c-389f41de6001. O UUID dele é 123e4567-e89b-12d3-a456-426614174000.';
      const output = sanitizeClientResponse(input);
      expect(output).not.toContain('2c125df9');
      expect(output).not.toContain('123e4567');
      expect(output).toContain('Seu agendamento tem');
    });
  });

  describe('processLeadMessage - Prompt Compilation & Rules', () => {
    const mockLead = {
      id: 'lead-123',
      company_id: 'company-123',
      name: 'Carlos Santos',
      phone: '5511999999999',
      channel: 'whatsapp' as const,
      status: 'cold' as const,
      summary: 'Conversou sobre barba.',
      heat_score: 10,
      conversation_tone: 'warm' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_paused: false,
      is_processing: false,
      last_message_id: null,
      followup_count: 0,
      lead_memory: {
        timeline: [],
        objections_raised: ['preço'],
        services_mentioned: ['Barba'],
        score_history: [],
        last_intent_signal: '',
        qualification_answers: {},
      },
    } as any as Lead;

    const mockPersona = {
      name: 'Gabi',
      business_name: 'Barbearia Premium',
      business_type: 'Barbearia',
      services: ['Corte - R$60', 'Barba - R$40'],
    };

    it('compiles system prompt with specific active memory context', async () => {
      (routeChat as any).mockResolvedValue({
        text: 'Claro! Posso ajudar.',
        tokensInput: 10,
        tokensOutput: 5,
        toolsCalled: [],
        modelUsed: 'gemini',
        provider: 'gemini',
        fallbackUsed: false,
      });

      await processLeadMessage(
        mockLead,
        [],
        'Quero agendar',
        'company-123',
        mockPersona,
        false,
        'trial',
        { maxLeads: 100, maxChannels: 1, maxCalendars: 1 } as any
      );

      expect(routeChat).toHaveBeenCalled();
      const calledArgs = (routeChat as any).mock.calls[0][0];
      const systemPrompt = calledArgs.systemPrompt;

      expect(systemPrompt).toContain('Carlos');
      expect(systemPrompt).toContain('Barbearia Premium');
      expect(systemPrompt).toContain('Barba');
      expect(systemPrompt).toContain('preço');
    });

    it('injects Seco/Apressado profile when message is short', async () => {
      (routeChat as any).mockResolvedValue({
        text: 'Claro.',
        tokensInput: 10,
        tokensOutput: 5,
        toolsCalled: [],
        modelUsed: 'gemini',
        provider: 'gemini',
        fallbackUsed: false,
      });

      await processLeadMessage(
        mockLead,
        [],
        'preço',
        'company-123',
        mockPersona,
        false,
        'trial',
        { maxLeads: 100, maxChannels: 1, maxCalendars: 1 } as any
      );

      const systemPrompt = (routeChat as any).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('Perfil Comportamental: Lead Seco/Apressado');
    });

    it('injects Confuso/Indeciso profile when message shows confusion', async () => {
      (routeChat as any).mockResolvedValue({
        text: 'Posso simplificar.',
        tokensInput: 10,
        tokensOutput: 5,
        toolsCalled: [],
        modelUsed: 'gemini',
        provider: 'gemini',
        fallbackUsed: false,
      });

      await processLeadMessage(
        mockLead,
        [],
        'não sei como funciona me ajuda',
        'company-123',
        mockPersona,
        false,
        'trial',
        { maxLeads: 100, maxChannels: 1, maxCalendars: 1 } as any
      );

      const systemPrompt = (routeChat as any).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('Perfil Comportamental: Lead Indeciso/Confuso');
    });

    it('injects Super-Memória Resumption Rule when session is expired', async () => {
      (routeChat as any).mockResolvedValue({
        text: 'Olá de volta!',
        tokensInput: 10,
        tokensOutput: 5,
        toolsCalled: [],
        modelUsed: 'gemini',
        provider: 'gemini',
        fallbackUsed: false,
      });

      // Set last_message_at to 2 days ago to trigger isSessionExpired
      const expiredLead = {
        ...mockLead,
        last_message_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      };

      await processLeadMessage(
        expiredLead,
        [],
        'Oi',
        'company-123',
        mockPersona,
        false,
        'trial',
        { maxLeads: 100, maxChannels: 1, maxCalendars: 1 } as any
      );

      const systemPrompt = (routeChat as any).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('Super-Memória Conversacional');
      expect(systemPrompt).toContain('ponte sutil e comercial resgatando o assunto anterior');
    });
  });

  describe('Multiple Messages Splitting & Degradation', () => {
    it('correctly splits response with ---MSG--- delimiter into exactly two parts', () => {
      const reply = 'Olá, Carlos! Tudo bem? assistente da Barbearia Premium. ---MSG--- Como posso te ajudar hoje?';
      const parts = reply.split(/---MSG---/gi).map(p => p.trim()).filter(Boolean);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('Olá, Carlos! Tudo bem? assistente da Barbearia Premium.');
      expect(parts[1]).toBe('Como posso te ajudar hoje?');
    });

    it('degrades and consolidates response into one part if 3 or more parts are generated', () => {
      const reply = 'Olá, Carlos! ---MSG--- Sou a Gabi. ---MSG--- Vamos agendar?';
      let parts = reply.split(/---MSG---/gi).map(p => p.trim()).filter(Boolean);
      if (parts.length > 2) {
        parts = [parts.join('\n\n')];
      }
      expect(parts).toHaveLength(1);
      expect(parts[0]).toBe('Olá, Carlos!\n\nSou a Gabi.\n\nVamos agendar?');
    });
  });
});
