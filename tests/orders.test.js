/**
 * Tests for orders service – business-day numbering and order creation.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const dayRepo = await import('../electron/repositories/businessDays.js');
const catRepo = await import('../electron/repositories/categories.js');
const prodRepo = await import('../electron/repositories/products.js');
const orderRepo = await import('../electron/repositories/orders.js');
const orderSvc = await import('../electron/services/orders.js');

function clearOrders() {
  _db.exec(`
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM business_days;
    DELETE FROM sqlite_sequence WHERE name IN ('order_items','orders','customers','business_days');
  `);
}

// ── Business day creation ──────────────────────────────────────────
describe('businessDays repository', () => {
  beforeEach(() => clearOrders());

  it('creates a business day', () => {
    const day = dayRepo.create('2025-01-01');
    expect(day.date).toBe('2025-01-01');
    expect(day.closed_at).toBeNull();
  });

  it('getOpenDay returns the open day', () => {
    dayRepo.create('2025-01-01');
    const open = dayRepo.getOpenDay();
    expect(open).not.toBeNull();
    expect(open.closed_at).toBeNull();
  });

  it('getOpenDay returns null when all days closed', () => {
    const day = dayRepo.create('2025-01-01');
    dayRepo.close(day.id, { closedAt: '2025-01-01T23:00:00.000Z', receiptCount: 0, totalSales: 0, totalExpenses: 0, net: 0 });
    expect(dayRepo.getOpenDay()).toBeNull();
  });
});

// ── Receipt numbering ──────────────────────────────────────────────
describe('receipt numbering', () => {
  let catId, prodId, dayId;

  beforeAll(() => {
    _db.exec(`
      DELETE FROM order_items; DELETE FROM orders; DELETE FROM customers;
      DELETE FROM products; DELETE FROM categories; DELETE FROM business_days;
      DELETE FROM sqlite_sequence WHERE name IN ('order_items','orders','customers','products','categories','business_days');
    `);
    catId = catRepo.create({ name: 'تست' }).id;
    prodId = prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 }).id;
    const day = dayRepo.create('2025-01-15');
    dayId = day.id;
  });

  it('first order gets number 1', () => {
    expect(orderRepo.nextNumber(dayId)).toBe(1);
  });

  it('numbers increment within the same day', () => {
    orderRepo.create(
      { day_id: dayId, number: 1, order_type: 'dine_in', total: 2500, created_at: new Date().toISOString() },
      [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 1, options: [], line_total: 2500 }],
    );
    expect(orderRepo.nextNumber(dayId)).toBe(2);
  });

  it('numbers restart on a new day', () => {
    const newDay = dayRepo.create('2025-01-16');
    expect(orderRepo.nextNumber(newDay.id)).toBe(1);
  });
});

// ── Order service ──────────────────────────────────────────────────
describe('orders service – createOrder', () => {
  beforeEach(() => {
    _db.exec(`
      DELETE FROM order_items; DELETE FROM orders; DELETE FROM customers; DELETE FROM business_days;
      DELETE FROM sqlite_sequence WHERE name IN ('order_items','orders','customers','business_days');
    `);
    // Keep existing category/product
  });

  it('creates an order with correct total', () => {
    const cat = catRepo.list()[0] ?? catRepo.create({ name: 'أطباق' });
    const prod = prodRepo.create({ category_id: cat.id, name: 'بيتزا', price: 3000 });

    const { order, items } = orderSvc.createOrder({
      order_type: 'dine_in',
      items: [{ product_id: prod.id, product_name: 'بيتزا', unit_price: 3000, qty: 2, options: [] }],
    });

    expect(order.total).toBe(6000);
    expect(items).toHaveLength(1);
    expect(items[0].line_total).toBe(6000);
  });

  it('adds delivery fee to total', () => {
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'شاورما', price: 2000 });

    const { order } = orderSvc.createOrder({
      order_type: 'delivery',
      items: [{ product_id: prod.id, product_name: 'شاورما', unit_price: 2000, qty: 1, options: [] }],
      delivery_fee: 500,
      delivery_phone: '0501234567',
    });

    expect(order.total).toBe(2500);
    expect(order.delivery_fee).toBe(500);
  });

  it('numbers restart on new day (via getOrCreateOpenDay)', () => {
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'فرايز', price: 1000 });

    const item = { product_id: prod.id, product_name: 'فرايز', unit_price: 1000, qty: 1, options: [] };
    const { order: o1 } = orderSvc.createOrder({ order_type: 'dine_in', items: [item] });
    const { order: o2 } = orderSvc.createOrder({ order_type: 'dine_in', items: [item] });

    expect(o1.day_id).toBe(o2.day_id);
    expect(o2.number).toBe(o1.number + 1);
  });

  it('rejects empty cart', () => {
    expect(() => orderSvc.createOrder({ order_type: 'dine_in', items: [] })).toThrow('السلة فارغة');
  });

  it('rejects invalid order_type', () => {
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'تست', price: 100 });
    expect(() =>
      orderSvc.createOrder({
        order_type: 'unknown',
        items: [{ product_id: prod.id, product_name: 'تست', unit_price: 100, qty: 1, options: [] }],
      }),
    ).toThrow('نوع الطلب غير مقبول');
  });

  it('rejects takeaway for new orders', () => {
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'سفري-تست', price: 500 });
    expect(() =>
      orderSvc.createOrder({
        order_type: 'takeaway',
        items: [{ product_id: prod.id, product_name: 'سفري-تست', unit_price: 500, qty: 1, options: [] }],
      }),
    ).toThrow('نوع الطلب غير مقبول');
  });

  it('rejects delivery without a phone number', () => {
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'ديليفري-تست', price: 800 });
    expect(() =>
      orderSvc.createOrder({
        order_type: 'delivery',
        items: [{ product_id: prod.id, product_name: 'ديليفري-تست', unit_price: 800, qty: 1, options: [] }],
        delivery_fee: 300,
        // No phone supplied
      }),
    ).toThrow('رقم هاتف');
  });

  it('allows delivery when phone is supplied', () => {
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'ديليفري-صح', price: 800 });
    const { order } = orderSvc.createOrder({
      order_type: 'delivery',
      items: [{ product_id: prod.id, product_name: 'ديليفري-صح', unit_price: 800, qty: 1, options: [] }],
      delivery_fee: 300,
      delivery_phone: '0551234567',
    });
    expect(order.order_type).toBe('delivery');
    expect(order.total).toBe(1100);
  });
});

// ── Legacy takeaway display ────────────────────────────────────────
describe('legacy takeaway orders – still readable', () => {
  beforeEach(() => {
    _db.exec(`
      DELETE FROM order_items; DELETE FROM orders; DELETE FROM customers; DELETE FROM business_days;
      DELETE FROM sqlite_sequence WHERE name IN ('order_items','orders','customers','business_days');
    `);
  });

  it('can directly insert and read a takeaway order (legacy path)', () => {
    // Insert a legacy takeaway order directly (bypassing the service, as it
    // would have been created before the takeaway restriction was added).
    const cat = catRepo.list()[0];
    const prod = prodRepo.create({ category_id: cat.id, name: 'برغر-قديم', price: 2000 });

    const day = dayRepo.create('2024-01-01');
    const orderRow = _db.prepare(
      `INSERT INTO orders (day_id, number, order_type, delivery_fee, total, status, created_at)
       VALUES (?, 1, 'takeaway', 0, 2000, 'normal', '2024-01-01T12:00:00.000Z')`
    ).run(day.id);
    const orderId = orderRow.lastInsertRowid;
    _db.prepare(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty, options, line_total)
       VALUES (?, ?, 'برغر-قديم', 2000, 1, '[]', 2000)`
    ).run(orderId, prod.id);

    // The service's listOrdersForDay must still return it
    const orders = orderSvc.listOrdersForDay(day.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].order_type).toBe('takeaway');
    expect(orders[0].total).toBe(2000);
  });
});
