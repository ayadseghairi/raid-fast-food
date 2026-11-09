/**
 * Tests for shops service – CRUD, purchases, debt.
 * Tests for expenses service – CRUD, validation.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const shopSvc = await import('../electron/services/shops.js');
const expSvc  = await import('../electron/services/expenses.js');

function clearAll() {
  _db.exec(`
    DELETE FROM purchase_items; DELETE FROM purchases;
    DELETE FROM supplies; DELETE FROM shops;
    DELETE FROM expenses;
    DELETE FROM sqlite_sequence WHERE name IN
      ('purchase_items','purchases','supplies','shops','expenses');
  `);
}

beforeAll(() => clearAll());
beforeEach(() => clearAll());

// ── Shops ─────────────────────────────────────────────────────────

describe('shops service', () => {
  it('creates and lists shops', () => {
    shopSvc.createShop({ name: 'الجزار' });
    shopSvc.createShop({ name: 'الخبّاز' });
    const shops = shopSvc.listShops();
    expect(shops).toHaveLength(2);
  });

  it('throws when name is empty', () => {
    expect(() => shopSvc.createShop({ name: '' })).toThrow('اسم المورد مطلوب');
  });

  it('deletes a shop', () => {
    const shop = shopSvc.createShop({ name: 'عطار' });
    shopSvc.deleteShop(shop.id);
    expect(shopSvc.listShops()).toHaveLength(0);
  });
});

// ── Supplies ──────────────────────────────────────────────────────

describe('supplies', () => {
  it('creates and lists supplies for a shop', () => {
    const shop = shopSvc.createShop({ name: 'الجزار' });
    shopSvc.createSupply({ shop_id: shop.id, name: 'لحم بقر', approx_price: 2000 });
    shopSvc.createSupply({ shop_id: shop.id, name: 'دجاج', approx_price: 1500 });
    const s = shopSvc.listSupplies(shop.id);
    expect(s).toHaveLength(2);
  });
});

// ── Purchases ─────────────────────────────────────────────────────

describe('purchases service', () => {
  it('creates a purchase and computes total', () => {
    const shop = shopSvc.createShop({ name: 'الجزار' });
    const { purchase, items } = shopSvc.createPurchase({
      shop_id: shop.id,
      date: '2025-01-01',
      paid: 0,
      items: [
        { name: 'لحم', qty: 2, unit_price: 1500 },
        { name: 'دجاج', qty: 3, unit_price: 800 },
      ],
    });
    expect(purchase.total).toBe(2 * 150000 + 3 * 80000); // 150000 + 80000 in minor units... wait
    // Actually: unit_price is passed as decimal, service converts: 1500 * 100 = 150000
    expect(purchase.total).toBe(150000 * 2 + 80000 * 3);
    expect(items).toHaveLength(2);
  });

  it('records remaining debt correctly', () => {
    const shop = shopSvc.createShop({ name: 'الخبّاز' });
    shopSvc.createPurchase({
      shop_id: shop.id, date: '2025-01-01', paid: 500,
      items: [{ name: 'خبز', qty: 1, unit_price: 1000 }],
    });
    // total = 100000 minor, paid = 50000, remaining = 50000
    const debt = shopSvc.shopDebt(shop.id);
    expect(debt).toBe(100000 - 50000);
  });

  it('debtSummary returns total across all shops', () => {
    const s1 = shopSvc.createShop({ name: 'A' });
    const s2 = shopSvc.createShop({ name: 'B' });
    shopSvc.createPurchase({
      shop_id: s1.id, date: '2025-01-01', paid: 0,
      items: [{ name: 'item', qty: 1, unit_price: 200 }],
    });
    shopSvc.createPurchase({
      shop_id: s2.id, date: '2025-01-01', paid: 0,
      items: [{ name: 'item', qty: 1, unit_price: 300 }],
    });
    const { totalDebt } = shopSvc.debtSummary();
    expect(totalDebt).toBe(20000 + 30000);
  });

  it('throws when items array is empty', () => {
    const shop = shopSvc.createShop({ name: 'X' });
    expect(() => shopSvc.createPurchase({ shop_id: shop.id, date: '2025-01-01', items: [] }))
      .toThrow('أصناف الفاتورة مطلوبة');
  });
});

// ── Expenses ──────────────────────────────────────────────────────

describe('expenses service', () => {
  it('creates an expense', () => {
    const exp = expSvc.create({ name: 'كهرباء', amount: '150', date: '2025-01-01', category: 'electricity' });
    expect(exp.amount).toBe(15000);
    expect(exp.category).toBe('electricity');
  });

  it('lists all expenses', () => {
    expSvc.create({ name: 'إيجار', amount: '500', date: '2025-01-01', category: 'rent' });
    expSvc.create({ name: 'صيانة', amount: '200', date: '2025-01-02', category: 'maintenance' });
    const list = expSvc.list({});
    expect(list).toHaveLength(2);
  });

  it('filters by category', () => {
    expSvc.create({ name: 'كهرباء', amount: '100', date: '2025-01-01', category: 'electricity' });
    expSvc.create({ name: 'إيجار', amount: '500', date: '2025-01-01', category: 'rent' });
    const list = expSvc.list({ category: 'electricity' });
    expect(list).toHaveLength(1);
    expect(list[0].category).toBe('electricity');
  });

  it('throws on invalid category', () => {
    expect(() => expSvc.create({ name: 'x', amount: '100', date: '2025-01-01', category: 'unknown' }))
      .toThrow('فئة المصروف غير صحيحة');
  });

  it('throws on zero amount', () => {
    expect(() => expSvc.create({ name: 'x', amount: '0', date: '2025-01-01', category: 'other' }))
      .toThrow('المبلغ يجب أن يكون أكبر من صفر');
  });

  it('updates an expense', () => {
    const exp = expSvc.create({ name: 'قديم', amount: '100', date: '2025-01-01', category: 'other' });
    const updated = expSvc.update(exp.id, { name: 'جديد', amount: '200' });
    expect(updated.name).toBe('جديد');
    expect(updated.amount).toBe(20000);
  });

  it('deletes an expense', () => {
    const exp = expSvc.create({ name: 'مصروف', amount: '50', date: '2025-01-01', category: 'other' });
    expSvc.remove(exp.id);
    expect(expSvc.list({})).toHaveLength(0);
  });
});
