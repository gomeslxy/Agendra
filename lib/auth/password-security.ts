import { createHash } from 'crypto';

/**
 * Leaked-password protection (HaveIBeenPwned k-anonymity range API).
 *
 * Implemented in-app because the Supabase Auth dashboard toggle for HIBP is not
 * reachable from our tooling. Same outcome: reject passwords known to be compromised.
 *
 * k-anonymity: we hash the password with SHA-1, send only the first 5 hex chars of
 * the digest to the range API, and match the suffix locally — the full password (and
 * even its full hash) never leaves the server. No API key required.
 *
 * Fails OPEN: if the API is unreachable or slow, we do not block the user (matching
 * Supabase's own behaviour). The check is defense-in-depth, not the only gate.
 */
export async function isPasswordCompromised(password: string): Promise<boolean> {
  if (!password) return false;
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let body: string;
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
      });
      if (!res.ok) return false; // fail open
      body = await res.text();
    } finally {
      clearTimeout(timer);
    }

    // Each line: "<SUFFIX>:<count>". Compromised if our suffix appears with count > 0.
    for (const line of body.split('\n')) {
      const [lineSuffix, countStr] = line.trim().split(':');
      if (lineSuffix === suffix) {
        return Number(countStr) > 0;
      }
    }
    return false;
  } catch {
    return false; // network/abort → fail open
  }
}

export const COMPROMISED_PASSWORD_MESSAGE =
  'Esta senha apareceu em vazamentos de dados conhecidos. Por segurança, escolha uma senha diferente.';
