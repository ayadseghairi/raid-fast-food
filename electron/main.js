'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

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

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Graceful shutdown ─────────────────────────────────────────────────
// Checkpoint and close the SQLite DB before the process exits so no WAL
// data is lost and Windows doesn't complain about locked files on uninstall.
app.on('before-quit', () => {
  try {
    const { closeDb } = require('./db/connection.js');
    closeDb();
  } catch {
    // If the DB was never opened (e.g. crash before first IPC), ignore.
  }
});
