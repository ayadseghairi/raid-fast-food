'use strict';

/**
 * IPC handlers: shops, supplies, purchases, expenses.
 * @module electron/ipc/suppliers
 */

const { dialog } = require('electron');
const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const fs   = require('node:fs');
const path = require('node:path');
const shopSvc = require('../services/shops.js');
const expSvc  = require('../services/expenses.js');

// ── Image helpers (same pattern as products IPC) ──────────────────

function toDataUrl(absPath) {
  if (!absPath || !fs.existsSync(absPath)) return null;
  const ext  = path.extname(absPath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const data = fs.readFileSync(absPath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

function shopToRenderer(shop) {
  if (!shop) return null;
  const abs = shopSvc.getShopImageAbsPath(shop.image_path);
  return { ...shop, image_url: abs ? toDataUrl(abs) : null };
}

// ── Validation helpers ────────────────────────────────────────────

function requireId(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw new AppError('معرّف غير صحيح');
  return n;
}

async function pickImage(title) {
  const win = require('electron').BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title,
    filters: [{ name: 'صور', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  return { canceled: false, filePath, previewUrl: toDataUrl(filePath) };
}

// ── Shops ─────────────────────────────────────────────────────────

handle('shops:list', () => {
  return shopSvc.listShops().map(shopToRenderer);
});

handle('shops:create', ({ name, imagePath }) => {
  if (!name?.trim()) throw new AppError('اسم المورد مطلوب');
  return shopToRenderer(shopSvc.createShop({ name, imagePath }));
});

handle('shops:update', ({ id, name, imagePath }) => {
  return shopToRenderer(shopSvc.updateShop(requireId(id), { name, imagePath }));
});

handle('shops:delete', ({ id }) => {
  shopSvc.deleteShop(requireId(id));
  return { done: true };
});

handle('shops:pickImage', async () => pickImage('اختر صورة المورد'));

// ── Supplies ──────────────────────────────────────────────────────

handle('supplies:list', ({ shopId }) => {
  return shopSvc.listSupplies(requireId(shopId));
});

handle('supplies:create', ({ shop_id, name, approx_price, imagePath }) => {
  requireId(shop_id);
  return shopSvc.createSupply({ shop_id, name, approx_price, imagePath });
});

handle('supplies:update', ({ id, ...rest }) => {
  return shopSvc.updateSupply(requireId(id), rest);
});

handle('supplies:delete', ({ id }) => {
  shopSvc.deleteSupply(requireId(id));
  return { done: true };
});

// ── Purchases ─────────────────────────────────────────────────────

handle('purchases:list', ({ shopId }) => {
  return shopSvc.listPurchases(requireId(shopId));
});

handle('purchases:create', (payload) => {
  const { shop_id, date, items, paid } = payload;
  requireId(shop_id);
  return shopSvc.createPurchase({ shop_id, date, items, paid });
});

handle('purchases:updatePaid', ({ id, paid }) => {
  return shopSvc.updatePurchasePaid(requireId(id), paid);
});

handle('purchases:update', ({ id, ...rest }) => {
  return shopSvc.updatePurchase(requireId(id), rest);
});

handle('purchases:delete', ({ id }) => {
  shopSvc.deletePurchase(requireId(id));
  return { done: true };
});

handle('purchases:debtSummary', () => {
  return shopSvc.debtSummary();
});

// ── Expenses ──────────────────────────────────────────────────────

handle('expenses:list', (filters = {}) => {
  return expSvc.list(filters);
});

handle('expenses:create', (payload) => {
  const { name, amount, date, category, day_id } = payload;
  return expSvc.create({ name, amount, date, category, day_id });
});

handle('expenses:update', ({ id, ...rest }) => {
  return expSvc.update(requireId(id), rest);
});

handle('expenses:delete', ({ id }) => {
  expSvc.remove(requireId(id));
  return { done: true };
});
