/**
 * Delivery fee round-trip tests.
 *
 * Verifies:
 *  1. toMinor / fromMinor / format helpers for fee amounts
 *  2. Renderer logic: typing "5", "50", "50.5", "0" → feeMinor → display
 *  3. Order total = items + delivery fee exactly
 *  4. IPC layer does NOT double-convert (fee arrives as minor units)
 *  5. Default delivery fee setting round-trips: save 50 DA → stored 5000 →
 *     loaded back as 50 → POS pre-fills "50" → feeMinor = 5000
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';
import { toMinor, fromMinor, format } from '../electron/utils/money.js';

// ── In-memory DB setup ─────────────────────────────────────────────
const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const catRepo   = await import('../electron/repositories/categories.js');
const prodRepo  = await import('../electron/repositories/products.js');
const orderSvc  = await import('../electron/services/orders.js');
const settRepo  = await import('../electron/repositories/settings.js');

// ── Seed: category + product ───────────────────────────────────────
let prodId;
{
  const cat  = catRepo.create({ name: 'طعام', sort_order: 0 });
  const prod = prodRepo.create({ category_id: cat.id, name: 'بيتزا', price: 100000 }); // 1000.00 DA
  prodId = prod.id;
}

function clearOrders() {
  _db.exec(`
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM business_days;
    DELETE FROM sqlite_sequence WHERE name IN
      ('order_items','orders','customers','business_days');
  `);
}

// ── Helper: replicate exactly what PosScreen does ──────────────────
// deliveryFeeString → renderer state string from NumPad
// feeMinor          → what ordersCreate receives
function rendererToFeeMinor(deliveryFeeString) {
  return toMinor(deliveryFeeString);
}

// ── 1. toMinor / fromMinor / format round-trips ────────────────────

describe('money helpers – delivery fee amounts', () => {
  const cases = [
    { input: '5',    minor: 500,  display: '5.00'  },
    { input: '50',   minor: 5000, display: '50.00' },
    { input: '50.5', minor: 5050, display: '50.50' },
    { input: '0',    minor: 0,    display: '0.00'  },
    { input: '0.01', minor: 1,    display: '0.01'  },
    { input: '100',  minor: 10000,display: '100.00'},
  ];

  for (const { input, minor, display } of cases) {
    it(`"${input}" → toMinor=${minor}, format="${display}"`, () => {
      expect(toMinor(input)).toBe(minor);
      expect(format(minor)).toBe(display);
      // round-trip: minor → fromMinor → toString → toMinor
      expect(toMinor(fromMinor(minor).toString())).toBe(minor);
    });
  }
});

// ── 2. POS renderer fee math ───────────────────────────────────────

describe('POS renderer: feeMinor and grandTotal', () => {
  it('typing "50" gives feeMinor=5000 and displays "50.00"', () => {
    const feeMinor = rendererToFeeMinor('50');
    expect(feeMinor).toBe(5000);
    expect(format(feeMinor)).toBe('50.00');
  });

  it('typing "5" gives feeMinor=500 and displays "5.00"', () => {
    const feeMinor = rendererToFeeMinor('5');
    expect(feeMinor).toBe(500);
    expect(format(feeMinor)).toBe('5.00');
  });

  it('grandTotal = cartTotal + feeMinor', () => {
    // product price 1000.00 DA = 100000 minor units
    const cartTotal = 100000;
    const feeMinor  = rendererToFeeMinor('50');  // 5000
    const grandTotal = cartTotal + feeMinor;
    expect(grandTotal).toBe(105000);
    expect(format(grandTotal)).toBe('1050.00');
  });

  it('fee "0" gives grandTotal = cartTotal exactly', () => {
    const cartTotal  = 100000;
    const feeMinor   = rendererToFeeMinor('0');
    const grandTotal = cartTotal + feeMinor;
    expect(grandTotal).toBe(100000);
  });
});

// ── 3. IPC layer: NO double-conversion ───────────────────────────
// The IPC handler receives already-minor-unit integers from the renderer.
// It must store them as-is (Math.floor, NOT toMinor again).

describe('IPC delivery_fee passthrough (no double-convert)', () => {
  it('Math.floor of an already-minor integer is identity', () => {
    const alreadyMinor = 5000;  // renderer sent toMinor("50")
    // Replicate the ipc/orders.js logic AFTER the fix:
    const fee = Number.isInteger(Number(alreadyMinor))
      ? Math.max(0, Math.floor(Number(alreadyMinor)))
      : 0;
    expect(fee).toBe(5000);
  });

  it('toMinor applied twice would corrupt: toMinor(5000)=500000', () => {
    // This documents the BUG that was fixed:
    expect(toMinor(5000)).toBe(500000);  // confirms double-convert is wrong
  });
});

// ── 4. Order service stores and retrieves fee correctly ────────────

describe('createOrder: delivery fee stored and retrieved as minor units', () => {
  beforeEach(() => clearOrders());

  it('fee typed "50" → stored 5000 → order.delivery_fee=5000 → format "50.00"', () => {
    const feeMinor = rendererToFeeMinor('50');  // what renderer sends
    expect(feeMinor).toBe(5000);

    const { order } = orderSvc.createOrder({
      order_type:     'delivery',
      delivery_phone: '0551234567',
      delivery_name:  'test',
      delivery_fee:   feeMinor,   // 5000 — no second toMinor in IPC after fix
      items: [{
        product_id:   prodId,
        product_name: 'بيتزا',
        unit_price:   100000,
        qty:          1,
        options:      [],
      }],
    });

    expect(order.delivery_fee).toBe(5000);
    expect(format(order.delivery_fee)).toBe('50.00');
    // total = 100000 (item) + 5000 (fee) = 105000
    expect(order.total).toBe(105000);
    expect(format(order.total)).toBe('1050.00');
  });

  it('fee typed "5" → stored 500 → total = items + 500', () => {
    const feeMinor = rendererToFeeMinor('5');
    const { order } = orderSvc.createOrder({
      order_type:     'delivery',
      delivery_phone: '0551234567',
      delivery_name:  'test',
      delivery_fee:   feeMinor,
      items: [{
        product_id:   prodId,
        product_name: 'بيتزا',
        unit_price:   100000,
        qty:          2,
        options:      [],
      }],
    });

    expect(order.delivery_fee).toBe(500);
    expect(order.total).toBe(200500);  // 2×100000 + 500
    expect(format(order.delivery_fee)).toBe('5.00');
  });

  it('fee "0" → dine_in order total = items only', () => {
    const { order } = orderSvc.createOrder({
      order_type:   'dine_in',
      delivery_fee: 0,
      items: [{
        product_id:   prodId,
        product_name: 'بيتزا',
        unit_price:   100000,
        qty:          1,
        options:      [],
      }],
    });

    expect(order.delivery_fee).toBe(0);
    expect(order.total).toBe(100000);
  });

  it('fee "50.5" → stored 5050 → format "50.50"', () => {
    const feeMinor = rendererToFeeMinor('50.5');
    expect(feeMinor).toBe(5050);

    const { order } = orderSvc.createOrder({
      order_type:     'delivery',
      delivery_phone: '0551234567',
      delivery_name:  'test',
      delivery_fee:   feeMinor,
      items: [{
        product_id:   prodId,
        product_name: 'بيتزا',
        unit_price:   100000,
        qty:          1,
        options:      [],
      }],
    });

    expect(order.delivery_fee).toBe(5050);
    expect(format(order.delivery_fee)).toBe('50.50');
  });
});

// ── 5. Default delivery fee setting round-trip ────────────────────

describe('default delivery fee setting round-trip', () => {
  it('save 50 DA → stored as 5000 minor units', () => {
    // Replicate: settingsScreen calls toMinor(feeValue) before settingsSet
    const feeValue   = '50';          // string from NumPad
    const toStore    = toMinor(feeValue);
    expect(toStore).toBe(5000);

    settRepo.setSetting('delivery_fee_default', String(toStore));
    const stored = settRepo.getSetting('delivery_fee_default');
    expect(stored).toBe('5000');
  });

  it('loaded 5000 → fromMinor → "50" → toMinor → 5000 (lossless round-trip)', () => {
    settRepo.setSetting('delivery_fee_default', '5000');
    const stored  = settRepo.getSetting('delivery_fee_default');
    // Settings screen: setFeeValue(fromMinor(Number(stored)).toString())
    const feeValue = fromMinor(Number(stored)).toString();
    expect(feeValue).toBe('50');
    // POS: feeMinor = toMinor(feeValue)
    const feeMinor = toMinor(feeValue);
    expect(feeMinor).toBe(5000);
  });

  it('fromMinor(0) round-trip is "0" → 0', () => {
    const feeValue = fromMinor(0).toString();
    expect(feeValue).toBe('0');
    expect(toMinor(feeValue)).toBe(0);
  });
});
