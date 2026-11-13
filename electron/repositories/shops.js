'use strict';

/**
 * Shops repository – CRUD for supplier shops.
 * @module electron/repositories/shops
 */

const { getDb } = require('../db/connection.js');

function listAll() {
  return getDb().prepare('SELECT * FROM shops ORDER BY name ASC').all();
}

function getById(id) {
  return getDb().prepare('SELECT * FROM shops WHERE id = ?').get(id) ?? null;
}

function create({ name, image_path = null }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT INTO shops (name, image_path) VALUES (?, ?)'
  ).run(name, image_path);
  return getById(info.lastInsertRowid);
}

function update(id, { name, image_path }) {
  const db = getDb();
  if (name     !== undefined) db.prepare('UPDATE shops SET name = ? WHERE id = ?').run(name, id);
  if (image_path !== undefined) db.prepare('UPDATE shops SET image_path = ? WHERE id = ?').run(image_path, id);
  return getById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM shops WHERE id = ?').run(id);
}

// ── Supplies ──────────────────────────────────────────────────────

function listSupplies(shopId) {
  return getDb()
    .prepare('SELECT * FROM supplies WHERE shop_id = ? ORDER BY name ASC')
    .all(shopId);
}

function getSupplyById(id) {
  return getDb().prepare('SELECT * FROM supplies WHERE id = ?').get(id) ?? null;
}

function createSupply({ shop_id, name, approx_price = 0, image_path = null }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT INTO supplies (shop_id, name, approx_price, image_path) VALUES (?, ?, ?, ?)'
  ).run(shop_id, name, approx_price, image_path);
  return getSupplyById(info.lastInsertRowid);
}

function updateSupply(id, patch) {
  const db = getDb();
  for (const [k, v] of Object.entries(patch)) {
    db.prepare(`UPDATE supplies SET ${k} = ? WHERE id = ?`).run(v, id);
  }
  return getSupplyById(id);
}

function removeSupply(id) {
  getDb().prepare('DELETE FROM supplies WHERE id = ?').run(id);
}

// ── Purchases ─────────────────────────────────────────────────────

function listPurchases(shopId) {
  return getDb()
    .prepare('SELECT * FROM purchases WHERE shop_id = ? ORDER BY date DESC, id DESC')
    .all(shopId);
}

function getPurchaseById(id) {
  return getDb().prepare('SELECT * FROM purchases WHERE id = ?').get(id) ?? null;
}

/** Sum of all `remaining` for a shop (outstanding debt). */
function shopDebt(shopId) {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(remaining),0) as debt FROM purchases WHERE shop_id = ?')
    .get(shopId);
  return row?.debt ?? 0;
}

/** Total debt across all shops. */
function totalDebt() {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(remaining),0) as debt FROM purchases')
    .get();
  return row?.debt ?? 0;
}

function createPurchase(db, { shop_id, date, total, paid }) {
  const info = db.prepare(
    'INSERT INTO purchases (shop_id, date, total, paid) VALUES (?, ?, ?, ?)'
  ).run(shop_id, date, total, paid);
  return getPurchaseById(info.lastInsertRowid);
}

function updatePurchasePaid(id, paid) {
  getDb().prepare('UPDATE purchases SET paid = ? WHERE id = ?').run(paid, id);
  return getPurchaseById(id);
}

function deletePurchase(db, id) {
  db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
  db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
}

function updatePurchaseItems(db, purchaseId, items) {
  db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchaseId);
  for (const item of items) {
    db.prepare(
      `INSERT INTO purchase_items (purchase_id, supply_id, name, qty, unit_price, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(purchaseId, item.supply_id ?? null, item.name, item.qty, item.unit_price, item.line_total);
  }
}

function updatePurchaseFull(db, id, { date, total, paid }) {
  db.prepare('UPDATE purchases SET date = ?, total = ?, paid = ? WHERE id = ?').run(date, total, paid, id);
  return getPurchaseById(id);
}

function getPurchaseItems(purchaseId) {
  return getDb()
    .prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id')
    .all(purchaseId);
}

function createPurchaseItem(db, { purchase_id, supply_id, name, qty, unit_price, line_total }) {
  db.prepare(
    `INSERT INTO purchase_items (purchase_id, supply_id, name, qty, unit_price, line_total)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(purchase_id, supply_id ?? null, name, qty, unit_price, line_total);
}

module.exports = {
  listAll, getById, create, update, remove,
  listSupplies, getSupplyById, createSupply, updateSupply, removeSupply,
  listPurchases, getPurchaseById, shopDebt, totalDebt,
  createPurchase, updatePurchasePaid, getPurchaseItems, createPurchaseItem,
  deletePurchase, updatePurchaseItems, updatePurchaseFull,
};
