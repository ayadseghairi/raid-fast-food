'use strict';

/**
 * Shops / suppliers service – business rules for shops, supplies, purchases.
 * @module electron/services/shops
 */

const { AppError } = require('../utils/errors.js');
const shopsRepo = require('../repositories/shops.js');
const { getDb } = require('../db/connection.js');
// Reuse the image import helper from products service
const { importImage, getImageAbsPath } = require('./products.js');

// ── Shops ─────────────────────────────────────────────────────────

function listShops() {
  return shopsRepo.listAll();
}

function createShop({ name, imagePath }) {
  if (!name?.trim()) throw new AppError('اسم المورد مطلوب');
  const storedImage = imagePath ? importImage(imagePath) : null;
  return shopsRepo.create({ name: name.trim(), image_path: storedImage });
}

function updateShop(id, data) {
  const existing = shopsRepo.getById(id);
  if (!existing) throw new AppError('المورد غير موجود');
  const patch = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new AppError('اسم المورد مطلوب');
    patch.name = data.name.trim();
  }
  if (data.imagePath !== undefined) {
    patch.image_path = data.imagePath ? importImage(data.imagePath) : null;
  }
  return shopsRepo.update(id, patch);
}

function deleteShop(id) {
  if (!shopsRepo.getById(id)) throw new AppError('المورد غير موجود');
  // Delete related purchases and their items before deleting the shop
  // (purchases.shop_id has no CASCADE so we must do it manually)
  const db = getDb();
  db.transaction(() => {
    const purchases = shopsRepo.listPurchases(id);
    for (const p of purchases) {
      db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(p.id);
    }
    db.prepare('DELETE FROM purchases WHERE shop_id = ?').run(id);
    // supplies are CASCADE-deleted by FK constraint
    shopsRepo.remove(id);
  })();
}

// ── Supplies ──────────────────────────────────────────────────────

function listSupplies(shopId) {
  return shopsRepo.listSupplies(shopId);
}

function createSupply({ shop_id, name, approx_price, imagePath }) {
  if (!shop_id) throw new AppError('المورد مطلوب');
  if (!name?.trim()) throw new AppError('اسم الصنف مطلوب');
  const storedImage = imagePath ? importImage(imagePath) : null;
  return shopsRepo.createSupply({
    shop_id,
    name: name.trim(),
    approx_price: Math.round(Number(approx_price || 0) * 100),
    image_path: storedImage,
  });
}

function updateSupply(id, data) {
  if (!shopsRepo.getSupplyById(id)) throw new AppError('الصنف غير موجود');
  const patch = {};
  if (data.name         !== undefined) patch.name = data.name.trim();
  if (data.approx_price !== undefined) patch.approx_price = Math.round(Number(data.approx_price) * 100);
  if (data.imagePath    !== undefined) patch.image_path = data.imagePath ? importImage(data.imagePath) : null;
  return shopsRepo.updateSupply(id, patch);
}

function deleteSupply(id) {
  if (!shopsRepo.getSupplyById(id)) throw new AppError('الصنف غير موجود');
  shopsRepo.removeSupply(id);
}

// ── Purchases ─────────────────────────────────────────────────────

/**
 * Create a purchase with its items in one transaction.
 * @param {{
 *   shop_id: number,
 *   date: string,        YYYY-MM-DD
 *   items: Array<{ supply_id?, name, qty, unit_price }>,
 *   paid: number,        minor units
 * }} payload
 */
function createPurchase({ shop_id, date, items, paid = 0 }) {
  if (!shop_id) throw new AppError('المورد مطلوب');
  if (!date)    throw new AppError('تاريخ الفاتورة مطلوب');
  if (!Array.isArray(items) || items.length === 0) throw new AppError('أصناف الفاتورة مطلوبة');

  const normalizedItems = items.map(item => {
    const unitPrice  = Math.round(Number(item.unit_price || 0) * 100);
    const qty        = Number(item.qty || 1);
    const lineTotal  = Math.round(unitPrice * qty);
    return {
      supply_id:  item.supply_id ?? null,
      name:       item.name?.trim() ?? '—',
      qty,
      unit_price: unitPrice,
      line_total: lineTotal,
    };
  });

  const total     = normalizedItems.reduce((s, i) => s + i.line_total, 0);
  const paidMinor = Math.round(Number(paid || 0) * 100);
  const db        = getDb();

  return db.transaction(() => {
    const purchase = shopsRepo.createPurchase(db, {
      shop_id,
      date,
      total,
      paid: paidMinor,
    });
    for (const item of normalizedItems) {
      shopsRepo.createPurchaseItem(db, { purchase_id: purchase.id, ...item });
    }
    return {
      purchase,
      items: shopsRepo.getPurchaseItems(purchase.id),
    };
  })();
}

function updatePurchasePaid(id, paid) {
  if (!shopsRepo.getPurchaseById(id)) throw new AppError('الفاتورة غير موجودة');
  const paidMinor = Math.round(Number(paid || 0) * 100);
  return shopsRepo.updatePurchasePaid(id, paidMinor);
}

function listPurchases(shopId) {
  const purchases = shopsRepo.listPurchases(shopId);
  return purchases.map(p => ({
    ...p,
    items: shopsRepo.getPurchaseItems(p.id),
  }));
}

function shopDebt(shopId) {
  return shopsRepo.shopDebt(shopId);
}

/** Returns { shops: [{...shop, debt}], totalDebt } */
function debtSummary() {
  const shops = shopsRepo.listAll();
  return {
    shops: shops.map(s => ({ ...s, debt: shopsRepo.shopDebt(s.id) })),
    totalDebt: shopsRepo.totalDebt(),
  };
}

/**
 * Get the image absolute path helper (for IPC layer).
 */
function getShopImageAbsPath(filename) {
  return filename ? getImageAbsPath(filename) : null;
}

module.exports = {
  listShops, createShop, updateShop, deleteShop,
  listSupplies, createSupply, updateSupply, deleteSupply,
  createPurchase, updatePurchasePaid, listPurchases,
  shopDebt, debtSummary,
  getShopImageAbsPath,
};
