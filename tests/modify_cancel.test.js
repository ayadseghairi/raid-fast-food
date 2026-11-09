/**
 * Tests for orders service – modify, cancel, and audit log.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const catRepo  = await import('../electron/repositories/categories.js');
const prodRepo = await import('../electron/repositories/products.js');
const orderSvc = await import('../electron/services/orders.js');
const auditSvc = await import('../electron/services/audit.js');

let catId, prodId, prod2Id;

function clearOrders() {
  _db.exec(`
    DELETE FROM audit_log;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM business_days;
    DELETE FROM sqlite_sequence WHERE name IN ('audit_log','order_items','orders','customers','business_days');
  `);
}

beforeAll(() => {
  // Seed a category and two products (once for the whole file)
  _db.exec(`
    DELETE FROM product_options; DELETE FROM order_items; DELETE FROM orders;
    DELETE FROM customers; DELETE FROM business_days; DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM sqlite_sequence WHERE name IN
      ('audit_log','order_items','orders','customers','business_days','products','categories');
  `);
  catId  = catRepo.create({ name: 'وجبات' }).id;
  prodId = prodRepo.create({ category_id: catId, name: 'برغر', price: 2500 }).id;
  prod2Id = prodRepo.create({ category_id: catId, name: 'فرايز', price: 1000 }).id;
});

beforeEach(() => clearOrders());

// ── Helpers ────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return orderSvc.createOrder({
    order_type: 'dine_in',
    items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 1, options: [] }],
    ...overrides,
  });
}

// ── Modify ────────────────────────────────────────────────────────

describe('modifyOrder', () => {
  it('updates total and sets status to modified', () => {
    const { order } = makeOrder();
    expect(order.total).toBe(2500);

    const res = orderSvc.modifyOrder(order.id, {
      items: [{ product_id: prod2Id, product_name: 'فرايز', unit_price: 1000, qty: 2, options: [] }],
    });

    expect(res.order.status).toBe('modified');
    expect(res.order.total).toBe(2000);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].product_name).toBe('فرايز');
  });

  it('updates delivery fee', () => {
    const { order } = makeOrder({ order_type: 'delivery', delivery_phone: '0501234567' });
    const res = orderSvc.modifyOrder(order.id, {
      items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 1, options: [] }],
      delivery_fee: 700,
    });
    expect(res.order.delivery_fee).toBe(700);
    expect(res.order.total).toBe(3200);
  });

  it('throws on cancelled order', () => {
    const { order } = makeOrder();
    orderSvc.cancelOrder(order.id);
    expect(() => orderSvc.modifyOrder(order.id, {
      items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 1, options: [] }],
    })).toThrow('لا يمكن تعديل طلب ملغي');
  });

  it('throws on empty items', () => {
    const { order } = makeOrder();
    expect(() => orderSvc.modifyOrder(order.id, { items: [] })).toThrow('السلة فارغة');
  });

  it('throws on non-existent order', () => {
    expect(() => orderSvc.modifyOrder(9999, {
      items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 1, options: [] }],
    })).toThrow('الطلب غير موجود');
  });
});

// ── Cancel ────────────────────────────────────────────────────────

describe('cancelOrder', () => {
  it('sets status to cancelled', () => {
    const { order } = makeOrder();
    const res = orderSvc.cancelOrder(order.id);
    expect(res.order.status).toBe('cancelled');
  });

  it('throws on already-cancelled order', () => {
    const { order } = makeOrder();
    orderSvc.cancelOrder(order.id);
    expect(() => orderSvc.cancelOrder(order.id)).toThrow('الطلب ملغي مسبقاً');
  });

  it('throws on non-existent order', () => {
    expect(() => orderSvc.cancelOrder(9999)).toThrow('الطلب غير موجود');
  });
});

// ── Audit log ─────────────────────────────────────────────────────

describe('audit log', () => {
  it('logs a modify action', () => {
    const { order } = makeOrder();
    orderSvc.modifyOrder(order.id, {
      items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 2, options: [] }],
    });

    const logs = auditSvc.listForOrder(order.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('modify');
    expect(logs[0].detail.before.total).toBe(2500);
  });

  it('logs a cancel action', () => {
    const { order } = makeOrder();
    orderSvc.cancelOrder(order.id);

    const logs = auditSvc.listForOrder(order.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('cancel');
    expect(logs[0].order_id).toBe(order.id);
  });

  it('records both audit entries when modified then cancelled', () => {
    const { order } = makeOrder();
    orderSvc.modifyOrder(order.id, {
      items: [{ product_id: prodId, product_name: 'برغر', unit_price: 2500, qty: 2, options: [] }],
    });
    orderSvc.cancelOrder(order.id);

    const logs = auditSvc.listForOrder(order.id);
    expect(logs).toHaveLength(2);
    // Newest first
    expect(logs[0].action).toBe('cancel');
    expect(logs[1].action).toBe('modify');
  });
});
