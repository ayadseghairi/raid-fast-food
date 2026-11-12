/**
 * Tests for product size pricing (Item 1).
 * - absolute: unit price = size price
 * - delta:    unit price = base + size price
 * - extras on top in both modes
 * - computeUnitPrice service function
 * - migration 002: size_price_mode column
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import migration002 from '../electron/db/migrations/002_size_price_mode.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
migration002.up(_db);
setDb(_db);

const catRepo  = await import('../electron/repositories/categories.js');
const prodRepo = await import('../electron/repositories/products.js');
const prodSvc  = await import('../electron/services/products.js');

function clearAll() {
  _db.exec(`
    DELETE FROM product_options; DELETE FROM products; DELETE FROM categories;
    DELETE FROM sqlite_sequence WHERE name IN ('product_options','products','categories');
  `);
}

describe('migration 002 – size_price_mode column', () => {
  it('products table has size_price_mode column defaulting to absolute', () => {
    clearAll();
    const cat = catRepo.create({ name: 'مشروبات' });
    const prod = prodRepo.create({ category_id: cat.id, name: 'بيبسي', price: 500 });
    expect(prod.size_price_mode).toBe('absolute');
  });

  it('rejects invalid size_price_mode', () => {
    clearAll();
    const cat = catRepo.create({ name: 'test' });
    const prod = prodRepo.create({ category_id: cat.id, name: 'x', price: 100 });
    expect(() =>
      _db.prepare("UPDATE products SET size_price_mode = 'invalid' WHERE id = ?").run(prod.id)
    ).toThrow();
  });
});

describe('computeUnitPrice – absolute mode', () => {
  it('returns sizePrice, ignores basePrice', () => {
    const price = prodSvc.computeUnitPrice({ basePrice: 1000, sizePriceMode: 'absolute', sizePrice: 9000 });
    expect(price).toBe(9000);
  });

  it('zero base does not affect result', () => {
    const price = prodSvc.computeUnitPrice({ basePrice: 0, sizePriceMode: 'absolute', sizePrice: 5000 });
    expect(price).toBe(5000);
  });
});

describe('computeUnitPrice – delta mode', () => {
  it('returns base + size', () => {
    const price = prodSvc.computeUnitPrice({ basePrice: 1000, sizePriceMode: 'delta', sizePrice: 500 });
    expect(price).toBe(1500);
  });

  it('delta with 0 add-on returns base price', () => {
    const price = prodSvc.computeUnitPrice({ basePrice: 2000, sizePriceMode: 'delta', sizePrice: 0 });
    expect(price).toBe(2000);
  });
});

describe('unit price computation with extras', () => {
  let catId;

  beforeEach(() => {
    clearAll();
    catId = catRepo.create({ name: 'مشروبات' }).id;
  });

  it('absolute: final = sizePrice + extras (base price irrelevant)', () => {
    const prod = prodRepo.create({ category_id: catId, name: 'عصير', price: 500 });
    prodRepo.update(prod.id, { size_price_mode: 'absolute' });

    // Simulate order logic: unit_price = computeUnitPrice + extraTotal
    const sizePrice = 9000;   // 90 DA
    const extraPrice = 500;   // 5 DA
    const unitPrice = prodSvc.computeUnitPrice({ basePrice: 500, sizePriceMode: 'absolute', sizePrice });
    const lineTotal = (unitPrice + extraPrice) * 1;

    expect(unitPrice).toBe(9000);          // size price is the full unit price
    expect(lineTotal).toBe(9500);          // + extra
  });

  it('delta: final = base + sizePrice + extras', () => {
    const prod = prodRepo.create({ category_id: catId, name: 'قهوة', price: 5000 });
    prodRepo.update(prod.id, { size_price_mode: 'delta' });

    const sizePrice = 2000;   // +20 DA addon
    const extraPrice = 300;   // 3 DA extra
    const unitPrice = prodSvc.computeUnitPrice({ basePrice: 5000, sizePriceMode: 'delta', sizePrice });
    const lineTotal = (unitPrice + extraPrice) * 2; // qty = 2

    expect(unitPrice).toBe(7000);      // 50 + 20 = 70 DA
    expect(lineTotal).toBe(14600);     // 70.03 DA × 2 = (7000+300)*2 = 14600
  });
});

describe('duplicate size name validation', () => {
  let catId, prodId;

  beforeEach(() => {
    clearAll();
    catId = catRepo.create({ name: 'مشروبات' }).id;
    prodId = prodRepo.create({ category_id: catId, name: 'عصير', price: 0 }).id;
  });

  it('rejects duplicate size name within same product', () => {
    prodSvc.createOption({ product_id: prodId, type: 'size', label: '0.5 لتر', price: 9000 });
    expect(() =>
      prodSvc.createOption({ product_id: prodId, type: 'size', label: '0.5 لتر', price: 12000 })
    ).toThrow('يوجد حجم بنفس الاسم');
  });

  it('allows same name for extras (not sizes)', () => {
    expect(() => {
      prodSvc.createOption({ product_id: prodId, type: 'extra', label: 'ثلج', price: 0 });
      prodSvc.createOption({ product_id: prodId, type: 'extra', label: 'ثلج', price: 0 });
    }).not.toThrow();
  });
});
