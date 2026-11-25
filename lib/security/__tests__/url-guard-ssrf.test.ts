import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLookup = vi.fn();

vi.mock('dns/promises', () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

import {
  isPrivateUrl,
  isPrivateUrlAsync,
  isAllowedMetaMediaUrl,
} from '../url-guard';

describe('URL Guard SSRF & Meta media allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks loopback, link-local metadata, RFC1918 and CGNAT 100.64.0.0/10', () => {
    expect(isPrivateUrl('https://127.0.0.1/hook')).toBe(true);
    expect(isPrivateUrl('https://169.254.169.254/latest/meta-data')).toBe(true);
    expect(isPrivateUrl('https://10.0.0.5/internal')).toBe(true);
    expect(isPrivateUrl('https://100.64.0.1/cgnat')).toBe(true);
    expect(isPrivateUrl('https://100.127.255.254/cgnat')).toBe(true);
    expect(isPrivateUrl('https://localhost:3000/api')).toBe(true);
    expect(isPrivateUrl('https://[::ffff:127.0.0.1]/api')).toBe(true);
  });

  it('blocks DNS rebinding resolving to private IP via isPrivateUrlAsync', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '100.64.10.2', family: 4 }]);
    await expect(isPrivateUrlAsync('https://rebind.attacker.example/hook')).resolves.toBe(true);

    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    await expect(isPrivateUrlAsync('https://webhooks.example.com/hook')).resolves.toBe(false);
  });

  it('allows only HTTPS Meta CDN/Graph hosts for direct media URLs', () => {
    expect(isAllowedMetaMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1')).toBe(true);
    expect(isAllowedMetaMediaUrl('https://scontent.xx.fbcdn.net/v/t1.0/img.jpg')).toBe(true);
    expect(isAllowedMetaMediaUrl('https://scontent-gru2-1.cdninstagram.com/v/media.mp4')).toBe(true);

    expect(isAllowedMetaMediaUrl('http://lookaside.fbsbx.com/img.jpg')).toBe(false);
    expect(isAllowedMetaMediaUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedMetaMediaUrl('https://evil.example.com/payload.png')).toBe(false);
  });
});
