'use strict';

/**
 * Auth service – password hashing and verification using Node's built-in scrypt.
 * Passwords are NEVER logged or stored in plain text.
 *
 * Hash format stored in settings:  scrypt:<N>:<r>:<p>:<salt_hex>:<hash_hex>
 * @module electron/services/auth
 */

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { AppError } = require('../utils/errors.js');

const scryptAsync = promisify(crypto.scrypt);

// scrypt parameters – good balance of security vs. speed on low-end hardware
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64; // bytes
const SALT_LEN = 32; // bytes

/**
 * Hash a plain-text password with scrypt.
 * @param {string} password
 * @returns {Promise<string>} opaque hash string to store in settings
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = await scryptAsync(password, salt, KEY_LEN, PARAMS);
  return `scrypt:${PARAMS.N}:${PARAMS.r}:${PARAMS.p}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a plain-text password against a stored hash.
 * @param {string} password
 * @param {string} stored – value returned by hashPassword()
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) {
    // Legacy plain-text from Phase 0 setup (first-run before any hash was stored)
    return password === stored;
  }
  const parts = stored.split(':');
  if (parts.length !== 6) return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, salt, KEY_LEN, params);
  // Constant-time compare to prevent timing attacks
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Change the owner password. Throws AppError if current password is wrong.
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} storedHash
 * @returns {Promise<string>} new hash to persist
 */
async function changePassword(currentPassword, newPassword, storedHash) {
  const ok = await verifyPassword(currentPassword, storedHash);
  if (!ok) throw new AppError('كلمة المرور الحالية غير صحيحة');
  if (!newPassword || newPassword.length < 4)
    throw new AppError('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
  return hashPassword(newPassword);
}

module.exports = { hashPassword, verifyPassword, changePassword };
