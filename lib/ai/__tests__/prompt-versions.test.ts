import { describe, it, expect } from 'vitest';

interface PromptVersion {
  id: string;
  company_id: string;
  version: number;
  ai_name: string;
  ai_tone: string;
  system_instructions: string;
  ai_forbidden: string | null;
  created_at: string;
  created_by?: string | null;
}

function calculateNextVersion(existingVersions: { version: number }[]): number {
  if (!existingVersions.length) return 1;
  const maxVersion = Math.max(...existingVersions.map(v => v.version));
  return maxVersion + 1;
}

function buildRollbackPayload(targetVersion: PromptVersion, nextVersion: number, createdByUserId: string) {
  return {
    version: nextVersion,
    ai_name: targetVersion.ai_name,
    ai_tone: targetVersion.ai_tone,
    system_instructions: targetVersion.system_instructions,
    ai_forbidden: targetVersion.ai_forbidden,
    created_by: createdByUserId,
  };
}

describe('Prompt Versioning & Cognitive Control Logic', () => {
  it('calculates initial version as 1 when no history exists', () => {
    expect(calculateNextVersion([])).toBe(1);
  });

  it('increments version sequentially on save', () => {
    const history = [{ version: 1 }, { version: 2 }, { version: 3 }];
    expect(calculateNextVersion(history)).toBe(4);
  });

  it('handles non-sequential historical versions correctly', () => {
    const history = [{ version: 1 }, { version: 5 }];
    expect(calculateNextVersion(history)).toBe(6);
  });

  it('builds a valid rollback payload restoring historical prompt state', () => {
    const v1: PromptVersion = {
      id: 'pv-1',
      company_id: 'cmp-123',
      version: 1,
      ai_name: 'Assistente V1',
      ai_tone: 'Formal',
      system_instructions: 'Regra V1: seja muito direto.',
      ai_forbidden: 'desculpe',
      created_at: new Date().toISOString(),
    };

    const rollback = buildRollbackPayload(v1, 4, 'usr-999');

    expect(rollback.version).toBe(4);
    expect(rollback.ai_name).toBe('Assistente V1');
    expect(rollback.ai_tone).toBe('Formal');
    expect(rollback.system_instructions).toBe('Regra V1: seja muito direto.');
    expect(rollback.ai_forbidden).toBe('desculpe');
    expect(rollback.created_by).toBe('usr-999');
  });
});
