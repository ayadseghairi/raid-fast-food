'use strict';

/**
 * IPC: auth:login, auth:logout, auth:changePassword
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const { getSetting, setSetting } = require('../repositories/settings.js');
const { verifyPassword, changePassword } = require('../services/auth.js');

handle('auth:login', async (payload) => {
  const { role, password } = payload;

  if (!['owner', 'cashier'].includes(role)) {
    throw new AppError('دور غير معروف');
  }

  if (role === 'cashier') {
    return { role: 'cashier' };
  }

  // Owner: verify scrypt hash
  const stored = getSetting('owner_password_hash');
  if (!stored) throw new AppError('لم يتم الإعداد بعد');

  const ok = await verifyPassword(password ?? '', stored);
  if (!ok) throw new AppError('كلمة المرور غير صحيحة');

  return { role: 'owner' };
});

handle('auth:logout', () => {
  return { done: true };
});

handle('auth:changePassword', async (payload) => {
  const { currentPassword, newPassword } = payload;
  if (!currentPassword || !newPassword) throw new AppError('البيانات ناقصة');

  const stored = getSetting('owner_password_hash');
  if (!stored) throw new AppError('لم يتم الإعداد بعد');

  const newHash = await changePassword(currentPassword, newPassword, stored);
  setSetting('owner_password_hash', newHash);
  return { done: true };
});
