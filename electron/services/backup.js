'use strict';

/**
 * Backup service.
 *
 * AUTO BACKUP (at close-day):
 *   – Copies raid.db to a user-chosen auto-backup folder.
 *   – File name: raid-backup-YYYY-MM-DDTHH-MM-SS.db
 *   – Keeps only the 30 most-recent copies (oldest deleted first).
 *
 * MANUAL ENCRYPTED BACKUP:
 *   – Reads raid.db, encrypts with AES-256-GCM (key = scrypt(ownerPassword + salt)).
 *   – Writes a .raidbak file: 32-byte salt | 12-byte IV | ciphertext | 16-byte auth tag.
 *   – User chooses the destination via a save dialog (intended for a USB drive).
 *
 * RESTORE:
 *   – Detects whether the file is encrypted (.raidbak) or plain (.db).
 *   – Decrypts if needed, then copies over the live raid.db (with WAL checkpoint first).
 *   – Owner must restart the app after restore; we quit() automatically.
 *
 * SECURITY NOTE: AES-256-GCM with scrypt provides meaningful protection for
 * a casual adversary. It is NOT unbreakable — a determined attacker with the
 * file and unlimited compute time could brute-force a weak owner password.
 *
 * @module electron/services/backup
 */

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');
// app is required lazily inside getDbPath() to avoid crashing in test environments
const { getDb }  = require('../db/connection.js');
const { AppError } = require('../utils/errors.js');
const { getAllSettings } = require('../repositories/settings.js');
const authSvc = require('./auth.js');

// ── Constants ─────────────────────────────────────────────────────

const MAX_AUTO_COPIES = 30;
const SCRYPT_N = 16384;   // CPU cost (reduced from 2^17 for speed on older HW)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN  = 32;      // AES-256
const SALT_LEN = 32;
const IV_LEN   = 12;      // GCM nonce
const MAGIC    = Buffer.from('RAIDBAK1');  // 8-byte header for format detection

// ── Helpers ───────────────────────────────────────────────────────

/** Absolute path of the live SQLite database file. */
function getDbPath() {
  // In test environments, RAID_DB_PATH can be set to a temp file
  if (process.env.RAID_DB_PATH) return process.env.RAID_DB_PATH;
  const { app } = require('electron');
  const userData = app.getPath('userData');
  return path.join(userData, 'raid.db');
}

/** Timestamp string safe for use in a filename: 2025-06-01T14-30-00 */
function fileTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '');
}

/**
 * Checkpoint the WAL so the .db file is a consistent snapshot before copy.
 */
function checkpointWal() {
  try {
    getDb().pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Not critical — the copy is still safe because SQLite WAL copies are consistent.
  }
}

// ── Auto backup ───────────────────────────────────────────────────

/**
 * Perform an automatic backup to the configured folder.
 * Called by the day-close service.
 *
 * @returns {{ done: boolean, filePath?: string, reason?: string }}
 */
function autoBackup() {
  const settings = getAllSettings();
  const folder = settings.backup_folder;

  if (!folder || !folder.trim()) {
    // No folder configured — silently skip (not an error)
    return { done: false, reason: 'no-folder' };
  }

  if (!fs.existsSync(folder)) {
    try { fs.mkdirSync(folder, { recursive: true }); }
    catch { return { done: false, reason: 'folder-create-failed' }; }
  }

  checkpointWal();
  const src  = getDbPath();
  const name = `raid-backup-${fileTimestamp()}.db`;
  const dest = path.join(folder, name);

  fs.copyFileSync(src, dest);

  // Rotate: keep only the newest MAX_AUTO_COPIES
  rotateAutoBackups(folder);

  return { done: true, filePath: dest };
}

/**
 * Delete oldest plain .db backups in folder if there are > MAX_AUTO_COPIES.
 * @param {string} folder
 */
function rotateAutoBackups(folder) {
  let files;
  try {
    files = fs.readdirSync(folder)
      .filter(f => f.startsWith('raid-backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(folder, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime); // oldest first
  } catch {
    return;
  }

  while (files.length > MAX_AUTO_COPIES) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(folder, oldest.name)); }
    catch { /* best-effort */ }
  }
}

// ── Manual encrypted backup ───────────────────────────────────────

/**
 * Derive an AES-256-GCM key from the owner password + random salt via scrypt.
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Buffer} 32-byte key
 */
function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

/**
 * Write an encrypted backup to destPath.
 * Format: MAGIC(8) | salt(32) | iv(12) | ciphertext | authTag(16)
 *
 * @param {string} destPath   absolute path chosen by the user
 * @param {string} ownerPassword  plain-text owner password (used to derive the key)
 * @returns {Promise<{ done: boolean }>}
 */
