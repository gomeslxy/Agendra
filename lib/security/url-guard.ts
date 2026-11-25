import { isIP } from 'net';
import { lookup } from 'dns/promises';

// RFC 5735 / RFC 1918 / RFC 6598 private + CGNAT + link-local + loopback ranges
const PRIVATE_CIDRS: [number, number][] = [
  // loopback 127.0.0.0/8
  [0x7f000000, 0xff000000],
  // link-local 169.254.0.0/16 (AWS/GCP metadata)
  [0xa9fe0000, 0xffff0000],
  // RFC-1918 10.0.0.0/8
  [0x0a000000, 0xff000000],
  // RFC-1918 172.16.0.0/12
  [0xac100000, 0xfff00000],
  // RFC-1918 192.168.0.0/16
  [0xc0a80000, 0xffff0000],
  // CGNAT RFC-6598 100.64.0.0/10
  [0x64400000, 0xffc00000],
  // Broadcast / "this" network 0.0.0.0/8
  [0x00000000, 0xff000000],
  // Multicast 224.0.0.0/4
  [0xe0000000, 0xf0000000],
];

const META_MEDIA_HOST_PATTERNS: RegExp[] = [
  /^graph\.facebook\.com$/i,
  /^lookaside\.fbsbx\.com$/i,
  /\.fbcdn\.net$/i,
  /\.cdninstagram\.com$/i,
  /\.whatsapp\.net$/i,
  /^scontent[^.]*\.cdninstagram\.com$/i,
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

export function isPrivateIpAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = ipToInt(ip);
    return PRIVATE_CIDRS.some(([net, mask]) => ((n & mask) >>> 0) === (net >>> 0));
  }
  if (family === 6) {
    const normalized = ip.toLowerCase();
    // Handle IPv4-mapped IPv6 in dotted (::ffff:127.0.0.1) or WHATWG-normalized hex (::ffff:7f00:1) form
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (isIP(mapped) === 4) return isPrivateIpAddress(mapped);
      const hexParts = mapped.split(':');
      if (hexParts.length === 2 && /^[0-9a-f]{1,4}$/.test(hexParts[0]) && /^[0-9a-f]{1,4}$/.test(hexParts[1])) {
        const hi = parseInt(hexParts[0], 16);
        const lo = parseInt(hexParts[1], 16);
        const ipv4Int = ((hi << 16) | lo) >>> 0;
        return PRIVATE_CIDRS.some(([net, mask]) => ((ipv4Int & mask) >>> 0) === (net >>> 0));
      }
    }
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe80:') || // link-local
      normalized.startsWith('fc') || // ULA fc00::/7
      normalized.startsWith('fd') ||
      normalized.startsWith('ff') // multicast
    );
  }
  return true;
}

/**
 * Synchronous heuristic check for private/internal URLs before persistence or fetch.
 */
export function isPrivateUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true;
  }

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return true;

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') return true;
  if (isIP(hostname) !== 0) return isPrivateIpAddress(hostname);
  if (/\.(local|internal|localhost|intranet|corp|lan)$/.test(hostname)) return true;

  return false;
}

/**
 * Full SSRF check with DNS resolution (`dns.lookup`) to mitigate DNS rebinding.
 */
export async function isPrivateUrlAsync(rawUrl: string): Promise<boolean> {
  if (isPrivateUrl(rawUrl)) return true;

  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }

  if (isIP(hostname) !== 0) {
    return isPrivateIpAddress(hostname);
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) return true;
    return records.some((rec) => isPrivateIpAddress(rec.address));
  } catch {
    // Fail-closed on DNS failure
    return true;
  }
}

/**
 * Strict allowlist for direct media URLs coming from Meta (WhatsApp / Instagram).
 */
export function isAllowedMetaMediaUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (isPrivateUrl(rawUrl)) return false;

  const hostname = parsed.hostname.toLowerCase();
  return META_MEDIA_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Validates a webhook URL is safe for outbound dispatch.
 */
export function assertSafeWebhookUrl(url: string): void {
  if (!url) throw new Error('URL é obrigatória.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL inválida.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('URL deve usar protocolo http ou https.');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('URL deve usar HTTPS em produção.');
  }
  if (isPrivateUrl(url)) {
    throw new Error('URL aponta para endereço privado ou interno. Use uma URL pública.');
  }
}
