'use strict';

/**
 * Customers repository.
 * @module electron/repositories/customers
 */

const { getDb } = require('../db/connection.js');

function lookup(phone) {
  return getDb().prepare('SELECT * FROM customers WHERE phone = ?').get(phone) ?? null;
}

function create({ name, phone, address }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
  ).run(name, phone, address ?? null);
  return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
}

function upsert({ name, phone, address }) {
  const existing = lookup(phone);
  if (existing) {
    getDb().prepare(
      'UPDATE customers SET name = ?, address = ? WHERE id = ?',
    ).run(name, address ?? null, existing.id);
    return { ...existing, name, address };
  }
  return create({ name, phone, address });
}

module.exports = { lookup, create, upsert };
