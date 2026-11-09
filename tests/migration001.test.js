/**
 * Tests for database migration 001 (schema creation).
 * Uses its own isolated in-memory SQLite (not the shared singleton).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';

describe('migration 001 – initial schema', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration001.up(db);
  });

  it('has version 1', () => {
    expect(migration001.version).toBe(1);
  });

  it('creates settings table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
    expect(row).toBeTruthy();
  });

  it('creates all expected tables', () => {
    const expected = [
      'settings', 'users', 'categories', 'products', 'product_options',
      'customers', 'business_days', 'orders', 'order_items',
      'shops', 'supplies', 'purchases', 'purchase_items', 'expenses', 'audit_log',
    ];
    for (const name of expected) {
      const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
      expect(row, `Table ${name} should exist`).toBeTruthy();
    }
  });

  it('creates expected indexes', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name);
    expect(indexes).toContain('idx_orders_day_id');
    expect(indexes).toContain('idx_orders_created_at');
    expect(indexes).toContain('idx_purchases_shop_date');
  });

  it('enforces foreign keys', () => {
    expect(() => {
      db.prepare("INSERT INTO products (category_id, name, price) VALUES (999, 'test', 100)").run();
    }).toThrow();
  });

  it('stores settings as key/value', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('test_key', 'hello');
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get('test_key');
    expect(row.value).toBe('hello');
  });
});
