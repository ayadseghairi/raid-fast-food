/**
 * Tests for categories and products repositories (Phase 2).
 * Uses dynamic imports so setDb() runs before any repo module loads.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

// ── One-time setup: inject db BEFORE repos are imported ────────────
const _testDb = new Database(':memory:');
_testDb.pragma('foreign_keys = ON');
migration001.up(_testDb);
setDb(_testDb);

// Dynamic imports — run AFTER setDb() above (module-level code order)
const catRepo = await import('../electron/repositories/categories.js');
const prodRepo = await import('../electron/repositories/products.js');

function clearTables() {
  _testDb.exec(`
    DELETE FROM product_options;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM sqlite_sequence WHERE name IN
      ('product_options','order_items','orders','products','categories');
  `);
}

// ── Categories ─────────────────────────────────────────────────────
describe('categories repository', () => {
  beforeEach(() => clearTables());

  it('creates and lists a category', () => {
    const row = catRepo.create({ name: 'وجبات', sort_order: 0 });
    expect(row.name).toBe('وجبات');
    expect(row.id).toBeGreaterThan(0);
    expect(catRepo.list()).toHaveLength(1);
  });

  it('updates a category name', () => {
    const row = catRepo.create({ name: 'قديم' });
    expect(catRepo.update(row.id, { name: 'جديد' }).name).toBe('جديد');
  });

  it('deletes a category', () => {
    const row = catRepo.create({ name: 'مؤقتة' });
    catRepo.remove(row.id);
    expect(catRepo.list()).toHaveLength(0);
  });

  it('sorts by sort_order', () => {
    catRepo.create({ name: 'ب', sort_order: 2 });
    catRepo.create({ name: 'أ', sort_order: 1 });
    const list = catRepo.list();
    expect(list[0].name).toBe('أ');
    expect(list[1].name).toBe('ب');
  });
});

// ── Products ───────────────────────────────────────────────────────
describe('products repository', () => {
  let catId;

  beforeEach(() => {
    clearTables();
    catId = catRepo.create({ name: 'مشويات' }).id;
  });

  it('creates a product with price in minor units', () => {
    const row = prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 });
    expect(row.name).toBe('برغر');
    expect(row.price).toBe(2500);
    expect(row.active).toBe(1);
  });

  it('lists products by category', () => {
    prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 });
    prodRepo.create({ category_id: catId, name: 'دجاج', price: 2000 });
    expect(prodRepo.listByCategory(catId)).toHaveLength(2);
  });

  it('does not list products of another category', () => {
    const cat2 = catRepo.create({ name: 'مشروبات' });
    prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 });
    prodRepo.create({ category_id: cat2.id, name: 'بيبسي', price: 500 });
    expect(prodRepo.listByCategory(catId)).toHaveLength(1);
    expect(prodRepo.listByCategory(cat2.id)).toHaveLength(1);
  });

  it('updates product price', () => {
    const row = prodRepo.create({ category_id: catId, name: 'بيتزا', price: 3000 });
    expect(prodRepo.update(row.id, { price: 3500 }).price).toBe(3500);
  });

  it('toggles active state', () => {
    const row = prodRepo.create({ category_id: catId, name: 'شاورما', price: 1800 });
    prodRepo.setActive(row.id, false);
    expect(prodRepo.getById(row.id).active).toBe(0);
    prodRepo.setActive(row.id, true);
    expect(prodRepo.getById(row.id).active).toBe(1);
  });

  it('cascade-deletes products when category deleted', () => {
    const prod = prodRepo.create({ category_id: catId, name: 'فرايز', price: 500 });
    catRepo.remove(catId);
    expect(prodRepo.getById(prod.id)).toBeUndefined();
  });
});

// ── Product options ────────────────────────────────────────────────
describe('product_options repository', () => {
  let prodId;

  beforeEach(() => {
    clearTables();
    const cat = catRepo.create({ name: 'مشروبات' });
    prodId = prodRepo.create({ category_id: cat.id, name: 'بيبسي', price: 500 }).id;
  });

  it('creates and lists options', () => {
    prodRepo.createOption({ product_id: prodId, type: 'size', label: 'صغير', price: 0 });
    prodRepo.createOption({ product_id: prodId, type: 'size', label: 'كبير', price: 100 });
    const opts = prodRepo.listOptions(prodId);
    expect(opts).toHaveLength(2);
    expect(opts[0].type).toBe('size');
  });

  it('updates option label and price', () => {
    const opt = prodRepo.createOption({ product_id: prodId, type: 'extra', label: 'ثلج', price: 0 });
    prodRepo.updateOption(opt.id, { label: 'ثلج إضافي', price: 50 });
    expect(prodRepo.listOptions(prodId)[0].label).toBe('ثلج إضافي');
    expect(prodRepo.listOptions(prodId)[0].price).toBe(50);
  });

  it('removes an option', () => {
    const opt = prodRepo.createOption({ product_id: prodId, type: 'extra', label: 'جبن', price: 200 });
    prodRepo.removeOption(opt.id);
    expect(prodRepo.listOptions(prodId)).toHaveLength(0);
  });

  it('rejects invalid option type at DB level', () => {
    expect(() =>
      prodRepo.createOption({ product_id: prodId, type: 'invalid', label: 'x', price: 0 })
    ).toThrow();
  });
});
