/**
 * Standalone, dependency-free sanitization engine for client communications.
 * Avoids circular dependencies between engine.ts and send.ts.
 */

// Tool/Function names used internally
const TOOL_NAMES = [
  'bookAppointment', 'get_available_slots', 'checkAvailability', 'listServices', 'cancelAppointment',
  'rescheduleAppointment', 'myAppointments', 'updateLeadInfo', 'updateLeadMemory',
  'requestHumanAgent', 'generatePixCharge', 'checkPaymentStatus'
];

// Jargon and DB keywords that should never leak to the client
const TECHNICAL_JARGON = [
  'company_id', 'lead_id', 'service_id', 'start_time', 'end_time',
  'timezone', 'parameter', 'argument', 'metadata', 'uuid', 'iso 8601',
  'string', 'boolean', 'json', 'xml', 'stack trace', 'system_prompt', 'userMessage',
  'assistant', 'timeline', 'objections_raised', 'is_paused', 'control_mode'
];

// Specific placeholders that indicate template interpolation failure (both accented and unaccented)
const PLACEHOLDER_TERMS = [
  'placeholder', 'inserir', 'insira', 'digite', 'coloque',
  'nome', 'cliente', 'data', 'hora', 'horário', 'horario',
  'serviço', 'servico', 'empresa', 'telefone', 'uuid', 'id', 'link'
];

/**
 * Checks if a response contains suspicious technical artifacts, variables, or broken tags.
 * If true, this triggers the engine's one-shot self-correction flow.
 */
