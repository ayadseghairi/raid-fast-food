'use strict';

/**
 * IPC handlers: backup:now, backup:restore, backup:chooseFolder, backup:list
 * @module electron/ipc/backup
 */

const { handle }  = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const backupSvc   = require('../services/backup.js');
const { dialog, app } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');

// ── backup:chooseFolder ───────────────────────────────────────────
// Opens a native folder picker; returns the chosen path or null.

handle('backup:chooseFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'اختر مجلد النسخ الاحتياطي التلقائي',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || filePaths.length === 0) return { path: null };
  return { path: filePaths[0] };
});

// ── backup:now (manual encrypted backup to user-chosen path) ──────

handle('backup:now', async ({ destPath, ownerPassword }) => {
  // If caller passed a pre-chosen path use it; otherwise open a save dialog.
  let finalPath = destPath;

  if (!finalPath) {
    const defaultName = `raid-encrypted-${new Date().toISOString().slice(0, 10)}.raidbak`;
    const defaultDir  = app.getPath('downloads');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'حفظ النسخة الاحتياطية المشفرة',
      defaultPath: path.join(defaultDir, defaultName),
      filters: [
        { name: 'ملف نسخة احتياطية', extensions: ['raidbak'] },
        { name: 'قاعدة بيانات', extensions: ['db'] },
      ],
    });
    if (canceled || !filePath) return { saved: false };
    finalPath = filePath;
  }

  if (!ownerPassword?.trim()) throw new AppError('كلمة مرور المالك مطلوبة');

  backupSvc.encryptedBackup(finalPath, ownerPassword);
  return { saved: true, filePath: finalPath };
});

// ── backup:restore ────────────────────────────────────────────────

handle('backup:restore', async ({ filePath: providedPath, ownerPassword }) => {
  let filePath = providedPath;

  if (!filePath) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'اختر ملف النسخة الاحتياطية',
      filters: [
        { name: 'ملف نسخة احتياطية', extensions: ['raidbak', 'db'] },
        { name: 'الكل', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { done: false };
    filePath = filePaths[0];
  }

  if (!fs.existsSync(filePath)) throw new AppError('ملف النسخة الاحتياطية غير موجود');

  return backupSvc.restoreBackup(filePath, ownerPassword ?? null);
});

// ── backup:list ───────────────────────────────────────────────────

handle('backup:list', () => {
  return backupSvc.listAutoBackups();
});
