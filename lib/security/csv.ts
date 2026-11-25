/**
 * Neutralizes CSV formula injection (Excel/Sheets/LibreOffice) and escapes quotes.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const needsPrefix = /^[=+\-@\t\r]/.test(raw) || /^[=+\-@\t\r]/.test(raw.trimStart());
  const safe = needsPrefix ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Escapes PostgREST filter syntax and LIKE wildcards before interpolating into `.or(...)`.
 */
export function escapePostgrestLike(input: string): string {
  return input
    .replace(/[\\(),*]/g, ' ')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .trim();
}
