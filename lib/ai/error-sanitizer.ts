/**
 * Centraliza classificação e sanitização de erros das tools de IA.
 * Evita duplicação de `technicalIndicators` entre `engine` e adapters e
 * permite devolver mensagens acionáveis de validação/regra de negócio ao LLM.
 */

export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}

const TECHNICAL_ERROR_INDICATORS = [
  'select',
  'insert',
  'update',
  'delete',
  'postgres',
  'supabase',
  'database',
  'pgrst',
  'gcal',
  'google',
  'calendar',
  'token',
  'unauthorized',
  'jwt',
  'secret',
  'network',
  'fetch',
  'http',
  'timeout',
  'connection',
  'typeerror',
  'syntaxerror',
  'referenceerror',
  'stack',
  'foreign key',
  'unique constraint',
  'violates',
  'internal server error',
];

const FALLBACK_SAFE_ERROR =
  'Não foi possível completar esta ação no momento devido a uma instabilidade temporária. Por favor, tente novamente em instantes ou fale com um de nossos atendentes.';

export function sanitizeToolError(err: unknown): string {
  if (err instanceof ToolValidationError || err instanceof BusinessRuleError) {
    return err.message;
  }

  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  if (!rawMessage) {
    return FALLBACK_SAFE_ERROR;
  }

  const lowercase = rawMessage.toLowerCase();
  const hasTechnicalIndicator = TECHNICAL_ERROR_INDICATORS.some((indicator) =>
    lowercase.includes(indicator),
  );

  return hasTechnicalIndicator ? FALLBACK_SAFE_ERROR : rawMessage;
}
