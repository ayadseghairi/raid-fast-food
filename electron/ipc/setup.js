'use strict';

/**
 * IPC: setup:check, setup:complete
 * Runs migrations on first call, then checks/persists the initial setup data.
 * Password is hashed with scrypt before storage.
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const { migrate } = require('../db/migrate.js');
const { getSetting, setManySettings } = require('../repositories/settings.js');
const { hashPassword } = require('../services/auth.js');
const { toMinor } = require('../utils/money.js');

handle('setup:check', () => {
  migrate(); // idempotent – only runs pending migrations
  return { done: getSetting('setup_done') === '1' };
});

handle('setup:complete', async (payload) => {
  const { restaurantName, phone, thankYou, deliveryFee, ownerPassword } = payload;

  if (!restaurantName?.trim()) throw new AppError('اسم المطعم مطلوب');
  if (!phone?.trim()) throw new AppError('رقم الهاتف مطلوب');
  if (!ownerPassword || ownerPassword.length < 4)
    throw new AppError('كلمة المرور يجب أن تكون 4 أحرف على الأقل');

  const hash = await hashPassword(ownerPassword);

  setManySettings({
    restaurant_name: restaurantName.trim(),
    phone: phone.trim(),
    thank_you: thankYou?.trim() || 'شكراً لزيارتكم',
    delivery_fee_default: String(toMinor(deliveryFee || 0)),
    owner_password_hash: hash,
    setup_done: '1',
  });

  return { done: true };
});
