'use strict';

/**
 * Run database migrations in order.
 * Never edit an applied migration – always add a new one.
 * @module electron/db/migrate
 */

const { getDb } = require('./connection.js');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Load all migration modules from the migrations/ folder, sorted by filename.
 * Each module must export: { version: number, up(db): void }
 */
function loadMigrations() {
  const dir = path.join(__dirname, 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => require(path.join(dir, f)));
}

/**
 * Run all pending migrations.
 */
function migrate() {
  const db = getDb();
  const migrations = loadMigrations();

  for (const m of migrations) {
    const current = db.pragma('user_version', { simple: true });
    if (current < m.version) {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    }
  }
}

module.exports = { migrate };
