'use strict';

/**
 * Database connection singleton.
 * Opens SQLite in WAL mode with foreign keys enabled.
 * The file lives in Electron's userData directory.
 *
 * SINGLETON STRATEGY: we store the db instance on globalThis so that it is
 * shared across ALL module cache instances (Electron CJS, Vite-transformed ESM,
 * vitest workers). This is the only reliable cross-boundary singleton in Node.
 *
 * @module electron/db/connection
 */

const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const GLOBAL_KEY = '__raidFastFoodDb__';

/**
 * Return the shared database instance (creates it on first call).
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (globalThis[GLOBAL_KEY]) return globalThis[GLOBAL_KEY];

  // In test environments, use an in-memory database
  let dbPath;
  if (process.env.NODE_ENV === 'test') {
    dbPath = ':memory:';
  } else {
    const { app } = require('electron');
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });
    dbPath = path.join(userData, 'raid.db');
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -16000'); // 16 MB cache
  globalThis[GLOBAL_KEY] = db;
  return db;
}

/**
 * Close the database (used in tests / graceful shutdown).
 */
function closeDb() {
  if (globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY].close();
    globalThis[GLOBAL_KEY] = null;
  }
}

/**
 * Override the database instance (test use only).
 * @param {import('better-sqlite3').Database} db
 */
function setDb(db) {
  globalThis[GLOBAL_KEY] = db;
}

module.exports = { getDb, closeDb, setDb };
