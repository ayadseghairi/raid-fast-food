/**
 * Tests for the auth service (electron/services/auth.js)
 * Tests scrypt hash/verify round-trips and the changePassword helper.
 */
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, changePassword } from '../electron/services/auth.js';

describe('auth service – hashPassword / verifyPassword', () => {
  it('verifies the correct password', async () => {
    const hash = await hashPassword('secret1234');
    expect(await verifyPassword('secret1234', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces a different hash each call (random salt)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
    // but both verify correctly
    expect(await verifyPassword('same', h1)).toBe(true);
    expect(await verifyPassword('same', h2)).toBe(true);
  });

  it('hash starts with scrypt: prefix', async () => {
    const hash = await hashPassword('test');
    expect(hash.startsWith('scrypt:')).toBe(true);
  });

  it('falls back to plain-text comparison for legacy Phase-0 values', async () => {
    // A stored plain-text value (before scrypt was introduced)
    expect(await verifyPassword('plainpass', 'plainpass')).toBe(true);
    expect(await verifyPassword('other', 'plainpass')).toBe(false);
  });
});

describe('auth service – changePassword', () => {
  it('returns a new scrypt hash when current password is correct', async () => {
    const stored = await hashPassword('oldpass');
    const newHash = await changePassword('oldpass', 'newpass', stored);
    expect(newHash.startsWith('scrypt:')).toBe(true);
    expect(await verifyPassword('newpass', newHash)).toBe(true);
  });

  it('throws AppError when current password is wrong', async () => {
    const stored = await hashPassword('correct');
    await expect(changePassword('wrong', 'newpass', stored)).rejects.toThrow(
      'كلمة المرور الحالية غير صحيحة',
    );
  });

  it('throws AppError when new password is too short', async () => {
    const stored = await hashPassword('pass1234');
    await expect(changePassword('pass1234', 'ab', stored)).rejects.toThrow(
      'كلمة المرور يجب أن تكون 4 أحرف على الأقل',
    );
  });
});
