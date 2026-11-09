/**
 * Tests for backup service:
 *   – autoBackup: creates file, rotates to MAX_AUTO_COPIES, skips when no folder
 *   – encryptedBackup / restoreBackup: round-trip encrypt+decrypt
 *   – restoreBackup: rejects wrong password, rejects non-SQLite plain file
 *   – rotateAutoBackups: deletes oldest when count exceeds limit
 *   – listAutoBackups: returns sorted list
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'node:fs';
import path from 'node:path';
import os   from 'node:os';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import { setDb } from '../electron/db/connection.js';

// ── Temp workspace ────────────────────────────────────────────────────
const tmpRoot     = fs.mkdtempSync(path.join(os.tmpdir(), 'raidbak-test-'));
const liveDbPath  = path.join(tmpRoot, 'raid.db');

// Tell the backup service where the live DB is (avoids requiring Electron app)
process.env.RAID_DB_PATH = liveDbPath;

// Write a minimal valid SQLite header so the service can copy it
function writeFakeSqliteDb(filePath) {
  const magic = Buffer.from('SQLite format 3\x00');
  const rest  = Buffer.alloc(100 - 16);
  fs.writeFileSync(filePath, Buffer.concat([magic, rest]));
}
writeFakeSqliteDb(liveDbPath);

// ── In-memory DB ──────────────────────────────────────────────────────
const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
setDb(_db);

const PASSWORD = 'test-password-123';
// Use plain-text hash shortcut — auth.verifyPassword accepts non-scrypt values
_db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('owner_password_hash', ?)").run(PASSWORD);
_db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run('');

// ── Dynamic import AFTER env is set ───────────────────────────────────
const backupSvc = await import('../electron/services/backup.js');

// ── Helpers ───────────────────────────────────────────────────────────

/** Create N fake auto-backup files with deterministic mtimes */
function createFakeBackups(folder, count) {
  for (let i = 0; i < count; i++) {
    const day = String(i + 1).padStart(2, '0');
    const ts  = `2025-01-${day}T00-00-00`;
    const p   = path.join(folder, `raid-backup-${ts}.db`);
    writeFakeSqliteDb(p);
    // Set mtime so order is deterministic (day 1 = oldest)
    const mtime = new Date(2025, 0, i + 1);
    fs.utimesSync(p, mtime, mtime);
  }
}

// ── autoBackup ────────────────────────────────────────────────────────

describe('autoBackup', () => {
  const folder = path.join(tmpRoot, 'auto-backup');

  beforeEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder, { recursive: true });
    _db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run(folder);
  });

  afterEach(() => {
    _db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run('');
  });

  it('returns done:false when no folder is configured', () => {
    _db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run('');
    const result = backupSvc.autoBackup();
    expect(result.done).toBe(false);
    expect(result.reason).toBe('no-folder');
  });

  it('creates a backup file in the folder', () => {
    const result = backupSvc.autoBackup();
    expect(result.done).toBe(true);
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(path.basename(result.filePath)).toMatch(/^raid-backup-.*\.db$/);
  });

  it('backup file is in the correct folder', () => {
    const result = backupSvc.autoBackup();
    expect(path.dirname(result.filePath)).toBe(folder);
  });
});

// ── rotateAutoBackups ─────────────────────────────────────────────────

describe('rotateAutoBackups', () => {
  const folder = path.join(tmpRoot, 'rotate-test');

  beforeEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder, { recursive: true });
  });

  it('does nothing when count <= 30', () => {
    createFakeBackups(folder, 10);
    backupSvc.rotateAutoBackups(folder);
    const files = fs.readdirSync(folder).filter(f => f.startsWith('raid-backup-'));
    expect(files.length).toBe(10);
  });

  it('deletes oldest files to keep exactly 30', () => {
    createFakeBackups(folder, 35);
    backupSvc.rotateAutoBackups(folder);
    const remaining = fs.readdirSync(folder)
      .filter(f => f.startsWith('raid-backup-'))
      .sort();
    expect(remaining.length).toBe(30);
    // Days 1–5 (oldest) should be gone; day 06 should be the first remaining
    expect(remaining[0]).toContain('01-06');
  });

  it('keeps exactly 30 when given exactly 30', () => {
    createFakeBackups(folder, 30);
    backupSvc.rotateAutoBackups(folder);
    const files = fs.readdirSync(folder).filter(f => f.startsWith('raid-backup-'));
    expect(files.length).toBe(30);
  });
});