export function isResponseSuspicious(text: string): boolean {
  if (!text) return false;

  // 1. Check for complete or incomplete XML/HTML-like tags, including `<=x>/>`
  if (/<[a-zA-Z=/!#%_?-][^>]*>?/i.test(text)) return true;
  if (/<=+[^>]*\/*>/i.test(text)) return true; // match weird patterns like `<=x>/>`
  if (/<\/[a-zA-Z]+>/i.test(text)) return true; // closing tag
  if (/\/>/.test(text)) return true; // stray XML closing slash

  // 2. Check for template variables and placeholders
  if (/{{\s*[\w.-]+\s*}}/i.test(text)) return true; // {{variable}}
  if (/\${\s*[\w.-]+\s*}/i.test(text)) return true; // ${variable}
  if (/%[\w.-]+%/i.test(text)) return true; // %variable%
  if (/__[\w.-]+__/i.test(text)) return true; // __VARIABLE__

  // Simple brackets/braces/angles containing a known placeholder term
  for (const term of PLACEHOLDER_TERMS) {
    const regexBracket = new RegExp(`\\[\\s*${term}\\s*\\]`, 'gi');
    const regexAngle = new RegExp(`<\\s*${term}\\s*>`, 'gi');
    const regexBrace = new RegExp(`{\\s*${term}\\s*}`, 'gi');
    if (regexBracket.test(text) || regexAngle.test(text) || regexBrace.test(text)) return true;
  }

  // 3. Check for JSON structures or metadata field matches
  if (/```json/i.test(text)) return true;
  if (/---JSON---/i.test(text)) return true;
  if (/"(heat_score|status|summary)"\s*:/i.test(text)) return true; // metadata JSON fields

  // 4. Check for internal tool names
  for (const tool of TOOL_NAMES) {
    const regex = new RegExp(`\\b${tool}\\b`, 'i');
    if (regex.test(text)) return true;
  }

  // 5. Check for technical jargon
  for (const jargon of TECHNICAL_JARGON) {
    const regex = new RegExp(`\\b${jargon.replace(/_/g, '[_\\s]?')}\\b`, 'i');
    if (regex.test(text)) return true;
  }

  return false;
}

/**
 * Aggressive, multi-layered programmatic sanitizer that scrubs out any
 * lingering XML/HTML tags, placeholders, unresolved variables, JSON blocks,
 * and technical jargon, formatting errors, and ensures a clean, standard output.
 */
export function sanitizeClientResponse(text: string): string {
  if (!text) return '';
  let clean = text.trim();

  // 0. Remove template variables starting with $ or double curly braces first to avoid leaving stray characters
  clean = clean.replace(/\${\s*[\w.-]+\s*}/g, '');
  clean = clean.replace(/{{\s*[\w.-]+\s*}}/g, '');

  // 1. Remove bracketed ID tags [ID: ...] or ID: <uuid> patterns to prevent technical leaks
  clean = clean.replace(/\[ID:\s*[^\]]+\]/gi, '');
  clean = clean.replace(/\bID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');
  clean = clean.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');

  // 1b. Remove markdown json/code blocks completely
  clean = clean.replace(/```json[\s\S]*?```/gi, '').trim();
  clean = clean.replace(/```[\s\S]*?```/gi, '').trim();

  // 2. Remove balanced curly brace groups { ... } to completely erase JSON objects/inline JSON
  let braceDepth = 0;
  let newClean = '';
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      if (braceDepth > 0) {
        braceDepth--;
      }
    } else {
      if (braceDepth === 0) {
        newClean += char;
      }
    }
  }
  if (braceDepth === 0) {
    clean = newClean.trim();
  }

  // 3. Remove raw ---JSON--- or ---JSON--- blocks if left over
  clean = clean.replace(/---JSON---/gi, '').trim();

  // 4. Remove all full and partial XML/HTML tags, and weird token constructs like `<=x>/>`
  clean = clean.replace(/<=+[^>]*\/*>/gi, ''); // remove `<=x>/>`
  clean = clean.replace(/<[^>]+>/g, ''); // remove complete tags
  clean = clean.replace(/<[^>]*$/g, ''); // remove incomplete tag at end
  clean = clean.replace(/\/>/g, ''); // remove stray XML closing sequences

  // 5. Remove template variables and placeholders
  clean = clean.replace(/{{\s*[\w.-]+\s*}}/g, '');
  clean = clean.replace(/{\s*[\w.-]+\s*}/g, ''); // standard brace placeholder
  clean = clean.replace(/\${\s*[\w.-]+\s*}/g, '');
  clean = clean.replace(/%[\w.-]+%/g, '');
  clean = clean.replace(/__[\w.-]+__/g, '');

  for (const term of PLACEHOLDER_TERMS) {
    const regexBracket = new RegExp(`\\[\\s*${term}\\s*\\]`, 'gi');
    const regexAngle = new RegExp(`<\\s*${term}\\s*>`, 'gi');
    const regexBrace = new RegExp(`{\\s*${term}\\s*}`, 'gi');
    clean = clean.replace(regexBracket, '').replace(regexAngle, '').replace(regexBrace, '');
  }

  // 6. Strip internal tool/function names completely
  for (const name of TOOL_NAMES) {
    const regex = new RegExp(`\\b${name}\\b`, 'gi');
    clean = clean.replace(regex, '');
  }

  // 7. Remove jargon terms that can leak internal mechanisms
  for (const jargon of TECHNICAL_JARGON) {
    const regex = new RegExp(`\\b${jargon.replace(/_/g, '[_\\s]?')}\\b`, 'gi');
    clean = clean.replace(regex, '');
  }

  // 8. Copy-editing: collapse spacing before punctuation and multiple spaces/newlines
  clean = clean.replace(/\s+(\.{3,}|[.,!?;:…])/g, '$1');
  clean = clean.replace(/\n{3,}/g, '\n\n');
  clean = clean.replace(/[ \t]{2,}/g, ' '); // collapse consecutive spaces/tabs
  clean = clean.trim();

  // 9. If the response became empty or contains only spacing/punctuation after removing technical terms, fallback.
  if (!clean.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '').trim()) {
    return 'Entendido! Como posso ajudar você hoje?';
  }

  return clean;
}
