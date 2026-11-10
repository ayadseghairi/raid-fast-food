'use strict';

/**
 * IPC: settings:get, settings:set
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const { getAllSettings, setManySettings } = require('../repositories/settings.js');

const ALLOWED_KEYS = new Set([
  'restaurant_name',
  'restaurant_phone',
  'thank_you_message',
  'delivery_fee_default',
  'printer_name',
  'paper_width',
  'backup_folder',
  'show_virtual_printers',
]);

handle('settings:get', () => {
  const all = getAllSettings();
  // Strip sensitive keys before sending to renderer
  delete all.owner_password_hash;
  delete all.setup_done;
  return all;
});

handle('settings:set', (payload) => {
  const entries = Object.entries(payload);
  for (const [k] of entries) {
    if (!ALLOWED_KEYS.has(k)) throw new AppError(`مفتاح إعداد غير مسموح: ${k}`);
  }
  setManySettings(Object.fromEntries(entries));
  return { done: true };
});
