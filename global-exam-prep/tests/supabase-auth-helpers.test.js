/**
 * The Google exchange helpers, in isolation.
 *
 * These are the functions that decide what the student is told when the round trip
 * through Google fails, and whether the page is left waiting forever. The page-level
 * behaviour lives in tests/google-oauth-return.test.jsx; this file pins the contracts
 * that file cannot reach cheaply: the timeout bound, the reason mapping, the
 * never-leak-internals rule, and the attempt marker's expiry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  describeAuthCallback,
  exchangeAuthCode,
  hasPendingAuthCode,
  oauthAttemptInFlight,
  readOAuthErrorFromUrl,
  rememberOAuthAttempt,
  clearOAuthAttempt,
} from '../src/utils/supabaseAuth.js';

const ATTEMPT_KEY = 'prepmaster_oauth_attempt_v1';
const TAB_KEY = 'prepmaster_google_signup_pending';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('exchangeAuthCode bounds the exchange it owns', () => {
  it('returns the session the exchange produced', async () => {
    const session = { access_token: 't', refresh_token: 'r' };
    const client = { auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) } };
    await expect(exchangeAuthCode(client, 'code-1')).resolves.toBe(session);
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('code-1');
  });

  it('gives up on an exchange that never answers, instead of spinning forever', async () => {
    vi.useFakeTimers();
    // A hung network call is the case that used to leave the spinner up indefinitely.
    const client = { auth: { exchangeCodeForSession: () => new Promise(() => {}) } };
    const p = exchangeAuthCode(client, 'code-2', { timeoutMs: 12000 });
    const seen = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(12001);
    const err = await seen;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/took too long/i);
    expect(err.message).not.toMatch(/timeout|exchangeCodeForSession|supabase/i);
    expect(vi.getTimerCount()).toBe(0);                 // the timer is cleared, not leaked
  });

  it('reports a missing code as a missing code', async () => {
    const client = { auth: { exchangeCodeForSession: vi.fn() } };
    await expect(exchangeAuthCode(client, '')).rejects.toThrow(/missing its verification code/i);
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('treats an empty result as a failure, never as a success', async () => {
    // A 200 with no session must not become "signed in" — that is how a broken
    // provider looks like a working one.
    const client = { auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
    await expect(exchangeAuthCode(client, 'code-3')).rejects.toThrow(/did not complete/i);
  });

  it('maps the reasons that actually happen, in the words the user needs', async () => {
    const cases = [
      [{ code: 'bad_verifier', message: 'code verifier does not match' }, /no longer matches/i],
      [{ code: 'flow_state_not_found', message: 'invalid flow state' }, /expired before it could be finished/i],
      // The literal production symptom, mapped to the one sentence that explains it.
      [{ message: 'Unable to exchange external code: 400 Bad Request' }, /sign-in state no longer matches/i],
    ];
    for (const [err, re] of cases) {
      const client = { auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ data: null, error: err }) } };
      await expect(exchangeAuthCode(client, 'code-4')).rejects.toThrow(re);
    }
  });

  it('keeps internal wording out of the user-facing sentence', async () => {
    const client = {
      auth: {
        exchangeCodeForSession: vi.fn().mockRejectedValue(new Error(
          'AuthApiError: Failed to fetch https://xyz.supabase.co/auth/v1/token?grant_type=pkce {"error":"server_error"}',
        )),
      },
    };
    const err = await exchangeAuthCode(client, 'c').catch((e) => e);
    expect(err.message).toMatch(/connection issue while finishing sign-in/i);
    expect(err.message).not.toMatch(/supabase|https:|AuthApiError|\{"|grant_type/i);
    expect(err.retryable).toBe(true);
  });
});

describe('describeAuthCallback turns a browser return into one sentence', () => {
  it('says nothing when there is nothing to report', () => {
    expect(describeAuthCallback(null)).toBeNull();
    expect(describeAuthCallback(undefined)).toBeNull();
  });

  it('passes a code arrival through untouched, including its flow type', () => {
    expect(describeAuthCallback({ kind: 'code', code: 'abc', type: 'recovery' }))
      .toEqual({ kind: 'code', code: 'abc', type: 'recovery' });
  });

  it('calls an abandoned consent what it was', () => {
    const v = describeAuthCallback({ kind: 'error', errorCode: 'access_denied', errorDescription: 'User cancelled' });
    expect(v.kind).toBe('error');
    expect(v.cancelled).toBe(true);
    expect(v.message).toMatch(/cancelled/i);
  });

  it('keeps the summary and adds the provider reason for a hard failure', () => {
    const v = describeAuthCallback({
      kind: 'error', errorCode: 'server_error', errorDescription: 'redirect_uri_mismatch',
    });
    expect(v.message).toMatch(/Google sign-in did not complete/i);
    expect(v.message).toMatch(/redirect_uri_mismatch/i);      // actionable, not generic
  });
});

describe('the OAuth attempt marker', () => {
  it('is in flight only inside the window, and only when this browser started it', () => {
    expect(oauthAttemptInFlight()).toBe(false);
    rememberOAuthAttempt();
    expect(oauthAttemptInFlight()).toBe(true);
    expect(localStorage.getItem(ATTEMPT_KEY)).toBeTruthy();
    expect(sessionStorage.getItem(TAB_KEY)).toBeTruthy();
    clearOAuthAttempt();
    expect(oauthAttemptInFlight()).toBe(false);
    expect(localStorage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(sessionStorage.getItem(TAB_KEY)).toBeNull();
  });

  it('forgets a departure older than the flow could possibly take', () => {
    // A marker left by a crashed tab must not tell a later visitor their sign-in
    // failed. Fifteen minutes is the ceiling for "that was probably my round trip".
    localStorage.setItem(ATTEMPT_KEY, String(Date.now() - 16 * 60 * 1000));
    expect(oauthAttemptInFlight()).toBe(false);
    localStorage.setItem(ATTEMPT_KEY, String(Date.now() - 60 * 1000));
    expect(oauthAttemptInFlight()).toBe(true);
    localStorage.setItem(ATTEMPT_KEY, 'not-a-timestamp');
    expect(oauthAttemptInFlight()).toBe(false);
  });
});

describe('the URL is read without trusting it', () => {
  it('lifts the provider error out of the query string', () => {
    const v = readOAuthErrorFromUrl('https://app/signup?error=access_denied&error_description=no+thanks');
    expect(v).toMatchObject({ kind: 'error', cancelled: true });
    expect(v.message).toMatch(/cancelled/i);
    // A code arrival is not an error, and must not be reported as one.
    expect(readOAuthErrorFromUrl('https://app/signup?code=abc&state=s')).toBeNull();
    // …and it can be hiding in the hash, which is the other fragment mode.
    const hashed = readOAuthErrorFromUrl('https://app/signup#error=access_denied');
    expect(hashed.message).toMatch(/cancelled/i);
  });

  it('recognises a code waiting to be exchanged', () => {
    expect(hasPendingAuthCode('https://app/signup?code=abc')).toBe(true);
    expect(hasPendingAuthCode('https://app/signup#code=abc')).toBe(true);
    expect(hasPendingAuthCode('https://app/signup?code=')).toBe(true);   // the param is there
    expect(hasPendingAuthCode('https://app/signup')).toBe(false);
    expect(hasPendingAuthCode('https://app/signup?state=abc')).toBe(false);
  });

  it('survives a garbage href instead of throwing on first paint', () => {
    expect(readOAuthErrorFromUrl('not a url')).toBeNull();
    expect(hasPendingAuthCode('')).toBe(false);
  });
});
