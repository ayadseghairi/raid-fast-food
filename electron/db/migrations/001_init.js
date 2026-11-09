'use strict';

/**
 * Migration 001 – initial schema.
 * Amounts: INTEGER minor units (×100). Never edit after first run; add a new migration.
 */

module.exports = {
  version: 1,

  /**
   * @param {import('better-sqlite3').Database} db
   */
  up(db) {
    db.exec(`
      -- ── Settings ──────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- ── Users ─────────────────────────────────────────────────────
      -- role: 'owner' | 'cashier'
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        role          TEXT NOT NULL,
        password_hash TEXT         -- NULL for cashier (no password)
      );

      -- ── Categories ────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      -- ── Products ──────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        price       INTEGER NOT NULL DEFAULT 0,  -- minor units
        image_path  TEXT,
        active      INTEGER NOT NULL DEFAULT 1,  -- 0 = suspended
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      -- ── Product options (sizes / extras) ──────────────────────────
      CREATE TABLE IF NOT EXISTS product_options (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        type       TEXT    NOT NULL CHECK(type IN ('size','extra')),
        label      TEXT    NOT NULL,
        price      INTEGER NOT NULL DEFAULT 0   -- additional price, minor units
      );

      -- ── Customers ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS customers (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        name    TEXT NOT NULL,
        phone   TEXT NOT NULL UNIQUE,
        address TEXT
      );

      -- ── Business days ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS business_days (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date           TEXT    NOT NULL UNIQUE,  -- YYYY-MM-DD
        closed_at      TEXT,                     -- ISO datetime, NULL = open
        receipt_count  INTEGER NOT NULL DEFAULT 0,
        total_sales    INTEGER NOT NULL DEFAULT 0,  -- minor units
        total_expenses INTEGER NOT NULL DEFAULT 0,
        net            INTEGER NOT NULL DEFAULT 0
      );

      -- ── Orders ────────────────────────────────────────────────────
      -- status: 'normal' | 'modified' | 'cancelled'
      -- order_type: 'dine_in' | 'takeaway' | 'delivery'
      CREATE TABLE IF NOT EXISTS orders (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id         INTEGER NOT NULL REFERENCES business_days(id),
        number         INTEGER NOT NULL,           -- restarts each day
        order_type     TEXT    NOT NULL,
        status         TEXT    NOT NULL DEFAULT 'normal',
        customer_id    INTEGER REFERENCES customers(id),
        delivery_name  TEXT,
        delivery_phone TEXT,
        delivery_addr  TEXT,
        delivery_fee   INTEGER NOT NULL DEFAULT 0,  -- minor units
        total          INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT    NOT NULL,
        UNIQUE(day_id, number)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_day_id     ON orders(day_id);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

      -- ── Order items ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS order_items (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES products(id),
        product_name  TEXT    NOT NULL,   -- snapshot
        unit_price    INTEGER NOT NULL,   -- minor units (snapshot)
        qty           INTEGER NOT NULL DEFAULT 1,
        options       TEXT    NOT NULL DEFAULT '[]',  -- JSON array
        note          TEXT,
        line_total    INTEGER NOT NULL
      );

      -- ── Shops (suppliers) ─────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS shops (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        image_path TEXT
      );

      -- ── Supplies (items sold by a shop) ───────────────────────────
      CREATE TABLE IF NOT EXISTS supplies (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id     INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        approx_price INTEGER NOT NULL DEFAULT 0,
        image_path  TEXT
      );

      -- ── Purchases ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS purchases (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id   INTEGER NOT NULL REFERENCES shops(id),
        date      TEXT    NOT NULL,
        total     INTEGER NOT NULL DEFAULT 0,
        paid      INTEGER NOT NULL DEFAULT 0,
        remaining INTEGER GENERATED ALWAYS AS (total - paid) STORED
      );

      CREATE INDEX IF NOT EXISTS idx_purchases_shop_date ON purchases(shop_id, date);

      -- ── Purchase items ────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS purchase_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        supply_id   INTEGER REFERENCES supplies(id),
        name        TEXT    NOT NULL,   -- snapshot (supply may be deleted later)
        qty         REAL    NOT NULL DEFAULT 1,
        unit_price  INTEGER NOT NULL,
        line_total  INTEGER NOT NULL
      );

      -- ── Other expenses ────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS expenses (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id   INTEGER REFERENCES business_days(id),
        name     TEXT    NOT NULL,
        amount   INTEGER NOT NULL,
        date     TEXT    NOT NULL,
        category TEXT    NOT NULL DEFAULT 'other'
      );

      -- ── Audit log ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        action     TEXT NOT NULL,   -- 'modify' | 'cancel'
        order_id   INTEGER NOT NULL REFERENCES orders(id),
        created_at TEXT    NOT NULL,
        detail     TEXT            -- JSON snapshot
      );
    `);
  },
};
