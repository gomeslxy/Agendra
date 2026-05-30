import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { isPasswordCompromised } from '../password-security';

function rangeBodyFor(password: string, count: number): { prefix: string; body: string } {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  return { prefix: sha1.slice(0, 5), body: `${sha1.slice(5)}:${count}\r\n00000000000000000000000000000000000:3` };
}

afterEach(() => vi.unstubAllGlobals());

describe('isPasswordCompromised', () => {
  it('returns true when the SHA-1 suffix appears with count > 0', async () => {
    const { body } = rangeBodyFor('password123', 4567);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    expect(await isPasswordCompromised('password123')).toBe(true);
  });

  it('returns false when the suffix is absent from the range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9', { status: 200 })));
    expect(await isPasswordCompromised('a-very-unique-passphrase-9281')).toBe(false);
  });

  it('fails open (returns false) on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await isPasswordCompromised('whatever')).toBe(false);
  });

  it('fails open on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await isPasswordCompromised('whatever')).toBe(false);
  });

  it('returns false for empty password without calling the API', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await isPasswordCompromised('')).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
