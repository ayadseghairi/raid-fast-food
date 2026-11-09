'use strict';

/**
 * Products service – business rules for product/category/option management.
 * Handles image copying into userData/images/.
 * @module electron/services/products
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AppError } = require('../utils/errors.js');
const catRepo = require('../repositories/categories.js');
const prodRepo = require('../repositories/products.js');

/**
 * Get the images directory inside userData, creating it if needed.
 * @returns {string}
 */
function getImagesDir() {
  // In test mode there's no app object
  if (process.env.NODE_ENV === 'test') {
    const dir = path.join(process.cwd(), '.test-images');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const { app } = require('electron');
  const dir = path.join(app.getPath('userData'), 'images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Copy an image from any source path into userData/images/,
 * using a content-hash filename to deduplicate.
 * Returns the stored relative path (just the filename).
 * @param {string} sourcePath – absolute path chosen by user
 * @returns {string} stored filename
 */
function importImage(sourcePath) {
  if (!sourcePath) return null;
  if (!fs.existsSync(sourcePath)) throw new AppError('ملف الصورة غير موجود');
  const ext = path.extname(sourcePath).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  if (!allowed.includes(ext)) throw new AppError('نوع الصورة غير مدعوم');

  const data = fs.readFileSync(sourcePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  const filename = `${hash}${ext}`;
  const dest = path.join(getImagesDir(), filename);
  if (!fs.existsSync(dest)) fs.copyFileSync(sourcePath, dest);
  return filename;
}

/**
 * Delete an image file if no other product references it.
 * @param {string} filename
 */
function maybeDeleteImage(filename) {
  if (!filename) return;
  const dir = getImagesDir();
  try { fs.unlinkSync(path.join(dir, filename)); } catch { /* ignore */ }
}

// ── Categories ────────────────────────────────────────────────────

function listCategories() {
  return catRepo.list();
}

function createCategory(name) {
  if (!name?.trim()) throw new AppError('اسم الفئة مطلوب');
  return catRepo.create({ name: name.trim() });
}

function updateCategory(id, name) {
  if (!name?.trim()) throw new AppError('اسم الفئة مطلوب');
  const row = catRepo.getById(id);
  if (!row) throw new AppError('الفئة غير موجودة');
  return catRepo.update(id, { name: name.trim() });
}

function deleteCategory(id) {
  const row = catRepo.getById(id);
  if (!row) throw new AppError('الفئة غير موجودة');
  catRepo.remove(id); // cascade deletes products
}

// ── Products ──────────────────────────────────────────────────────

function listProducts(categoryId) {
  return prodRepo.listByCategory(categoryId ?? null);
}

/**
 * @param {{ category_id, name, price, imagePath?, sort_order? }} data
 * price expected as decimal string (e.g. "12.50") or number
 */
function createProduct(data) {
  const { category_id, name, price, imagePath } = data;
  if (!name?.trim()) throw new AppError('اسم المنتج مطلوب');
  if (!category_id) throw new AppError('الفئة مطلوبة');
  const priceMinor = Math.round(Number(price || 0) * 100);
  if (priceMinor < 0) throw new AppError('السعر لا يمكن أن يكون سالباً');

  const storedImage = imagePath ? importImage(imagePath) : null;
  return prodRepo.create({
    category_id,
    name: name.trim(),
    price: priceMinor,
    image_path: storedImage,
    sort_order: data.sort_order ?? 0,
  });
}

function updateProduct(id, data) {
  const existing = prodRepo.getById(id);
  if (!existing) throw new AppError('المنتج غير موجود');

  const patch = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new AppError('اسم المنتج مطلوب');
    patch.name = data.name.trim();
  }
  if (data.category_id !== undefined) patch.category_id = data.category_id;
  if (data.price !== undefined) patch.price = Math.round(Number(data.price) * 100);
  if (data.sort_order !== undefined) patch.sort_order = data.sort_order;

  // Image: if new path provided, import it; if explicit null, clear it
  if (data.imagePath !== undefined) {
    if (data.imagePath) {
      patch.image_path = importImage(data.imagePath);
    } else {
      patch.image_path = null;
    }
  }

  return prodRepo.update(id, patch);
}

function setProductActive(id, active) {
  if (!prodRepo.getById(id)) throw new AppError('المنتج غير موجود');
  prodRepo.setActive(id, active);
}

function deleteProduct(id) {
  const existing = prodRepo.getById(id);
  if (!existing) throw new AppError('المنتج غير موجود');
  prodRepo.remove(id);
  if (existing.image_path) maybeDeleteImage(existing.image_path);
}

// ── Options ───────────────────────────────────────────────────────

function listOptions(productId) {
  return prodRepo.listOptions(productId);
}

function createOption(data) {
  const { product_id, type, label, price } = data;
  if (!['size', 'extra'].includes(type)) throw new AppError('نوع الخيار غير صحيح');
  if (!label?.trim()) throw new AppError('اسم الخيار مطلوب');
  if (!prodRepo.getById(product_id)) throw new AppError('المنتج غير موجود');
  return prodRepo.createOption({
    product_id,
    type,
    label: label.trim(),
    price: Math.round(Number(price || 0) * 100),
  });
}

function updateOption(id, data) {
  const patch = {};
  if (data.label !== undefined) patch.label = data.label.trim();
  if (data.price !== undefined) patch.price = Math.round(Number(data.price) * 100);
  prodRepo.updateOption(id, patch);
}

function deleteOption(id) {
  prodRepo.removeOption(id);
}

/**
 * Get the absolute filesystem path for a stored image filename.
 * Used by IPC to return a file:// URL the renderer can display.
 * @param {string} filename
 * @returns {string} absolute path
 */
function getImageAbsPath(filename) {
  if (!filename) return null;
  return path.join(getImagesDir(), filename);
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listProducts, createProduct, updateProduct, setProductActive, deleteProduct,
  listOptions, createOption, updateOption, deleteOption,
  importImage, getImageAbsPath,
};
