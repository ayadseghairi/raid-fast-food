'use strict';

/**
 * IPC handlers: categories, products, product options, image picker.
 */

const { dialog } = require('electron');
const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const fs = require('node:fs');
const path = require('node:path');
const svc = require('../services/products.js');

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Read a file and return a data: URI string.
 * Used instead of file:// URLs so images load correctly in both
 * dev (http://localhost) and prod (file:// app), without CSP issues.
 * @param {string} absPath
 * @returns {string|null}
 */
function toDataUrl(absPath) {
  if (!absPath || !fs.existsSync(absPath)) return null;
  const ext = path.extname(absPath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : 'image/jpeg';
  const data = fs.readFileSync(absPath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

/**
 * Convert a stored product row for the renderer.
 * image_path → image_url as a data: URI (CSP-safe, works in dev+prod).
 */
function toRendererProduct(row) {
  if (!row) return null;
  const absPath = row.image_path ? svc.getImageAbsPath(row.image_path) : null;
  return {
    ...row,
    image_url: absPath ? toDataUrl(absPath) : null,
  };
}

function toRendererOption(row) {
  if (!row) return null;
  return { ...row }; // price already in minor units
}

// ── Validation helpers ─────────────────────────────────────────────

function requireString(val, field) {
  if (!val || !String(val).trim()) throw new AppError(`${field} مطلوب`);
  return String(val).trim();
}

function requireId(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw new AppError('معرّف غير صحيح');
  return n;
}

// ── Categories ────────────────────────────────────────────────────

handle('categories:list', () => svc.listCategories());

handle('categories:create', ({ name }) => {
  requireString(name, 'اسم الفئة');
  return svc.createCategory(name);
});

handle('categories:update', ({ id, name }) => {
  requireString(name, 'اسم الفئة');
  return svc.updateCategory(requireId(id), name);
});

handle('categories:delete', ({ id }) => {
  svc.deleteCategory(requireId(id));
  return { done: true };
});

// ── Products ──────────────────────────────────────────────────────

handle('products:list', ({ categoryId } = {}) => {
  const rows = svc.listProducts(categoryId ?? null);
  return rows.map(toRendererProduct);
});

handle('products:create', (payload) => {
  const { name, category_id, price, imagePath } = payload;
  requireString(name, 'اسم المنتج');
  requireId(category_id);
  const row = svc.createProduct({ name, category_id, price, imagePath });
  return toRendererProduct(row);
});

handle('products:update', (payload) => {
  const { id, ...rest } = payload;
  const row = svc.updateProduct(requireId(id), rest);
  return toRendererProduct(row);
});

handle('products:delete', ({ id }) => {
  svc.deleteProduct(requireId(id));
  return { done: true };
});

handle('products:setActive', ({ id, active }) => {
  svc.setProductActive(requireId(id), !!active);
  return { done: true };
});

// ── Image picker (opens native dialog) ───────────────────────────

handle('products:pickImage', async () => {
  const win = require('electron').BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: 'اختر صورة المنتج',
    filters: [{ name: 'صور', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  // Return both the raw path (for the save operation) and a data: URI
  // for the preview — file:// URLs are blocked by CSP in dev mode.
  return { canceled: false, filePath, previewUrl: toDataUrl(filePath) };
});

// ── Options ───────────────────────────────────────────────────────

handle('options:list', ({ productId }) => {
  return svc.listOptions(requireId(productId)).map(toRendererOption);
});

handle('options:create', (payload) => {
  const { product_id, type, label, price } = payload;
  requireId(product_id);
  if (!['size', 'extra'].includes(type)) throw new AppError('النوع غير صحيح');
  requireString(label, 'اسم الخيار');
  return toRendererOption(svc.createOption({ product_id, type, label, price }));
});

handle('options:update', ({ id, label, price }) => {
  svc.updateOption(requireId(id), { label, price });
  return { done: true };
});

handle('options:delete', ({ id }) => {
  svc.deleteOption(requireId(id));
  return { done: true };
});
