'use strict';

/**
 * Business-day repository.
 * @module electron/repositories/businessDays
 */

const { getDb } = require('../db/connection.js');

/** Get today's open business day, or null if none exists. */
function getOpenDay() {
  return getDb()
    .prepare("SELECT * FROM business_days WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1")
    .get() ?? null;
}

/** Get a business day by id. */
function getById(id) {
  return getDb().prepare('SELECT * FROM business_days WHERE id = ?').get(id) ?? null;
}

/** Get a business day by date string (YYYY-MM-DD). */
function getByDate(date) {
  return getDb().prepare('SELECT * FROM business_days WHERE date = ?').get(date) ?? null;
}

/**
 * Create a new business day.
 * @param {string} date YYYY-MM-DD
 * @returns {object} the new row
 */
function create(date) {
  const db = getDb();
  // INSERT OR IGNORE makes concurrent calls safe: if today's row already exists
  // (race condition from multiple simultaneous IPC calls), we simply read it back.
  db.prepare('INSERT OR IGNORE INTO business_days (date) VALUES (?)').run(date);
  return getByDate(date);
}

/**
 * List all days (closed and open), newest first.
 */
function listAll() {
  return getDb()
    .prepare('SELECT * FROM business_days ORDER BY id DESC')
    .all();
}

/**
 * Update summary fields when closing a day.
 */
function close(id, { closedAt, receiptCount, totalSales, totalExpenses, net }) {
  getDb().prepare(`
    UPDATE business_days
    SET closed_at = ?, receipt_count = ?, total_sales = ?, total_expenses = ?, net = ?
    WHERE id = ?
  `).run(closedAt, receiptCount, totalSales, totalExpenses, net, id);
}

module.exports = { getOpenDay, getById, getByDate, create, listAll, close };