async function encryptedBackup(destPath, ownerPassword) {
  if (!ownerPassword?.trim()) throw new AppError('كلمة مرور المالك مطلوبة');

  // Verify the password is correct before we write anything
  const settings = getAllSettings();
  const hash = settings.owner_password_hash;
  if (!hash) throw new AppError('لم يتم تعيين كلمة مرور للمالك');

  const valid = await authSvc.verifyPassword(ownerPassword, hash);
  if (!valid) throw new AppError('كلمة المرور غير صحيحة');

  checkpointWal();
  const plaintext = fs.readFileSync(getDbPath());

  const salt   = crypto.randomBytes(SALT_LEN);
  const iv     = crypto.randomBytes(IV_LEN);
  const key    = deriveKey(ownerPassword, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();

  const out = Buffer.concat([MAGIC, salt, iv, ct, tag]);
  fs.writeFileSync(destPath, out);

  return { done: true };
}

// ── Restore ───────────────────────────────────────────────────────

/**
 * Restore from a backup file. Detects encrypted vs plain automatically.
 * - For .raidbak files (MAGIC header): decrypts with owner password.
 * - For .db files: copies directly.
 *
 * After success the app quits so the fresh DB is loaded on next start.
 *
 * @param {string} filePath   path to the backup file
 * @param {string|null} ownerPassword  required only for encrypted files
 * @returns {{ done: boolean }}
 */
function restoreBackup(filePath, ownerPassword) {
  if (!fs.existsSync(filePath)) throw new AppError('ملف النسخة الاحتياطية غير موجود');

  const data = fs.readFileSync(filePath);
  let plainDb;

  const isEncrypted = data.length > MAGIC.length && data.slice(0, MAGIC.length).equals(MAGIC);

  if (isEncrypted) {
    if (!ownerPassword?.trim()) throw new AppError('كلمة مرور المالك مطلوبة لفك التشفير');

    // Parse: MAGIC(8) | salt(32) | iv(12) | ciphertext | authTag(16)
    let offset = MAGIC.length;
    const salt = data.slice(offset, offset + SALT_LEN);   offset += SALT_LEN;
    const iv   = data.slice(offset, offset + IV_LEN);     offset += IV_LEN;
    const tag  = data.slice(data.length - 16);
    const ct   = data.slice(offset, data.length - 16);

    const key     = deriveKey(ownerPassword, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    try {
      plainDb = Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch {
      throw new AppError('فشل فك التشفير. كلمة المرور غير صحيحة أو الملف تالف.');
    }
  } else {
    // Plain SQLite file — validate by checking the SQLite header magic
    const sqliteMagic = Buffer.from('SQLite format 3\x00');
    if (!data.slice(0, 16).equals(sqliteMagic)) {
      throw new AppError('الملف ليس قاعدة بيانات صحيحة');
    }
    plainDb = data;
  }

  // Close the live DB, overwrite, then quit
  const { closeDb } = require('../db/connection.js');
  closeDb();

  const dest = getDbPath();
  // Backup the current DB first just in case
  const tempBackup = dest + '.pre-restore';
  try { fs.copyFileSync(dest, tempBackup); } catch { /* if it doesn't exist, ignore */ }

  try {
    fs.writeFileSync(dest, plainDb);
  } catch (err) {
    // Roll back
    try { fs.copyFileSync(tempBackup, dest); } catch { /* best effort */ }
    throw new AppError('فشل كتابة قاعدة البيانات المستعادة: ' + err.message);
  }

  // Clean up temp backup
  try { fs.unlinkSync(tempBackup); } catch { /* ignore */ }

  // Quit so the user relaunches with the fresh DB
  if (process.env.RAID_DB_PATH) {
    // In test environments don't call app.quit()
    return { done: true };
  }
  require('electron').app.quit();

  return { done: true };
}

// ── List existing auto backups ────────────────────────────────────

/**
 * List existing auto-backup files in the configured folder.
 * @returns {{ name: string, mtime: string }[]} newest first
 */
function listAutoBackups() {
  const settings = getAllSettings();
  const folder = settings.backup_folder;
  if (!folder || !fs.existsSync(folder)) return [];

  return fs.readdirSync(folder)
    .filter(f => f.startsWith('raid-backup-') && f.endsWith('.db'))
    .map(f => ({
      name:  f,
      path:  path.join(folder, f),
      mtime: fs.statSync(path.join(folder, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);   // newest first
}

module.exports = { autoBackup, rotateAutoBackups, encryptedBackup, restoreBackup, listAutoBackups };
