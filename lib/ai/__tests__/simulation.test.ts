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
});
