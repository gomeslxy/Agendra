import { isIP } from 'net';

// RFC 5735 / RFC 1918 private + link-local + loopback ranges
const PRIVATE_CIDRS: [number, number, number][] = [
  // loopback 127.0.0.0/8
  [0x7f000000, 0xff000000, 4],
  // link-local 169.254.0.0/16 (AWS/GCP metadata)
  [0xa9fe0000, 0xffff0000, 4],
  // RFC-1918 10.0.0.0/8
  [0x0a000000, 0xff000000, 4],
  // RFC-1918 172.16.0.0/12
  [0xac100000, 0xfff00000, 4],
  // RFC-1918 192.168.0.0/16
  [0xc0a80000, 0xffff0000, 4],
  // Broadcast 0.0.0.0/8
  [0x00000000, 0xff000000, 4],
  // Multicast 224.0.0.0/4
  [0xe0000000, 0xf0000000, 4],
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipToInt(ip);
  return PRIVATE_CIDRS.filter(([, , v]) => v === 4).some(([net, mask]) => (n & mask) === net);
}

/**
 * Returns true if `rawUrl` points to a private/internal address — block before fetch.
 * Defends against SSRF via webhook URLs registered by tenants.
 */
export function isPrivateUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true; // unparseable URL → treat as private/blocked
  }

  // Only allow HTTPS in production
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return true;

  const hostname = parsed.hostname.toLowerCase();

  // Explicit loopback names
  if (hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0') return true;

  // Raw IPv4
  if (isIP(hostname) === 4) return isPrivateIpv4(hostname);

  // Raw IPv6 — block all for simplicity (internal infrastructure uses domain names)
  if (isIP(hostname) === 6) return true;

  // DNS rebinding: block .local, .internal, .localhost TLDs
  if (/\.(local|internal|localhost|intranet|corp|lan)$/.test(hostname)) return true;

  return false;
}

/**
 * Validates a webhook URL is safe for outbound dispatch.
 * Throws with a user-facing message if invalid.
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
