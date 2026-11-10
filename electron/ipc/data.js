'use strict';

/**
 * IPC handlers: destructive data operations (danger zone).
 *
 * ALL handlers require the owner password to proceed.
 *
 * data:clearTransactions  – deletes orders, order_items, business_days,
 *                           customers, expenses, audit_log.
 *                           Keeps: settings, categories, products,
 *                           product_options, shops, supplies, purchases.
 *
 * data:clearAll           – full wipe: deletes every row in every table
 *                           EXCEPT settings and the owner_password_hash
 *                           (so the app stays usable after the wipe).
 *
 * @module electron/ipc/data
 */

const { handle }         = require('./_handle.js');
const { AppError }       = require('../utils/errors.js');
const { getSetting }     = require('../repositories/settings.js');
const { verifyPassword } = require('../services/auth.js');
const { getDb }          = require('../db/connection.js');

// ── Password guard ─────────────────────────────────────────────────

async function requireOwnerPassword(password) {
  if (!password) throw new AppError('كلمة المرور مطلوبة');
  const hash = getSetting('owner_password_hash');
  const ok   = await verifyPassword(password, hash ?? '');
  if (!ok) throw new AppError('كلمة المرور غير صحيحة');
}

// ── Handlers ──────────────────────────────────────────────────────

/**
 * Delete all transaction data (orders, days, customers, expenses, audit).
 * Keeps catalogue (products, categories, options) and supplier data.
 * payload: { password: string }
 */
handle('data:clearTransactions', async ({ password }) => {
  await requireOwnerPassword(password);

  const db = getDb();
  db.transaction(() => {
    db.exec(`
      DELETE FROM audit_log;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM expenses;
      DELETE FROM customers;
      DELETE FROM business_days;
      DELETE FROM sqlite_sequence
        WHERE name IN (
          'audit_log','order_items','orders',
          'expenses','customers','business_days'
        );
    `);
  })();

  return { done: true };
});

/**
 * Full wipe: delete all data except settings.
 * payload: { password: string }
 */
handle('data:clearAll', async ({ password }) => {
  await requireOwnerPassword(password);

  const db = getDb();
  db.transaction(() => {
    db.exec(`
      DELETE FROM audit_log;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM expenses;
      DELETE FROM customers;
      DELETE FROM business_days;
      DELETE FROM purchase_items;
      DELETE FROM purchases;
      DELETE FROM supplies;
      DELETE FROM shops;
      DELETE FROM product_options;
      DELETE FROM products;
      DELETE FROM categories;
      DELETE FROM sqlite_sequence
        WHERE name NOT IN ('settings');
    `);
  })();

  return { done: true };
});
