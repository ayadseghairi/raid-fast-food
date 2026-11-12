'use strict';

/**
 * Workers repository – CRUD for workers and worker_payments.
 * @module electron/repositories/workers
 */

const { getDb } = require('../db/connection.js');

// ── Workers ──────────────────────────────────────────────────────

function listWorkers(activeOnly = false) {
  if (activeOnly) {
    return getDb().prepare('SELECT * FROM workers WHERE active = 1 ORDER BY name').all();
  }
  return getDb().prepare('SELECT * FROM workers ORDER BY active DESC, name').all();
}

function getWorkerById(id) {
  return getDb().prepare('SELECT * FROM workers WHERE id = ?').get(id);
}

function createWorker(name) {
  const info = getDb()
    .prepare("INSERT INTO workers (name, active) VALUES (?, 1)")
    .run(name.trim());
  return getWorkerById(info.lastInsertRowid);
}

function updateWorker(id, name) {
  getDb().prepare('UPDATE workers SET name = ? WHERE id = ?').run(name.trim(), id);
  return getWorkerById(id);
}

function setWorkerActive(id, active) {
  getDb().prepare('UPDATE workers SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

// ── Worker payments ───────────────────────────────────────────────

/**
 * Get payments for a specific date (for the daily entry screen).
 * Returns one row per active worker; workers with no payment for that date get amount=0.
 * @param {string} date – YYYY-MM-DD
 * @returns {{ worker_id, worker_name, payment_id|null, amount }[]}
 */
function getPaymentsForDate(date) {
  return getDb()
    .prepare(`
      SELECT w.id as worker_id, w.name as worker_name,
             p.id as payment_id, COALESCE(p.amount, 0) as amount
      FROM workers w
      LEFT JOIN worker_payments p ON p.worker_id = w.id AND p.date = ?
      WHERE w.active = 1
      ORDER BY w.name
    `)
    .all(date);
}

/**
 * Upsert payment for a worker on a given date.
 * @param {number} workerId
 * @param {string} date – YYYY-MM-DD
 * @param {number} amount – minor units
 */
function upsertPayment(workerId, date, amount) {
  getDb()
    .prepare(`
      INSERT INTO worker_payments (worker_id, date, amount)
      VALUES (?, ?, ?)
      ON CONFLICT(worker_id, date) DO UPDATE SET amount = excluded.amount
    `)
    .run(workerId, date, amount);
}

/**
 * Save all payments for a date (replace all rows for that date for active workers).
 * @param {string} date
 * @param {{ worker_id: number, amount: number }[]} payments
 */
function savePaymentsForDate(date, payments) {
  const db = getDb();
  db.transaction(() => {
    for (const p of payments) {
      upsertPayment(p.worker_id, date, p.amount);
    }
  })();
}

/**
 * Get total worker pay for a date range.
 * @param {string} from – YYYY-MM-DD
 * @param {string} to   – YYYY-MM-DD
 * @returns {number} total amount in minor units
 */
function totalPayForRange(from, to) {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(amount),0) as total FROM worker_payments WHERE date >= ? AND date <= ?')
    .get(from, to);
  return row.total;
}

/**
 * Per-worker summary for a date range.
 */
function workerSummaryForRange(from, to) {
  return getDb()
    .prepare(`
      SELECT w.id, w.name,
             COUNT(p.id) as days_paid,
             COALESCE(SUM(p.amount), 0) as total_paid
      FROM workers w
      LEFT JOIN worker_payments p ON p.worker_id = w.id AND p.date >= ? AND p.date <= ?
      GROUP BY w.id, w.name
      ORDER BY w.name
    `)
    .all(from, to);
}

/**
 * Per-worker per-day detail for a date range.
 */
function workerDetailForRange(workerId, from, to) {
  return getDb()
    .prepare(`
      SELECT date, amount
      FROM worker_payments
      WHERE worker_id = ? AND date >= ? AND date <= ?
      ORDER BY date
    `)
    .all(workerId, from, to);
}

/**
 * Check if a worker has any payments (used before deactivating).
 */
function workerHasPayments(workerId) {
  const row = getDb()
    .prepare('SELECT COUNT(*) as cnt FROM worker_payments WHERE worker_id = ?')
    .get(workerId);
  return row.cnt > 0;
}

module.exports = {
  listWorkers, getWorkerById, createWorker, updateWorker, setWorkerActive,
  getPaymentsForDate, upsertPayment, savePaymentsForDate,
  totalPayForRange, workerSummaryForRange, workerDetailForRange,
  workerHasPayments,
};
