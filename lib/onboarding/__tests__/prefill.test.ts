// lib/onboarding/__tests__/prefill.test.ts
import { describe, it, expect } from 'vitest';
import { buildPrefillFromLegacy } from '../prefill';

describe('buildPrefillFromLegacy', () => {
  it('returns empty object for company with no data', () => {
    const result = buildPrefillFromLegacy({ name: null });
    expect(result).toEqual({});
  });

  it('maps company name to company_name', () => {
    const result = buildPrefillFromLegacy({ name: 'Studio Bella' });
    expect(result.company_name).toBe('Studio Bella');
  });

  it('maps persona_config.business_type to niche', () => {
    const result = buildPrefillFromLegacy({
      persona_config: { business_type: 'clínica' },
    });
    expect(result.niche).toBe('clínica');
  });

  it('maps ai_name from direct field', () => {
    const result = buildPrefillFromLegacy({ ai_name: 'Sofia' });
    expect(result.ai_name).toBe('Sofia');
  });

  it('maps ai_name from persona_config.name when direct field is absent', () => {
    const result = buildPrefillFromLegacy({
      persona_config: { name: 'Ana' },
    });
    expect(result.ai_name).toBe('Ana');
  });

  it('prefers direct ai_name over persona_config.name', () => {
    const result = buildPrefillFromLegacy({
      ai_name: 'Sofia',
      persona_config: { name: 'Ana' },
    });
    expect(result.ai_name).toBe('Sofia');
  });

  it('maps valid ai_tone (migrates legacy friendly→warm)', () => {
    const result = buildPrefillFromLegacy({ ai_tone: 'friendly' });
    expect(result.ai_tone).toBe('warm');
  });

  it('maps legacy formal→cold', () => {
    const result = buildPrefillFromLegacy({ ai_tone: 'formal' });
    expect(result.ai_tone).toBe('cold');
  });

  it('ignores invalid ai_tone strings', () => {
    const result = buildPrefillFromLegacy({ ai_tone: 'casual' });
    expect(result.ai_tone).toBeUndefined();
  });

  it('returns onboarding_data as-is if already present', () => {
    const existing = { company_name: 'Test', niche: 'tech', ai_name: 'Bot' };
    const result = buildPrefillFromLegacy({
      name: 'Other',
      onboarding_data: existing,
    });
    expect(result).toEqual(existing);
  });

  it('maps working_hours from persona_config', () => {
    const wh = { mon: ['09:00', '18:00'] };
    const result = buildPrefillFromLegacy({
      persona_config: { working_hours: wh },
    });
    expect(result.working_hours).toEqual(wh);
  });

  it('handles null persona_config gracefully', () => {
    const result = buildPrefillFromLegacy({ name: 'Test', persona_config: null });
    expect(result.company_name).toBe('Test');
    expect(result.niche).toBeUndefined();
  });

  it('ignores non-string business_type in persona_config', () => {
    const result = buildPrefillFromLegacy({
      persona_config: { business_type: 123 },
    });
    expect(result.niche).toBeUndefined();
  });

  it('ignores array working_hours in persona_config', () => {
    const result = buildPrefillFromLegacy({
      persona_config: { working_hours: ['invalid'] },
    });
    expect(result.working_hours).toBeUndefined();
  });
});
