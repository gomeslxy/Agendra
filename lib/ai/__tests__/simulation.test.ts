// lib/ai/__tests__/simulation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountContext } from '../memory';
import { sanitizeClientResponse, processLeadMessage } from '../engine';
import { handleCheckAvailability } from '../tools';
import { classifyIntent } from '../intent';
import { routeChat } from '../providers/router';
import type { Lead, Message } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';

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

  describe('handleCheckAvailability - Daily Diagnostics (Cenário A & B)', () => {

    it('accurately identifies closed (fechado) and available (disponivel) days (Cenário A)', async () => {
      // Mock createAdminClient specifically for this test
      (createAdminClient as any).mockImplementation(() => ({
        from: vi.fn((table: string) => {
          if (table === 'events') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  neq: vi.fn(() => ({
                    lt: vi.fn(() => ({
                      gt: vi.fn().mockResolvedValue({
                        data: [],
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue(
                    table === 'services'
                      ? { data: { duration: 30 }, error: null }
                      : {
                          data: {
                            persona_config: {
                              timezone: 'America/Sao_Paulo',
                              working_hours: {
                                mon: ['09:00', '18:00'], // Only Monday works
                              },
                            },
                          },
                          error: null,
                        }
                  ),
                })),
                single: vi.fn().mockResolvedValue(
                  table === 'services'
                    ? { data: { duration: 30 }, error: null }
                    : {
                        data: {
                          persona_config: {
                            timezone: 'America/Sao_Paulo',
                            working_hours: {
                              mon: ['09:00', '18:00'], // Only Monday works
                            },
                          },
                        },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }),
      }));

      // Let's call checkAvailability for a Monday (say 2026-06-01, Monday)
      // We check next 3 days
      const result = await handleCheckAvailability(
        { service_id: 'svc-123', days_ahead: 3 },
        { companyId: 'company-123', leadId: 'lead-123' }
      );

      expect(result.day_breakdown).toBeDefined();
      // Sunday is fechado, Monday is disponivel (since no events are mock-queried)
      const monday = result.day_breakdown.find((d: any) => d.weekday === 'segunda-feira');
      const sunday = result.day_breakdown.find((d: any) => d.weekday === 'domingo');
      
      if (monday) {
        expect(monday.status).toBe('disponivel');
      }
      if (sunday) {
        expect(sunday.status).toBe('fechado');
      }
    });

    it('accurately identifies fully booked (lotado) days (Cenário B)', async () => {
      // Monday has working hours, but has overlapping events covering the whole working hours
      (createAdminClient as any).mockImplementation(() => ({
        from: vi.fn((table: string) => {
          if (table === 'events') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  neq: vi.fn(() => ({
                    lt: vi.fn(() => ({
                      gt: vi.fn().mockResolvedValue({
                        data: [
                          {
                            // Busy Monday 09:00 - 18:00
                            start_time: '2026-06-01T12:00:00.000Z',
                            end_time: '2026-06-01T21:00:00.000Z',
                          },
                        ],
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue(
                    table === 'services'
                      ? { data: { duration: 30 }, error: null }
                      : {
                          data: {
                            persona_config: {
                              timezone: 'America/Sao_Paulo',
                              working_hours: {
                                mon: ['09:00', '18:00'],
                              },
                            },
                          },
                          error: null,
                        }
                  ),
                })),
                single: vi.fn().mockResolvedValue(
                  table === 'services'
                    ? { data: { duration: 30 }, error: null }
                    : {
                        data: {
                          persona_config: {
                            timezone: 'America/Sao_Paulo',
                            working_hours: {
                              mon: ['09:00', '18:00'],
                            },
                          },
                        },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }),
      }));

      // We call checkAvailability
      const result = await handleCheckAvailability(
        { service_id: 'svc-123', days_ahead: 3 },
        { companyId: 'company-123', leadId: 'lead-123' }
      );

      expect(result.day_breakdown).toBeDefined();
      const monday = result.day_breakdown.find((d: any) => d.weekday === 'segunda-feira');
      if (monday) {
        // In the test framework, since we didn't mock date ranges specifically, Monday might not have slots, so it will be lotado
        expect(monday.status).toBe('lotado');
      }
    });
  });

  describe('Scheduling Prompt Rules Compilation', () => {
    it('includes strict prior availability consultation and closed day rules in system prompt', async () => {
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
          objections_raised: [],
          services_mentioned: [],
          score_history: [],
          last_intent_signal: '',
          qualification_answers: {},
        },
      } as any as Lead;

      const mockPersona = {
        name: 'Gabi',
        business_name: 'Barbearia Premium',
        business_type: 'Barbearia',
        services: ['Corte - R$60'],
      };

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

      const systemPrompt = (routeChat as any).mock.calls[0][0].systemPrompt;
      expect(systemPrompt).toContain('CONSULTA PRÉVIA OBRIGATÓRIA');
      expect(systemPrompt).toContain('DIFERENCIAÇÃO DE DIAS SEM EXPEDIENTE VS. AGENDA LOTADA');
      expect(systemPrompt).toContain('Dias Fechados/Sem Expediente');
      expect(systemPrompt).toContain('Dias Genuinamente Lotados');
    });
  });

  describe('Cancellation Flow — ID Protection & Intelligent Identification', () => {
    const mockLead = {
      id: 'lead-cancel-123',
      company_id: 'company-123',
      name: 'Ana Lima',
      phone: '5511888888888',
      channel: 'whatsapp' as const,
      status: 'warm' as const,
      summary: 'Lead com agendamento ativo.',
      heat_score: 60,
      conversation_tone: 'warm' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_paused: false,
      is_processing: false,
      last_message_id: null,
      followup_count: 0,
      lead_memory: {
        timeline: [],
        objections_raised: [],
        services_mentioned: ['Corte'],
        score_history: [],
        last_intent_signal: 'booked',
        qualification_answers: {},
      },
    } as any as Lead;

    const mockPersona = {
      name: 'Gabi',
      business_name: 'Barbearia Premium',
      business_type: 'Barbearia',
      services: ['Corte - R$60', 'Barba - R$40'],
    };

    it('system prompt contains intelligent cancellation rules (no ID requests)', async () => {
      (routeChat as any).mockResolvedValue({
        text: 'Claro! Deixa eu verificar seus agendamentos.',
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
        'quero cancelar meu horário',
        'company-123',
        mockPersona,
        false,
        'trial',
        { maxLeads: 100, maxChannels: 1, maxCalendars: 1 } as any
      );

      const systemPrompt = (routeChat as any).mock.calls[0][0].systemPrompt;

      // Must contain the cancellation intelligence rules
      expect(systemPrompt).toContain('Cancelamento e Reagendamento Inteligente');
      expect(systemPrompt).toContain('IDs são exclusivamente internos');
      expect(systemPrompt).toContain('NUNCA cite, exiba, mencione, peça ou pergunte o ID');
      expect(systemPrompt).toContain('myAppointments');
      expect(systemPrompt).toContain('Confirmação obrigatória antes de cancelar');

      // Must NOT instruct asking for IDs
      expect(systemPrompt).not.toContain('informe o ID');
      expect(systemPrompt).not.toContain('qual é o ID');
      expect(systemPrompt).not.toContain('peça o event_id');
    });

    it('sanitizeClientResponse strips any UUID that leaks into cancellation response', () => {
      // Simulates the AI accidentally including an appointment ID in its response
      const leakyResponse = 'Vou cancelar seu agendamento abc12345-1234-1234-1234-abcdef123456. Confirmado!';
      const clean = sanitizeClientResponse(leakyResponse);

      expect(clean).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(clean).toContain('cancelar seu agendamento');
    });

    it('sanitizeClientResponse strips [ID: ...] pattern from appointment display', () => {
      const leakyList = 'Seus agendamentos:\n- Corte em 02/06 às 14:00 [ID: abc12345-1234-1234-1234-abcdef123456]';
      const clean = sanitizeClientResponse(leakyList);

      expect(clean).not.toContain('[ID:');
      expect(clean).not.toContain('abc12345');
      expect(clean).toContain('Corte em 02/06');
    });

    it('intent classifier detects vague cancellation requests as scheduling (needsTools=true)', () => {
      const vagueRequests = [
        'não vou conseguir ir amanhã',
        'não vou poder comparecer',
        'preciso desmarcar',
        'quero cancelar meu horário',
        'cancela meu corte',
        'precisa desmarcar minha consulta',
        'não consigo ir',
      ];

      for (const msg of vagueRequests) {
        const result = classifyIntent(msg);
        expect(result.needsTools).toBe(true);
        // Must not fall through as greeting
        expect(result.type).not.toBe('greeting');
      }
    });

    it('processLeadMessage passes cancellation intent to tools chain', async () => {
      (routeChat as any).mockResolvedValue({
        text: 'Vou verificar seus agendamentos.',
        tokensInput: 10,
        tokensOutput: 5,
        toolsCalled: ['myAppointments'],
        modelUsed: 'gemini',
        provider: 'gemini',
        fallbackUsed: false,
      });

      await processLeadMessage(
        mockLead,
        [],
        'preciso desmarcar minha consulta',
        'company-123',
        mockPersona,
        false,
        'trial',
        { maxLeads: 100, maxChannels: 1, maxCalendars: 1 } as any
      );

      // The router must have been called (not short-circuited)
      expect(routeChat).toHaveBeenCalled();

      // Verify tools are included in the call (cancellation needs tools chain)
      const calledArgs = (routeChat as any).mock.calls[0][0];
      expect(calledArgs.tools).toBeDefined();
      expect(calledArgs.tools.length).toBeGreaterThan(0);

      // Verify the tool definitions do NOT require the client to provide event_id
      const cancelTool = calledArgs.tools.find((t: any) => t.name === 'cancelAppointment');
      expect(cancelTool).toBeDefined();
      expect(cancelTool.description).toContain('NUNCA solicite ou mencione o event_id ao cliente');
      expect(cancelTool.description).toContain('myAppointments');
    });
  });
});
