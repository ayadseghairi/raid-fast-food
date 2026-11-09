'use strict';

/**
 * Expenses repository – CRUD for other expenses (electricity, rent, …).
 * @module electron/repositories/expenses
 */

const { getDb } = require('../db/connection.js');

function list({ dateFrom, dateTo, category } = {}) {
  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];
  if (dateFrom) { sql += ' AND date >= ?'; params.push(dateFrom); }
  if (dateTo)   { sql += ' AND date <= ?'; params.push(dateTo); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY date DESC, id DESC';
  return getDb().prepare(sql).all(...params);
}

function getById(id) {
  return getDb().prepare('SELECT * FROM expenses WHERE id = ?').get(id) ?? null;
}

function create({ day_id = null, name, amount, date, category = 'other' }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT INTO expenses (day_id, name, amount, date, category) VALUES (?, ?, ?, ?, ?)'
  ).run(day_id, name, amount, date, category);
  return getById(info.lastInsertRowid);
}

function update(id, patch) {
  const db = getDb();
  for (const [k, v] of Object.entries(patch)) {
    db.prepare(`UPDATE expenses SET ${k} = ? WHERE id = ?`).run(v, id);
  }
  return getById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM expenses WHERE id = ?').run(id);
}

module.exports = { list, getById, create, update, remove };
