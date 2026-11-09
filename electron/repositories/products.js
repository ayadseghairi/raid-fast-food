'use strict';

/**
 * Products + product_options repository.
 * @module electron/repositories/products
 */

const { getDb } = require('../db/connection.js');

// ── Products ──────────────────────────────────────────────────────

function listByCategory(categoryId) {
  const sql = categoryId
    ? 'SELECT * FROM products WHERE category_id = ? ORDER BY sort_order, id'
    : 'SELECT * FROM products ORDER BY sort_order, id';
  return categoryId
    ? getDb().prepare(sql).all(categoryId)
    : getDb().prepare(sql).all();
}

function getById(id) {
  return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id);
}

/** @param {{ category_id, name, price, image_path?, sort_order? }} data */
function create(data) {
  const stmt = getDb().prepare(
    `INSERT INTO products (category_id, name, price, image_path, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const info = stmt.run(
    data.category_id,
    data.name,
    data.price ?? 0,
    data.image_path ?? null,
    data.sort_order ?? 0,
  );
  return getById(info.lastInsertRowid);
}

function update(id, data) {
  const fields = [];
  const vals = [];
  const allowed = ['category_id', 'name', 'price', 'image_path', 'active', 'sort_order'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      vals.push(data[key]);
    }
  }
  if (!fields.length) return getById(id);
  vals.push(id);
  getDb().prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  return getById(id);
}

function setActive(id, active) {
  getDb().prepare('UPDATE products SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

function remove(id) {
  getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

// ── Product options ───────────────────────────────────────────────

function listOptions(productId) {
  return getDb()
    .prepare("SELECT * FROM product_options WHERE product_id = ? ORDER BY type, id")
    .all(productId);
}

/** @param {{ product_id, type, label, price }} data */
function createOption(data) {
  const stmt = getDb().prepare(
    'INSERT INTO product_options (product_id, type, label, price) VALUES (?, ?, ?, ?)',
  );
  const info = stmt.run(data.product_id, data.type, data.label, data.price ?? 0);
  return getDb().prepare('SELECT * FROM product_options WHERE id = ?').get(info.lastInsertRowid);
}

function updateOption(id, data) {
  const fields = [];
  const vals = [];
  if (data.label !== undefined) { fields.push('label = ?'); vals.push(data.label); }
  if (data.price !== undefined) { fields.push('price = ?'); vals.push(data.price); }
  if (!fields.length) return;
  vals.push(id);
  getDb().prepare(`UPDATE product_options SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
}

function removeOption(id) {
  getDb().prepare('DELETE FROM product_options WHERE id = ?').run(id);
}

module.exports = {
  listByCategory, getById, create, update, setActive, remove,
  listOptions, createOption, updateOption, removeOption,
};
