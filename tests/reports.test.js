/**
 * Tests for the reports service.
 * Verifies aggregation: sales totals, purchase totals, debts, expenses, product ranking.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const catRepo   = await import('../electron/repositories/categories.js');
const prodRepo  = await import('../electron/repositories/products.js');
const dayRepo   = await import('../electron/repositories/businessDays.js');
const shopRepo  = await import('../electron/repositories/shops.js');
const orderSvc  = await import('../electron/services/orders.js');
const reportSvc = await import('../electron/services/reports.js');

let catId, prodId1, prodId2;
let shopId;

function clearOrders() {
  _db.exec(`
    DELETE FROM audit_log;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM expenses;
    DELETE FROM purchase_items;
    DELETE FROM purchases;
    DELETE FROM business_days;
    DELETE FROM sqlite_sequence WHERE name IN
      ('audit_log','order_items','orders','expenses',
       'purchase_items','purchases','business_days');
  `);
}

beforeAll(() => {
  _db.exec(`
    DELETE FROM product_options; DELETE FROM products; DELETE FROM categories;
    DELETE FROM supplies; DELETE FROM shops;
    DELETE FROM sqlite_sequence WHERE name IN
      ('product_options','products','categories','supplies','shops');
  `);

  catId   = catRepo.create({ name: 'وجبات' }).id;
  prodId1 = prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 }).id;
  prodId2 = prodRepo.create({ category_id: catId, name: 'بيتزا', price: 5000 }).id;
  shopId  = shopRepo.create({ name: 'الجزار' }).id;
});

beforeEach(() => clearOrders());

// ── Helpers ────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return orderSvc.createOrder({
    order_type: 'dine_in',
    items: [{ product_id: prodId1, product_name: 'برغر', unit_price: 2500, qty: 1, options: [] }],
    ...overrides,
  });
}

function insertPurchase(date, total, paid) {
  const db = _db;
  const info = db.prepare(
    'INSERT INTO purchases (shop_id, date, total, paid) VALUES (?, ?, ?, ?)'
  ).run(shopId, date, total, paid);
  return info.lastInsertRowid;
}

function insertExpense(date, amount, category = 'other') {
  _db.prepare(
    `INSERT INTO expenses (name, amount, date, category) VALUES ('مصروف', ?, ?, ?)`
  ).run(amount, date, category);
}

// ── resolveDateRange ───────────────────────────────────────────────

describe('resolveDateRange', () => {
  it('returns today for period=day', () => {
    const today = new Date().toISOString().slice(0, 10);
    const { from, to } = reportSvc.resolveDateRange('day');
    expect(from).toBe(today);
    expect(to).toBe(today);
  });

  it('validates custom range', () => {
    const { from, to } = reportSvc.resolveDateRange('custom', '2025-01-01', '2025-01-31');
    expect(from).toBe('2025-01-01');
    expect(to).toBe('2025-01-31');
  });

  it('throws for missing custom dates', () => {
    expect(() => reportSvc.resolveDateRange('custom')).toThrow('يجب تحديد');
  });

  it('throws for reversed custom dates', () => {
    expect(() => reportSvc.resolveDateRange('custom', '2025-12-31', '2025-01-01')).toThrow(
      'تاريخ البداية'
    );
  });
});

// ── Sales aggregation ──────────────────────────────────────────────

describe('getReport – sales', () => {
  it('returns zero sales when no orders in range', () => {
    // Create a business day so the date exists but add no orders
    const today = new Date().toISOString().slice(0, 10);
    dayRepo.create(today);

    const report = reportSvc.getReport({ period: 'day' });
    expect(report.sales.receiptCount).toBe(0);
    expect(report.sales.totalSales).toBe(0);
  });

  it('sums sales for the date range', () => {
    makeOrder();
    makeOrder({ order_type: 'takeaway' });

    const report = reportSvc.getReport({ period: 'day' });
    expect(report.sales.receiptCount).toBe(2);
    expect(report.sales.totalSales).toBe(5000); // 2 × 2500
  });

  it('excludes cancelled orders', () => {
    makeOrder();
    const { order: o2 } = makeOrder();
    orderSvc.cancelOrder(o2.id);

    const report = reportSvc.getReport({ period: 'day' });
    expect(report.sales.receiptCount).toBe(1);
    expect(report.sales.totalSales).toBe(2500);
  });

  it('breaks down by order type', () => {
    makeOrder({ order_type: 'dine_in' });
    makeOrder({ order_type: 'takeaway' });
    makeOrder({
      order_type: 'delivery',
      delivery_fee: 500,
      delivery_phone: '0501234567',
    });

    const { byType } = reportSvc.getReport({ period: 'day' }).sales;
    expect(byType.dine_in).toBe(2500);
    expect(byType.takeaway).toBe(2500);
    expect(byType.delivery).toBe(3000); // 2500 + 500
  });
});

// ── Purchases aggregation ──────────────────────────────────────────

describe('getReport – purchases', () => {
  it('aggregates purchase totals by shop', () => {
    insertPurchase('2025-06-01', 10000, 6000);
    insertPurchase('2025-06-05', 5000,  5000);

    const { purchases } = reportSvc.getReport({
      period: 'custom',
      dateFrom: '2025-06-01',
      dateTo: '2025-06-30',
    });

    expect(purchases.totalPurchases).toBe(15000);
    expect(purchases.totalPaid).toBe(11000);

    const shopRow = purchases.rows.find(r => r.shop_id === shopId);
    expect(shopRow).toBeTruthy();
    expect(shopRow.remaining).toBe(4000); // 10000 - 6000
  });

  it('returns 0 when no purchases in range', () => {
    const { purchases } = reportSvc.getReport({
      period: 'custom',
      dateFrom: '2020-01-01',
      dateTo: '2020-01-31',
    });
    expect(purchases.totalPurchases).toBe(0);
  });
});

// ── Remaining debts (all-time) ─────────────────────────────────────

describe('getReport – remaining debts', () => {
  it('returns debts regardless of date filter', () => {
    // Old purchase outside the query range
    insertPurchase('2020-01-01', 8000, 3000); // remaining = 5000

    const { remainingDebts } = reportSvc.getReport({
      period: 'custom',
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
    });

    const shopRow = remainingDebts.find(r => r.shop_id === shopId);
    expect(shopRow.remaining).toBe(5000);
  });
});

// ── Expenses aggregation ───────────────────────────────────────────

describe('getReport – expenses', () => {
  it('sums expenses by category', () => {
    insertExpense('2025-06-10', 3000, 'electricity');
    insertExpense('2025-06-15', 1500, 'electricity');
    insertExpense('2025-06-20', 8000, 'rent');

    const { expenses } = reportSvc.getReport({
      period: 'custom',
      dateFrom: '2025-06-01',
      dateTo: '2025-06-30',
    });

    expect(expenses.totalExpenses).toBe(12500);
    const elec = expenses.rows.find(r => r.category === 'electricity');
    expect(elec.total).toBe(4500);
  });
});

// ── Product ranking ────────────────────────────────────────────────

describe('getReport – product ranking', () => {
  it('ranks products by quantity sold', () => {
    // Sell برغر twice, بيتزا once
    makeOrder();
    makeOrder();
    orderSvc.createOrder({
      order_type: 'dine_in',
      items: [{ product_id: prodId2, product_name: 'بيتزا', unit_price: 5000, qty: 1, options: [] }],
    });

    const { products } = reportSvc.getReport({ period: 'day' });
    expect(products.best[0].product_name).toBe('برغر');
    expect(products.best[0].total_qty).toBe(2);
    expect(products.worst[0].product_name).toBe('بيتزا');
  });
});

// ── Net calculation ────────────────────────────────────────────────

describe('getReport – net', () => {
  it('computes net = sales − expenses (in range) − purchases (in range)', () => {
    const today = new Date().toISOString().slice(0, 10);
    makeOrder(); // 2500 sales
    insertExpense(today, 500, 'other');
    insertPurchase(today, 1000, 0);

    const { net } = reportSvc.getReport({ period: 'day' });
    expect(net).toBe(2500 - 500 - 1000); // 1000
  });
});
