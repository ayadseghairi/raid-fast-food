'use strict';

/**
 * Migration 003 – workers and worker_payments tables.
 *
 * workers:          id, name, active (1=active), created_at
 * worker_payments:  id, worker_id, date (YYYY-MM-DD), amount (minor units),
 *                   UNIQUE(worker_id, date)
 */

module.exports = {
  version: 3,

  /**
   * @param {import('better-sqlite3').Database} db
   */
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workers (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS worker_payments (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL REFERENCES workers(id),
        date      TEXT    NOT NULL,   -- YYYY-MM-DD
        amount    INTEGER NOT NULL DEFAULT 0,   -- minor units
        UNIQUE(worker_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_worker_payments_date ON worker_payments(date);
    `);
  },
};
