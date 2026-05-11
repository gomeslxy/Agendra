// lib/ai/scoring.ts
import type { LeadMemory } from '@/lib/types/database';

const OBJECTION_KEYWORDS = [
  'caro', 'não tenho dinheiro', 'tá caro', 'muito caro', 'não posso',
  'sem dinheiro', 'orçamento', 'preciso pensar', 'vou pensar',
  'deixa eu ver', 'não sei', 'talvez', 'talvez não', 'não tenho certeza',
  'vou falar com', 'minha família', 'meu marido', 'minha esposa',
  'não tenho interesse', 'não quero', 'não preciso', 'obrigado não',
];

const INTENT_KEYWORDS = [
  'quero agendar', 'pode agendar', 'vamos marcar', 'quero marcar',
  'sim', 'confirmo', 'pode ser', 'esse horário', 'esse dia',
  'quero esse', 'perfeito', 'ótimo', 'combinado', 'fechado',
  'topo', 'bora', 'vamo', 'vamos', 'pode confirmar',
];

export function detectObjection(message: string): boolean {
  const lower = message.toLowerCase();
  return OBJECTION_KEYWORDS.some((kw) => lower.includes(kw));
}

export function detectIntentSignal(message: string): boolean {
  const lower = message.toLowerCase();
  return INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function validateAndNormalizeScore(
  aiScore: number,
  prevScore: number,
  memory: LeadMemory,
  newMessage: string,
): { score: number; reason: string } {
  let score = aiScore;
  let reason = 'AI assessment';

  // Hard floor: disqualified lead never goes above 20
  if (memory.timeline.some((e) => e.event === 'disqualified')) {
    return { score: Math.min(score, 20), reason: 'lead disqualificado anteriormente' };
  }

  const hasNewObjection = detectObjection(newMessage);
  const hasNoShow = memory.timeline.some((e) => e.event === 'no_show');

  // No-show penalty: -20 off whatever the AI said
  if (hasNoShow) {
    score = Math.max(score - 20, 0);
    reason = 'penalidade por no-show anterior';
  }

  // New objection: cap at 45
  if (hasNewObjection && score > 45) {
    score = 45;
    reason = 'objeção detectada na mensagem';
  }

  const delta = score - prevScore;

  // Drop > 30 without explicit objection: soften to -20
  if (delta < -30 && !hasNewObjection) {
    score = prevScore - 20;
    reason = 'queda suavizada (sem evento explícito)';
  }

  // Rise > 25 without intent signal: soften to +15
  if (delta > 25 && !detectIntentSignal(newMessage)) {
    score = prevScore + 15;
    reason = 'subida suavizada (sem sinal de intenção)';
  }

  return { score: Math.max(0, Math.min(100, score)), reason };
}
