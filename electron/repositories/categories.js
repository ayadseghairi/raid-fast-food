'use strict';

/**
 * Categories repository – ONLY SQL lives here.
 * @module electron/repositories/categories
 */

const { getDb } = require('../db/connection.js');

function list() {
  return getDb()
    .prepare('SELECT * FROM categories ORDER BY sort_order, id')
    .all();
}

/** @param {{ name: string, sort_order?: number }} data */
function create(data) {
  const stmt = getDb().prepare(
    'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
  );
  const info = stmt.run(data.name, data.sort_order ?? 0);
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
}

/** @param {number} id @param {{ name?: string, sort_order?: number }} data */
function update(id, data) {
  const fields = [];
  const vals = [];
  if (data.name !== undefined) { fields.push('name = ?'); vals.push(data.name); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); vals.push(data.sort_order); }
  if (!fields.length) return getById(id);
  vals.push(id);
  getDb().prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return getById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
}

function getById(id) {
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

module.exports = { list, create, update, remove, getById };
