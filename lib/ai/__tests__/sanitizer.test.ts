import { describe, it, expect } from 'vitest';
import { isResponseSuspicious, sanitizeClientResponse } from '../sanitizer';

describe('AI Sanitization & Anti-Leak Shield', () => {
  describe('isResponseSuspicious', () => {
    it('detects complete and broken XML/HTML tags', () => {
      expect(isResponseSuspicious('Aqui está o seu link: <a href="x">link</a>')).toBe(true);
      expect(isResponseSuspicious('Olá! <=x>/> como vai?')).toBe(true);
      expect(isResponseSuspicious('Temos horários disponíveis <br> hoje.')).toBe(true);
      expect(isResponseSuspicious('Seu agendamento foi feito </book>')).toBe(true);
    });

    it('detects unfinished XML/HTML-like tags', () => {
      expect(isResponseSuspicious('Temos vagas para amanhã <clinica')).toBe(true);
    });

    it('detects template variables and placeholders', () => {
      expect(isResponseSuspicious('Olá, {{nome}}! Como vai?')).toBe(true);
      expect(isResponseSuspicious('Seu serviço de ${servico} está agendado.')).toBe(true);
      expect(isResponseSuspicious('Seu horário é {horario}.')).toBe(true);
      expect(isResponseSuspicious('Obrigado, %cliente%!')).toBe(true);
      expect(isResponseSuspicious('Confirmo para a empresa __EMPRESA__.')).toBe(true);
    });

    it('detects bracketed/angle/brace placeholders with known terms', () => {
      expect(isResponseSuspicious('Olá, [nome]! Qual seu email?')).toBe(true);
      expect(isResponseSuspicious('Escolha o [servico] desejado.')).toBe(true);
      expect(isResponseSuspicious('Confirme a <data> e o <horário>.')).toBe(true);
      expect(isResponseSuspicious('Por favor, preencha o {placeholder}.')).toBe(true);
    });

    it('does NOT trigger false positives for safe brackets and common punctuation', () => {
      expect(isResponseSuspicious('Olá! Tudo bem? :)')).toBe(false);
      expect(isResponseSuspicious('Tenho vaga na segunda-feira [14:00 - 14:30].')).toBe(false);
      expect(isResponseSuspicious('Ficou marcado para o dia 10/12.')).toBe(false);
      expect(isResponseSuspicious('Seu código de confirmação é 992-123.')).toBe(false);
    });

    it('detects internal tool names', () => {
      expect(isResponseSuspicious('Vou chamar a função checkAvailability agora.')).toBe(true);
      expect(isResponseSuspicious('Agendamento feito via bookAppointment.')).toBe(true);
      expect(isResponseSuspicious('Aqui está o myAppointments para você.')).toBe(true);
    });

    it('detects technical database and system jargon', () => {
      expect(isResponseSuspicious('A empresa de company_id 123.')).toBe(true);
      expect(isResponseSuspicious('O id do lead é o lead_id.')).toBe(true);
      expect(isResponseSuspicious('Fuso horário timezone de São Paulo.')).toBe(true);
      expect(isResponseSuspicious('Temos parâmetros start_time inválidos.')).toBe(true);
    });

    it('detects JSON objects and markdown code blocks', () => {
      expect(isResponseSuspicious('Resposta ```json { "heat_score": 100 } ```')).toBe(true);
      expect(isResponseSuspicious('Dados do lead: {"status": "success"}')).toBe(true);
      expect(isResponseSuspicious('Metadata block ---JSON---')).toBe(true);
    });
  });

  describe('sanitizeClientResponse', () => {
    it('completely removes bracketed ID tags and UUIDs', () => {
      const input = 'Seu corte de cabelo [ID: 9c0e5a6a-d2d8-4f18-bb5c-15a9abfae7c9] custa R$ 50.';
      expect(sanitizeClientResponse(input)).toBe('Seu corte de cabelo custa R$ 50.');

      const inputRawUuid = 'Agendamento 9c0e5a6a-d2d8-4f18-bb5c-15a9abfae7c9 confirmado.';
      expect(sanitizeClientResponse(inputRawUuid)).toBe('Agendamento confirmado.');
    });

    it('removes markdown JSON and code blocks completely', () => {
      const input = 'Tudo certo! ```json\n{\n  "heat_score": 85,\n  "status": "warm"\n}\n``` Espero você!';
      expect(sanitizeClientResponse(input)).toBe('Tudo certo! Espero você!');
    });

    it('wipes balanced inline JSON objects', () => {
      const input = 'Olá! Aqui estão as informações { "nome": "Lucas", "cargo": "Admin" } Tenha um bom dia.';
      expect(sanitizeClientResponse(input)).toBe('Olá! Aqui estão as informações Tenha um bom dia.');
    });

    it('removes all complete/incomplete XML/HTML tags and weird constructs', () => {
      expect(sanitizeClientResponse('Clique aqui: <a>link</a>')).toBe('Clique aqui: link');
      expect(sanitizeClientResponse('Erro <=x>/> no sistema.')).toBe('Erro no sistema.');
      expect(sanitizeClientResponse('Temos vagas para amanhã <clinica')).toBe('Temos vagas para amanhã');
    });

    it('removes template variables and placeholder tags', () => {
      expect(sanitizeClientResponse('Olá, {{nome}}! Como vai?')).toBe('Olá,! Como vai?');
      expect(sanitizeClientResponse('Seu corte com {profissional} às ${hora}.')).toBe('Seu corte com às.');
      expect(sanitizeClientResponse('Obrigado, %cliente%!')).toBe('Obrigado,!');
      expect(sanitizeClientResponse('Preencha o [placeholder] com seus dados.')).toBe('Preencha o com seus dados.');
    });

    it('strips internal tool names and technical jargon', () => {
      expect(sanitizeClientResponse('Verificando checkAvailability...')).toBe('Verificando...');
      expect(sanitizeClientResponse('ID da empresa: company_id.')).toBe('ID da empresa:.');
      expect(sanitizeClientResponse('Seu start_time está definido.')).toBe('Seu está definido.');
    });

    it('collapses multiple spacing and newlines', () => {
      const input = 'Olá!   Tudo bem?\n\n\n\nVamos marcar?';
      expect(sanitizeClientResponse(input)).toBe('Olá! Tudo bem?\n\nVamos marcar?');
    });

    it('returns a polite fallback if the message was completely emptied by sanitization', () => {
      const input = '```json { "heat_score": 100 } ``` <br> {{placeholder}} checkAvailability company_id';
      expect(sanitizeClientResponse(input)).toBe('Entendido! Como posso ajudar você hoje?');
    });
  });
});
