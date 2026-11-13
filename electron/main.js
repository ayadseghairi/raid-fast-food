'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const logger = require('./utils/logger.js');

// Disable Chromium telemetry / crash-reporter features
app.commandLine.appendSwitch('disable-features', 'Reporting');
// Suppress VA-API / GPU codec warnings on Linux systems without hardware video acceleration
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
}

const isDev = process.env.NODE_ENV === 'development';

// ── Single-instance lock ──────────────────────────────────────────────
// Prevent multiple copies of the app running at the same time.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Resolve the app icon path (works in dev and in the packaged app)
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets', 'icon.ico')
  : path.join(__dirname, '../assets/icon.ico');

/** @type {BrowserWindow|null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: 'فاست فود رائد',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Remove the default menu bar (not needed for a POS kiosk-style app)
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Second-instance handler ───────────────────────────────────────────
// If the user tries to open a second window, focus the existing one.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialise logger now that userData path is available
  logger.init(app.getPath('userData'));
  logger.info('App starting', { version: app.getVersion(), platform: process.platform });

  // Global error handlers
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', reason instanceof Error ? reason : String(reason));
  });

  // Register IPC handlers (each file self-registers on require)
  require('./ipc/setup.js');
  require('./ipc/auth.js');
  require('./ipc/settings.js');
  require('./ipc/products.js');
  require('./ipc/orders.js');
  require('./ipc/dayClose.js');
  require('./ipc/suppliers.js');
  require('./ipc/print.js');
  require('./ipc/reports.js');
  require('./ipc/backup.js');
  require('./ipc/data.js');
  require('./ipc/workers.js');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Graceful shutdown ─────────────────────────────────────────────────
// 1. WAL checkpoint: flush all pending WAL pages to the main DB file so
//    the -wal and -shm sidecar files are removed by SQLite on close.
//    Without this, another process may see a locked or inconsistent DB.
// 2. closeDb(): close the connection so the file descriptor is released
//    before the process exits. This is critical on Windows where an open
//    file handle prevents the next launch from acquiring the DB file.
// 3. releaseSingleInstanceLock(): explicitly release the lock so the OS
//    makes it available immediately to the next launch (avoids the
//    "already running" false-positive on fast restart).
app.on('before-quit', () => {
  try {
    const { getDb, closeDb } = require('./db/connection.js');
    // Force a full WAL checkpoint so -wal/-shm files are removed
    try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    closeDb();
  } catch {
    // DB was never opened (crash before first IPC) — nothing to do.
  }
  // Release the single-instance lock so the next launch isn't blocked
  app.releaseSingleInstanceLock();
});
