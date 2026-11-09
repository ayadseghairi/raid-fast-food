'use strict';

/**
 * Settings repository – read/write key-value settings table.
 * @module electron/repositories/settings
 */

const { getDb } = require('../db/connection.js');

/**
 * Get a single setting value.
 * @param {string} key
 * @returns {string|undefined}
 */
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value;
}

/**
 * Set a single setting value.
 * @param {string} key
 * @param {string} value
 */
function setSetting(key, value) {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, String(value ?? ''));
}

/**
 * Get all settings as a plain object.
 * @returns {Record<string,string>}
 */
function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const { key, value } of rows) result[key] = value;
  return result;
}

/**
 * Set multiple settings in a single transaction.
 * @param {Record<string,string>} map
 */
function setManySettings(map) {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    for (const [k, v] of Object.entries(map)) stmt.run(k, String(v ?? ''));
  })();
}

module.exports = { getSetting, setSetting, getAllSettings, setManySettings };
