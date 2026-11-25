import crypto from 'crypto';

/**
 * Compares two hexadecimal strings in constant time without ever throwing RangeError.
 * Rejects non-hex strings, odd-length hex strings, or mismatched lengths.
 */
export function safeTimingEqualHex(expectedHex: string, actualHex: string): boolean {
  if (!expectedHex || !actualHex) return false;
  if (expectedHex.length !== actualHex.length) return false;
  if (expectedHex.length % 2 !== 0) return false;
  if (!/^[0-9a-f]+$/i.test(expectedHex) || !/^[0-9a-f]+$/i.test(actualHex)) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = Buffer.from(actualHex, 'hex');
  if (expectedBuf.length !== actualBuf.length || expectedBuf.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Compares two arbitrary UTF-8 strings in constant time via SHA-256 digests,
 * avoiding length-leak timing side channels and RangeError on different sizes.
 */
export function safeTimingEqualText(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}

/**
 * Verifies an Authorization: Bearer <secret> header in constant time.
 */
export function verifyBearerSecret(
  authHeader: string | null | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || !authHeader) return false;
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;
  const provided = authHeader.slice(prefix.length);
  if (!provided) return false;
  return safeTimingEqualText(provided, expectedSecret);
}
