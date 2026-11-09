'use strict';

/**
 * Audit log service – records every order modification or cancellation.
 * @module electron/services/audit
 */

const { nowIso } = require('../utils/dates.js');
const { getDb } = require('../db/connection.js');

/**
 * Write an audit log entry.
 * @param {'modify'|'cancel'} action
 * @param {number} orderId
 * @param {object} detail  JSON-serialisable snapshot
 */
function log(action, orderId, detail) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (action, order_id, created_at, detail)
       VALUES (?, ?, ?, ?)`,
    )
    .run(action, orderId, nowIso(), JSON.stringify(detail));
}

/**
 * List all audit entries for an order, newest first.
 * @param {number} orderId
 * @returns {object[]}
 */
function listForOrder(orderId) {
  return getDb()
    .prepare(
      `SELECT * FROM audit_log WHERE order_id = ? ORDER BY id DESC`,
    )
    .all(orderId)
    .map(row => ({ ...row, detail: JSON.parse(row.detail ?? 'null') }));
}

/**
 * List recent audit entries (last 200) across all orders, newest first.
 * @returns {object[]}
 */
function listRecent() {
  return getDb()
    .prepare(
      `SELECT al.*, o.number as order_number
       FROM audit_log al
       LEFT JOIN orders o ON o.id = al.order_id
       ORDER BY al.id DESC
       LIMIT 200`,
    )
    .all()
    .map(row => ({ ...row, detail: JSON.parse(row.detail ?? 'null') }));
}

module.exports = { log, listForOrder, listRecent };
