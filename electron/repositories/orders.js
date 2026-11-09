'use strict';

/**
 * Orders repository.
 * @module electron/repositories/orders
 */

const { getDb } = require('../db/connection.js');

// ── Orders ─────────────────────────────────────────────────────────

function getById(id) {
  return getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id) ?? null;
}

function listByDay(dayId) {
  return getDb()
    .prepare('SELECT * FROM orders WHERE day_id = ? ORDER BY number ASC')
    .all(dayId);
}

/**
 * Get the next receipt number for a given day (max + 1, starting at 1).
 * @param {number} dayId
 * @returns {number}
 */
function nextNumber(dayId) {
  const row = getDb()
    .prepare('SELECT MAX(number) as max FROM orders WHERE day_id = ?')
    .get(dayId);
  return (row?.max ?? 0) + 1;
}

/**
 * Create an order and its items in one transaction.
 * @param {object} orderData
 * @param {object[]} items
 * @returns {object} the created order row
 */
function create(orderData, items) {
  const db = getDb();
  return db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO orders
        (day_id, number, order_type, status, customer_id,
         delivery_name, delivery_phone, delivery_addr,
         delivery_fee, total, created_at)
      VALUES (?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderData.day_id,
      orderData.number,
      orderData.order_type,
      orderData.customer_id ?? null,
      orderData.delivery_name ?? null,
      orderData.delivery_phone ?? null,
      orderData.delivery_addr ?? null,
      orderData.delivery_fee ?? 0,
      orderData.total,
      orderData.created_at,
    );
    const orderId = info.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO order_items
        (order_id, product_id, product_name, unit_price, qty, options, note, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      itemStmt.run(
        orderId,
        item.product_id,
        item.product_name,
        item.unit_price,
        item.qty,
        JSON.stringify(item.options ?? []),
        item.note ?? null,
        item.line_total,
      );
    }
    return getById(orderId);
  })();
}

function setStatus(id, status) {
  getDb().prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
}

// ── Order items ────────────────────────────────────────────────────

function getItems(orderId) {
  return getDb()
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .all(orderId)
    .map(row => ({ ...row, options: JSON.parse(row.options ?? '[]') }));
}

function updateItems(orderId, items) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
    const stmt = db.prepare(`
      INSERT INTO order_items
        (order_id, product_id, product_name, unit_price, qty, options, note, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      stmt.run(
        orderId,
        item.product_id,
        item.product_name,
        item.unit_price,
        item.qty,
        JSON.stringify(item.options ?? []),
        item.note ?? null,
        item.line_total,
      );
    }
  })();
}

module.exports = { getById, listByDay, nextNumber, create, setStatus, getItems, updateItems };
