// lib/onboarding/__tests__/apply.test.ts
import { describe, it, expect } from 'vitest';
import { buildPersonaConfig, buildAiGreeting } from '../apply';
import type { OnboardingData } from '../types';

const fullData: OnboardingData = {
  company_name: 'Studio Bella',
  niche: 'salão de beleza',
  size: 'small',
  goal: 'convert',
  maturity: 'beginner',
  channels: ['whatsapp'],
  uses_crm: false,
  ai_name: 'Sofia',
  ai_tone: 'friendly',
  timezone: 'America/Sao_Paulo',
  working_hours: { mon: ['09:00', '18:00'] },
  team_size: 3,
  primary_metric: 'appointments',
};

describe('buildPersonaConfig', () => {
  it('builds correct persona_config from full data', () => {
    const config = buildPersonaConfig(fullData);
    expect(config.name).toBe('Sofia');
    expect(config.business_name).toBe('Studio Bella');
    expect(config.business_type).toBe('salão de beleza');
    expect(config.tone).toBe('friendly');
    expect(config.timezone).toBe('America/Sao_Paulo');
    expect(config.slot_duration_minutes).toBe(60);
    expect(config.working_hours).toEqual({ mon: ['09:00', '18:00'] });
  });

  it('uses safe defaults when fields missing', () => {
    const config = buildPersonaConfig({});
    expect(config.name).toBe('Assistente');
    expect(config.business_name).toBe('');
    expect(config.tone).toBe('friendly');
    expect(config.timezone).toBe('America/Sao_Paulo');
    expect(config.working_hours).toMatchObject({ mon: ['09:00', '18:00'] });
  });
});

describe('buildAiGreeting', () => {
  it('builds greeting with name and company', () => {
    const greeting = buildAiGreeting(fullData);
    expect(greeting).toBe('Olá! Sou Sofia, assistente virtual de Studio Bella. Como posso ajudar?');
  });

  it('uses fallbacks when fields missing', () => {
    const greeting = buildAiGreeting({});
    expect(greeting).toBe('Olá! Sou Assistente, assistente virtual de nossa empresa. Como posso ajudar?');
  });
});
