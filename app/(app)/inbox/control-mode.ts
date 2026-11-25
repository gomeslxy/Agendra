export type LeadControlMode = 'autonomous' | 'shadow' | 'manual';

export interface LeadControlPatch {
  control_mode: LeadControlMode;
  is_paused: boolean;
  human_takeover_at: string | null;
  human_takeover_until: string | null;
  human_takeover_by: string | null;
}

/**
 * Gera o patch determinístico de transição de modo de controle do lead.
 * Tanto `autonomous` quanto `shadow` DEVEM limpar qualquer takeover ativo ou expirado
 * para que o Shadow Mode volte a gerar rascunhos imediatamente.
 */
export function buildControlModePatch(
  mode: LeadControlMode,
  userId: string,
  durationHours = 24,
): LeadControlPatch {
  if (mode === 'manual') {
    const now = new Date();
    return {
      control_mode: 'manual',
      is_paused: true,
      human_takeover_at: now.toISOString(),
      human_takeover_until: new Date(now.getTime() + durationHours * 3_600_000).toISOString(),
      human_takeover_by: userId,
    };
  }

  return {
    control_mode: mode,
    is_paused: false,
    human_takeover_at: null,
    human_takeover_until: null,
    human_takeover_by: null,
  };
}
