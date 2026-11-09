/**
 * Tests for day-close service – totals, net, byType, reminders.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const catRepo      = await import('../electron/repositories/categories.js');
const prodRepo     = await import('../electron/repositories/products.js');
const dayRepo      = await import('../electron/repositories/businessDays.js');
const orderSvc     = await import('../electron/services/orders.js');
const dayCloseSvc  = await import('../electron/services/dayClose.js');

let catId, prodId;

function clearAll() {
  _db.exec(`
    DELETE FROM audit_log;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM expenses;
    DELETE FROM business_days;
    DELETE FROM sqlite_sequence WHERE name IN
      ('audit_log','order_items','orders','customers','expenses','business_days');
  `);
}

beforeAll(() => {
  _db.exec(`
    DELETE FROM product_options; DELETE FROM products; DELETE FROM categories;
    DELETE FROM sqlite_sequence WHERE name IN ('product_options','products','categories');
  `);
  catId  = catRepo.create({ name: 'وجبات' }).id;
  prodId = prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 }).id;
});

beforeEach(() => clearAll());

// ── Helper ─────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return orderSvc.createOrder({
    order_type: 'dine_in',
    items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 1, options: [] }],
    ...overrides,
  });
}

// ── closeDay ───────────────────────────────────────────────────────

describe('closeDay', () => {
  it('closes an open day and writes correct totals', () => {
    makeOrder();                            // 2500
    makeOrder({ order_type: 'takeaway' }); // 2500
    const result = dayCloseSvc.closeDay();

    expect(result.receiptCount).toBe(2);
    expect(result.totalSales).toBe(5000);
    expect(result.totalExpenses).toBe(0);
    expect(result.net).toBe(5000);
    expect(result.day.closed_at).not.toBeNull();
  });

  it('excludes cancelled orders from totals', () => {
    makeOrder();                               // 2500 – normal
    const { order: o2 } = makeOrder();         // 2500 – will cancel
    orderSvc.cancelOrder(o2.id);

    const result = dayCloseSvc.closeDay();
    expect(result.receiptCount).toBe(1);
    expect(result.totalSales).toBe(2500);     // only o1
  });

  it('counts sales by order type', () => {
    makeOrder({ order_type: 'dine_in' });
    makeOrder({ order_type: 'takeaway' });
    makeOrder({
      order_type: 'delivery',
      delivery_fee: 500,
      delivery_phone: '0501234567',
    });

    const { byType } = dayCloseSvc.closeDay();
    expect(byType.dine_in).toBe(2500);
    expect(byType.takeaway).toBe(2500);
    expect(byType.delivery).toBe(3000);       // 2500 + 500 fee
  });

  it('subtracts expenses from net', () => {
    makeOrder();                              // sales = 2500
    const day = dayRepo.getOpenDay();
    // Insert an expense directly
    _db.prepare(
      `INSERT INTO expenses (day_id, name, amount, date, category)
       VALUES (?, 'كهرباء', 800, '2025-01-01', 'electricity')`
    ).run(day.id);

    const result = dayCloseSvc.closeDay();
    expect(result.totalExpenses).toBe(800);
    expect(result.net).toBe(1700);           // 2500 - 800
  });

  it('throws when no open day', () => {
    expect(() => dayCloseSvc.closeDay()).toThrow('لا يوجد يوم مفتوح');
  });

  it('throws when called twice on the same day', () => {
    makeOrder();
    dayCloseSvc.closeDay();
    expect(() => dayCloseSvc.closeDay()).toThrow('لا يوجد يوم مفتوح');
  });
});

// ── getDayReport ───────────────────────────────────────────────────

describe('getDayReport', () => {
  it('returns full report for a closed day', () => {
    makeOrder();
    makeOrder();
    const { day } = dayCloseSvc.closeDay();

    const report = dayCloseSvc.getDayReport(day.id);
    expect(report.receiptCount).toBe(2);
    expect(report.totalSales).toBe(5000);
    expect(report.day.id).toBe(day.id);
    expect(report.byType.dine_in).toBe(5000);
  });

  it('throws for non-existent day id', () => {
    expect(() => dayCloseSvc.getDayReport(9999)).toThrow('اليوم غير موجود');
  });
});

// ── checkReminders ─────────────────────────────────────────────────

describe('checkReminders', () => {
  it('returns no reminder when only today is open', () => {
    // getOrCreateOpenDay creates today's day
    orderSvc.getOrCreateOpenDay();
    const result = dayCloseSvc.checkReminders();
    expect(result.showReminder).toBe(false);
    expect(result.unclosedCount).toBe(0);
  });

  it('detects a stale open day from a previous date', () => {
    // Create and close today's day first, then create a "yesterday" day manually
    dayRepo.create('2020-01-01');  // stale open day

    const result = dayCloseSvc.checkReminders();
    expect(result.showReminder).toBe(true);
    expect(result.unclosedCount).toBeGreaterThanOrEqual(1);
  });
});
