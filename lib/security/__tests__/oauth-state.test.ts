import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSignedOAuthState, verifySignedOAuthState } from '../oauth-state';

describe('OAuth signed state & nonce cookie verification', () => {
  const prevSecret = process.env.OAUTH_STATE_SECRET;

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'test-oauth-signing-secret-32-chars!!';
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
    else process.env.OAUTH_STATE_SECRET = prevSecret;
  });

  it('accepts valid signed state matching provider, user and cookie nonce', () => {
    const { state, nonce } = createSignedOAuthState({
      companyId: 'company-abc',
      userId: 'user-123',
      provider: 'google',
    });

    const res = verifySignedOAuthState({
      state,
      expectedProvider: 'google',
      expectedUserId: 'user-123',
      cookieNonce: nonce,
    });

    expect(res).toEqual({ valid: true, companyId: 'company-abc' });
  });

  it('rejects tampered state or raw plaintext companyId', () => {
    const { state, nonce } = createSignedOAuthState({
      companyId: 'company-abc',
      userId: 'user-123',
      provider: 'google',
    });

    expect(
      verifySignedOAuthState({
        state: 'company-abc',
        expectedProvider: 'google',
        expectedUserId: 'user-123',
        cookieNonce: nonce,
      }),
    ).toEqual({ valid: false, reason: 'malformed_state' });

    const [payload] = state.split('.');
    expect(
      verifySignedOAuthState({
        state: `${payload}.${'0'.repeat(64)}`,
        expectedProvider: 'google',
        expectedUserId: 'user-123',
        cookieNonce: nonce,
      }),
    ).toEqual({ valid: false, reason: 'invalid_signature' });
  });

  it('rejects expired state, wrong provider, wrong user, or mismatched nonce cookie', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));

    const { state, nonce } = createSignedOAuthState({
      companyId: 'company-abc',
      userId: 'user-123',
      provider: 'instagram',
    });

    expect(
      verifySignedOAuthState({
        state,
        expectedProvider: 'google',
        expectedUserId: 'user-123',
        cookieNonce: nonce,
      }),
    ).toEqual({ valid: false, reason: 'provider_mismatch' });

    expect(
      verifySignedOAuthState({
        state,
        expectedProvider: 'instagram',
        expectedUserId: 'attacker-user',
        cookieNonce: nonce,
      }),
    ).toEqual({ valid: false, reason: 'user_mismatch' });

    expect(
      verifySignedOAuthState({
        state,
        expectedProvider: 'instagram',
        expectedUserId: 'user-123',
        cookieNonce: 'wrong-nonce',
      }),
    ).toEqual({ valid: false, reason: 'nonce_mismatch' });

    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(
      verifySignedOAuthState({
        state,
        expectedProvider: 'instagram',
        expectedUserId: 'user-123',
        cookieNonce: nonce,
      }),
    ).toEqual({ valid: false, reason: 'expired' });
  });
});