// ── encryptedBackup / restoreBackup round-trip ────────────────────────

describe('encryptedBackup + restoreBackup', () => {
  const bakPath = path.join(tmpRoot, 'test-encrypted.raidbak');

  afterEach(() => {
    try { fs.unlinkSync(bakPath); } catch { /* ignore */ }
  });

  it('creates an encrypted file with RAIDBAK1 magic header', async () => {
    await backupSvc.encryptedBackup(bakPath, PASSWORD);
    expect(fs.existsSync(bakPath)).toBe(true);
    const data = fs.readFileSync(bakPath);
    expect(data.slice(0, 8).toString('utf8')).toBe('RAIDBAK1');
  });

  it('encrypted file decrypts to original DB content', async () => {
    await backupSvc.encryptedBackup(bakPath, PASSWORD);
    const data = fs.readFileSync(bakPath);

    // Parse the format: MAGIC(8) | salt(32) | iv(12) | ciphertext | authTag(16)
    const crypto = await import('node:crypto');
    const MAGIC_LEN = 8, SALT_LEN = 32, IV_LEN = 12;
    let offset = MAGIC_LEN;
    const salt = data.slice(offset, offset + SALT_LEN); offset += SALT_LEN;
    const iv   = data.slice(offset, offset + IV_LEN);   offset += IV_LEN;
    const tag  = data.slice(data.length - 16);
    const ct   = data.slice(offset, data.length - 16);

    const key = crypto.scryptSync(PASSWORD, salt, 32, { N: 16384, r: 8, p: 1 });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);

    // Should start with the SQLite magic header
    expect(plain.slice(0, 15).toString('utf8')).toBe('SQLite format 3');
  });

  it('throws when password is wrong', async () => {
    await expect(
      backupSvc.encryptedBackup(bakPath, 'wrong-password')
    ).rejects.toThrow('كلمة المرور غير صحيحة');
  });

  it('throws when password is empty', async () => {
    await expect(
      backupSvc.encryptedBackup(bakPath, '')
    ).rejects.toThrow('مطلوبة');
  });
});

// ── restoreBackup edge cases ──────────────────────────────────────────

describe('restoreBackup', () => {
  it('throws when file does not exist', () => {
    expect(() =>
      backupSvc.restoreBackup('/nonexistent/path/raid.db', null)
    ).toThrow('غير موجود');
  });

  it('throws when plain .db file has invalid header', () => {
    const badFile = path.join(tmpRoot, 'bad.db');
    fs.writeFileSync(badFile, Buffer.from('not a sqlite file 123'));
    expect(() =>
      backupSvc.restoreBackup(badFile, null)
    ).toThrow('ليس قاعدة بيانات صحيحة');
    fs.unlinkSync(badFile);
  });

  it('throws when encrypted file has wrong decryption password', async () => {
    const bakPath2 = path.join(tmpRoot, 'round-trip.raidbak');
    await backupSvc.encryptedBackup(bakPath2, PASSWORD);
    expect(() =>
      backupSvc.restoreBackup(bakPath2, 'wrong-password-xyz')
    ).toThrow('فشل فك التشفير');
    fs.unlinkSync(bakPath2);
  });

  it('throws when no password provided for encrypted file', async () => {
    const bakPath3 = path.join(tmpRoot, 'needs-pw.raidbak');
    await backupSvc.encryptedBackup(bakPath3, PASSWORD);
    expect(() =>
      backupSvc.restoreBackup(bakPath3, null)
    ).toThrow('مطلوبة لفك التشفير');
    fs.unlinkSync(bakPath3);
  });
});

// ── listAutoBackups ───────────────────────────────────────────────────

describe('listAutoBackups', () => {
  const folder = path.join(tmpRoot, 'list-test');

  beforeEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder, { recursive: true });
    _db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run(folder);
  });

  afterEach(() => {
    _db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run('');
  });

  it('returns empty array when no backups exist', () => {
    expect(backupSvc.listAutoBackups()).toEqual([]);
  });

  it('returns files sorted newest first', () => {
    createFakeBackups(folder, 3);
    const list = backupSvc.listAutoBackups();
    expect(list.length).toBe(3);
    expect(list[0].mtime).toBeGreaterThanOrEqual(list[1].mtime);
    expect(list[1].mtime).toBeGreaterThanOrEqual(list[2].mtime);
  });

  it('returns empty array when folder not configured', () => {
    _db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_folder', ?)").run('');
    expect(backupSvc.listAutoBackups()).toEqual([]);
  });
});
