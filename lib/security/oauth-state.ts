import crypto from 'crypto';
import { safeTimingEqualHex, safeTimingEqualText } from './crypto-compare';

export type OAuthProvider = 'google' | 'instagram';

export const OAUTH_NONCE_COOKIE_PREFIX = 'agendra_oauth_nonce_';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthStatePayload {
  companyId: string;
  userId: string;
  provider: OAuthProvider;
  nonce: string;
  exp: number;
}

function getOAuthSigningSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getOAuthSigningSecret())
    .update(encodedPayload, 'utf8')
    .digest('hex');
}

export function getOAuthNonceCookieName(provider: OAuthProvider): string {
  return `${OAUTH_NONCE_COOKIE_PREFIX}${provider}`;
}

/**
 * Generates an HMAC-SHA256 signed OAuth state bound to companyId, userId, provider and a CSPRNG nonce.
 */
export function createSignedOAuthState(params: {
  companyId: string;
  userId: string;
  provider: OAuthProvider;
}): { state: string; nonce: string; cookieName: string } {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: OAuthStatePayload = {
    companyId: params.companyId,
    userId: params.userId,
    provider: params.provider,
    nonce,
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  };

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(encoded);
  return {
    state: `${encoded}.${sig}`,
    nonce,
    cookieName: getOAuthNonceCookieName(params.provider),
  };
}

/**
 * Verifies an HMAC-SHA256 signed OAuth state against expiration, provider, userId and httpOnly nonce cookie.
 */
export function verifySignedOAuthState(params: {
  state: string;
  expectedProvider: OAuthProvider;
  expectedUserId: string;
  cookieNonce: string | undefined;
}): { valid: true; companyId: string } | { valid: false; reason: string } {
  if (!params.state || !params.cookieNonce) {
    return { valid: false, reason: 'missing_state_or_nonce' };
  }

  const dotIdx = params.state.indexOf('.');
  if (dotIdx <= 0 || dotIdx === params.state.length - 1) {
    return { valid: false, reason: 'malformed_state' };
  }

  const encoded = params.state.slice(0, dotIdx);
  const sig = params.state.slice(dotIdx + 1);
  const expectedSig = signPayload(encoded);

  if (!safeTimingEqualHex(expectedSig, sig)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  let parsed: Partial<OAuthStatePayload>;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<OAuthStatePayload>;
  } catch {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (
    !parsed.companyId ||
    !parsed.userId ||
    !parsed.provider ||
    !parsed.nonce ||
    typeof parsed.exp !== 'number'
  ) {
    return { valid: false, reason: 'incomplete_payload' };
  }

  if (Date.now() > parsed.exp) {
    return { valid: false, reason: 'expired' };
  }

  if (parsed.provider !== params.expectedProvider) {
    return { valid: false, reason: 'provider_mismatch' };
  }

  if (!safeTimingEqualText(parsed.userId, params.expectedUserId)) {
    return { valid: false, reason: 'user_mismatch' };
  }

  if (!safeTimingEqualText(parsed.nonce, params.cookieNonce)) {
    return { valid: false, reason: 'nonce_mismatch' };
  }

  return { valid: true, companyId: parsed.companyId };
}
