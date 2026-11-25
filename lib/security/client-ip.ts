/**
 * Extracts a trusted client IP address from request headers.
 * Prioritizes platform-verified headers (`x-vercel-forwarded-for`, `x-real-ip`)
 * and only falls back to `x-forwarded-for` outside production.
 */
export function getTrustedClientIp(headers: Headers): string {
  const vercelIp = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercelIp) return vercelIp;

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  if (process.env.NODE_ENV !== 'production') {
    const devForwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (devForwarded) return devForwarded;
  }

  return 'unknown';
}
