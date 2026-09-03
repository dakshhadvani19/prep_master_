/**
 * Verifies the password digest scheme and the strength gate — the pieces the
 * SRS ER diagram pins down (Students.Password) plus the login/signup gating.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
  firebaseConfigError: null,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ col, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  increment: vi.fn((n) => ({ __increment: n })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

import { hashPassword, verifyPassword, isLegacyHash } from '../src/utils/hashUtil';
import { checkPasswordStrength } from '../src/utils/passwordStrength';

async function legacySha256(str) {
  const data = new TextEncoder().encode(str);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('password digest (ER: Students.Password)', () => {
  const email = 'Raja@Exam.com';

  it('stores a salted PBKDF2 envelope, never the password or an email-derived hash', async () => {
    const stored = await hashPassword('Str0ng!Passw09');
    const [scheme, rounds, salt, digest] = stored.split('$');

    expect(scheme).toBe('pbkdf2');
    expect(Number(rounds)).toBeGreaterThanOrEqual(100_000);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);          // 16 random bytes
    expect(digest).toMatch(/^[0-9a-f]{64}$/);         // SHA-256 output
    expect(stored).not.toContain('Str0ng!Passw09');
    expect(stored.toLowerCase()).not.toContain('raja@exam.com');
  });

  it('produces a different digest for the same password (random salt, unlike v1)', async () => {
    const a = await hashPassword('Str0ng!Passw09');
    const b = await hashPassword('Str0ng!Passw09');
    expect(a).not.toBe(b);

    // ...yet both still verify.
    expect((await verifyPassword('Str0ng!Passw09', email, a)).valid).toBe(true);
    expect((await verifyPassword('Str0ng!Passw09', email, b)).valid).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('Str0ng!Passw09');
    const res = await verifyPassword('Wr0ng!Password', email, stored);
    expect(res.valid).toBe(false);
  });

  it('still verifies legacy v1 digests and flags them for upgrade', async () => {
    // v1 was SHA-256(password + ":" + lowercased email) — the old scheme.
    const legacy = await legacySha256(`Str0ng!Passw09:${email.toLowerCase()}`);

    const good = await verifyPassword('Str0ng!Passw09', email, legacy);
    expect(good.valid).toBe(true);
    expect(good.needsUpgrade).toBe(true);
    expect(isLegacyHash(legacy)).toBe(true);
    expect(isLegacyHash(legacy.replace(/^/, 'v1$'))).toBe(true);

    const bad = await verifyPassword('nope', email, legacy);
    expect(bad.valid).toBe(false);
  });

  it('tolerates null/absent digests instead of throwing', async () => {
    for (const value of [null, undefined, '', 'garbage', 'pbkdf2$0$zz$zz']) {
      await expect(verifyPassword('x', email, value)).resolves.toMatchObject({ valid: false });
    }
  });

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/password/i);
  });
});

describe('strength gate used by the signup form', () => {
  it('returns null only for an empty field', () => {
    expect(checkPasswordStrength('')).toBeNull();
    expect(checkPasswordStrength(undefined)).toBeNull();
    expect(checkPasswordStrength('a')).not.toBeNull();
  });

  it('rejects weak and common passwords', () => {
    for (const pw of ['abc123', 'password', 'password1', 'qwerty123', '12345678']) {
      const r = checkPasswordStrength(pw);
      expect(r.isAcceptable, `${pw} should be rejected`).toBe(false);
    }
  });

  it('accepts a strong password and reports it as such', () => {
    const r = checkPasswordStrength('Str0ng!Passw09#x');
    expect(r.isAcceptable).toBe(true);
    expect(r.score).toBe(6);
    expect(r.label).toBe('Strong');
    expect(r.percent).toBe(100);
  });

  it('exposes every requirement the UI renders (no missing keys)', () => {
    const r = checkPasswordStrength('Abcdef1!');
    expect(Object.keys(r.checks).sort()).toEqual(
      ['length', 'lowercase', 'notCommon', 'number', 'special', 'uppercase']
    );
    for (const item of Object.values(r.checks)) {
      expect(typeof item.pass).toBe('boolean');
      expect(typeof item.label).toBe('string');
    }
  });

  it('supplies the fields the meter reads (it used to read label/requirements which do not exist)', () => {
    const r = checkPasswordStrength('Abcdef1!');
    expect(r).toHaveProperty('percent');
    expect(r).toHaveProperty('color');
    expect(r).toHaveProperty('label');
    expect(r).toHaveProperty('checks');
    expect([0, 100]).toContain(r.percent); // never NaN / out of range
    expect(r.color).toMatch(/^#/);
  });
});
