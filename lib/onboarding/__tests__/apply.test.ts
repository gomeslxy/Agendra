// lib/onboarding/__tests__/apply.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPersonaConfig, buildAiGreeting } from '../apply';
import type { OnboardingData } from '../types';

// Mock the admin client module
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { applyOnboardingConfig } from '../apply';

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

describe('applyOnboardingConfig', () => {
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();
  const mockFrom = vi.fn();

  beforeEach(() => {
    mockEq.mockReturnValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
  });

  it('returns ok:true on success', async () => {
    const result = await applyOnboardingConfig('company-123', fullData);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns ok:false when companyId is empty', async () => {
    const result = await applyOnboardingConfig('', fullData);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('companyId is required');
  });

  it('returns ok:false when Supabase returns error', async () => {
    mockEq.mockReturnValue({ error: { message: 'DB error' } });
    const result = await applyOnboardingConfig('company-123', fullData);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('DB error');
  });

  it('updates companies table with correct onboarding fields', async () => {
    await applyOnboardingConfig('company-123', fullData);
    expect(mockFrom).toHaveBeenCalledWith('companies');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_status: 'completed',
        ai_name: 'Sofia',
        ai_tone: 'friendly',
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'company-123');
  });
});
