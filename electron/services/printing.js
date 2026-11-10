'use strict';

/**
 * Printing service – manages a hidden BrowserWindow for receipt rendering.
 *
 * Public API:
 *   listPrinters()          → Promise<PrinterInfo[]>
 *   renderReceiptHtml(opts) → string   (pure, testable)
 *   print(opts)             → Promise<void>
 *   savePdfToFile(opts)     → Promise<{saved, filePath?}>
 *
 * All HTML generation is delegated to electron/utils/receiptTemplate.js
 * so the preview iframe in the renderer uses the same source of truth.
 *
 * @module electron/services/printing
 */

const { BrowserWindow, app, dialog, shell } = require('electron');
const path  = require('node:path');
const fs    = require('node:fs');
const { AppError } = require('../utils/errors.js');
const tmpl  = require('../utils/receiptTemplate.js');
const { getAllSettings } = require('../repositories/settings.js');

// ── Virtual-printer detection ─────────────────────────────────────
// These substrings (case-insensitive) identify Windows virtual printers.
const VIRTUAL_PATTERNS = [
  'microsoft print to pdf',
  'microsoft xps',
  'send to onenote',
  'fax',
  'onenote',
  'adobe pdf',
  'cutepdf',
  'dopdf',
  'pdf creator',
  'pdf24',
  'bullzip',
  'nitro pdf',
  'foxit',
  'win2pdf',
  'pdfill',
  'universal document converter',
];

/**
 * @typedef {{
 *   name: string,
 *   displayName: string,
 *   description: string,
 *   isDefault: boolean,
 *   isVirtual: boolean,
 *   status: number,
 * }} PrinterInfo
 */

/** @param {string} name @returns {boolean} */
function isVirtualPrinter(name) {
  const lower = name.toLowerCase();
  return VIRTUAL_PATTERNS.some(p => lower.includes(p));
}

// ── Hidden print window ───────────────────────────────────────────

/** @type {BrowserWindow|null} */
let printWindow = null;

/**
 * @param {number} widthMm
 * @returns {BrowserWindow}
 */
function makePrintWindow(widthMm) {
  const pxWidth = Math.ceil(widthMm * (96 / 25.4)) + 2;
  const win = new BrowserWindow({
    show: false,
    width: pxWidth,
    height: 1400,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on('closed', () => { printWindow = null; });
  return win;
}

function getPrintWindow(widthMm = 80) {
  if (printWindow && !printWindow.isDestroyed()) return printWindow;
  printWindow = makePrintWindow(widthMm);
  return printWindow;
}

/**
 * Load HTML and wait for did-finish-load.
 * @param {string} html
 * @returns {Promise<void>}
 */
function loadHtml(html) {
  return new Promise((resolve, reject) => {
    const win = getPrintWindow();
    const encoded = Buffer.from(html, 'utf8').toString('base64');
    const dataUrl = `data:text/html;base64,${encoded}`;
    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_e, _code, desc) =>
      reject(new AppError(`فشل تحميل الفاتورة: ${desc}`)),
    );
    win.loadURL(dataUrl);
  });
}

// ── Logo helper ────────────────────────────────────────────────────

/** @returns {string|null} */
function getLogoDataUrl() {
  const userLogoPath = path.join(app.getPath('userData'), 'images', 'logo.jpg');
  let logoPath = fs.existsSync(userLogoPath)
    ? userLogoPath
    : path.join(__dirname, '../../assets/logo.jpg');
  if (!fs.existsSync(logoPath)) return null;
  try {
    const data = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch { return null; }
}

// ── Settings helpers ───────────────────────────────────────────────

/** @returns {{ printerName: string, paperWidth: number, showVirtual: boolean }} */
function getPrinterSettings() {
  const all = getAllSettings();
  return {
    printerName:  all.printer_name  ?? '',
    paperWidth:   Number(all.paper_width ?? 80),
    showVirtual:  (all.show_virtual_printers ?? '1') !== '0',
  };
}

// ── Paper-size helper (exported for tests) ─────────────────────────

/**
 * Convert a paper width (mm) to a Chromium pageSize object.
 * Thermal rolls use a fixed width with effectively infinite height;
 * A4 uses standard ISO dimensions.
 *
 * @param {number} widthMm
 * @returns {{ width: number, height: number }|undefined}
 *   undefined → let Chromium use the @page CSS rule (best for thermal)
 */
function pageSizeForWidth(widthMm) {
  if (widthMm === 210) {
    // A4: 210 × 297 mm in microns (Chromium expects microns)
    return { width: 210000, height: 297000 };
  }
  // For thermal rolls we rely on `@page { size: Wmm auto }` in the CSS;
  // returning undefined tells printToPDF to honour the CSS @page rule.
  return undefined;
}

// ── Public: list printers ─────────────────────────────────────────

/**
 * List all installed printers, enriched with isVirtual / isDefault.
 * @returns {Promise<PrinterInfo[]>}
 */
async function listPrinters() {
  const win = getPrintWindow();
  if (win.webContents.getURL() === '') {
    await loadHtml('<html><body></body></html>');
  }
  const raw = await win.webContents.getPrintersAsync();

  /** @type {PrinterInfo[]} */
  const printers = raw.map(p => ({
    name:        p.name,
    displayName: p.displayName || p.name,
    description: p.description || '',
    isDefault:   !!p.isDefault,
    isVirtual:   isVirtualPrinter(p.name),
    status:      p.status ?? 0,
  }));

  // Sort: default first, then real, then virtual
  printers.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });

  return printers;
}

// ── Public: render HTML (pure, no side-effects) ────────────────────

/**
 * Build the receipt HTML string for the given copy type.
 * This is the SINGLE source of truth used by both the print window
 * and the in-app preview iframe.
 *
 * @param {{
 *   copy:           'customer' | 'kitchen' | 'combined' | 'cancellation',
 *   order:          object,
 *   items:          object[],
 *   settings:       object,
 *   logoDataUrl?:   string|null,
 *   widthMm?:       number,
 *   isModified?:    boolean,
 * }} opts
 * @returns {string}
 */
function renderReceiptHtml({ copy, order, items, settings, logoDataUrl = null, widthMm = 80, isModified = false }) {
  switch (copy) {
    case 'customer':
      return tmpl.customerReceipt({ order, items, settings, logoDataUrl, widthMm, isModified });
    case 'kitchen':
      return tmpl.kitchenReceipt({ order, items, settings, widthMm, isModified });
    case 'combined':
      return tmpl.combinedPdfReceipt({ order, items, settings, logoDataUrl, widthMm, isModified });
    case 'cancellation':
      return tmpl.cancellationReceipt({ order, items, settings, logoDataUrl, widthMm });
    default:
      throw new AppError(`نوع الوصل غير معروف: ${copy}`);
  }
}

// ── Public: print ─────────────────────────────────────────────────

/**
 * Print a receipt copy.
 *
 * @param {{
 *   copy:           'customer' | 'kitchen' | 'both' | 'cancellation',
 *   order:          object,
 *   items:          object[],
 *   deviceName?:    string,       override printer (uses settings if omitted)
 *   widthMm?:       number,       override paper width
 *   silent?:        boolean,      default true; false = show OS dialog
 *   isModified?:    boolean,
 * }} opts
 * @returns {Promise<void>}
 */
async function print({ copy, order, items, deviceName, widthMm, silent = true, isModified = false }) {
  const settings = getAllSettings();
  const ps       = getPrinterSettings();
  const printer  = deviceName  ?? ps.printerName;
  const width    = widthMm     ?? ps.paperWidth;
  const logo     = getLogoDataUrl();

  // For 'both' we print customer then kitchen sequentially
  if (copy === 'both') {
    await print({ copy: 'customer', order, items, deviceName: printer, widthMm: width, silent, isModified });
    await print({ copy: 'kitchen',  order, items, deviceName: printer, widthMm: width, silent, isModified });
    return;
  }

  const html = renderReceiptHtml({
    copy: copy === 'cancellation' ? 'cancellation' : copy,
    order, items, settings,
    logoDataUrl: copy === 'kitchen' ? null : logo,
    widthMm: width,
    isModified,
  });

  await loadHtml(html);

  const pageSize = pageSizeForWidth(width);

  await new Promise((resolve, reject) => {
    const win = getPrintWindow();
    /** @type {Electron.WebContentsPrintOptions} */
    const opts = {
      silent,
      printBackground: true,
      color: false,
      margins: { marginType: 'none' },
      ...(printer ? { deviceName: printer } : {}),
      ...(pageSize ? { pageSize } : {}),
    };

    win.webContents.print(opts, (success, reason) => {
      if (success) resolve();
      else reject(new AppError(`حدث خطأ أثناء الطباعة: ${reason ?? 'unknown'}`));
    });
  });
}

// ── Public: save PDF ───────────────────────────────────────────────

/**
 * Render a combined receipt (customer + kitchen) and save as PDF.
 * Shows a save dialog; on success opens the containing folder.
 *
 * @param {{
 *   order:          object,
 *   items:          object[],
 *   widthMm?:       number,
 *   isModified?:    boolean,
 *   isCancellation?: boolean,
 * }} opts
 * @returns {Promise<{ saved: boolean, filePath?: string }>}
 */
async function savePdfToFile({ order, items, widthMm, isModified = false, isCancellation = false }) {
  const settings = getAllSettings();
  const ps       = getPrinterSettings();
  const width    = widthMm ?? ps.paperWidth;
  const logo     = getLogoDataUrl();

  const copy = isCancellation ? 'cancellation' : 'combined';
  const html = renderReceiptHtml({ copy, order, items, settings, logoDataUrl: logo, widthMm: width, isModified });

  await loadHtml(html);

  // Build default file name: receipt-<number>-DD-MM-YYYY.pdf
  const d    = new Date();
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const defaultName = `receipt-${order.number ?? 'unknown'}-${dd}-${mm}-${yyyy}.pdf`;

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'حفظ الفاتورة كـ PDF',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { saved: false };

  const pageSize = pageSizeForWidth(width);
  const pdfBuffer = await getPrintWindow().webContents.printToPDF({
    printBackground: true,
    margins: { marginType: 'none' },
    ...(pageSize ? { pageSize } : {}),
  });

  fs.writeFileSync(filePath, pdfBuffer);

  // Open the containing folder so the user can find the file
  try { shell.showItemInFolder(filePath); } catch { /* non-fatal */ }

  return { saved: true, filePath };
}

// ── Legacy compatibility wrappers (used by existing IPC channels) ──

async function getPrinters() { return listPrinters(); }

async function printCustomer({ order, items, isModified = false }) {
  return print({ copy: 'customer', order, items, isModified });
}
async function printKitchen({ order, items, isModified = false }) {
  return print({ copy: 'kitchen', order, items, isModified });
}
async function printCancellation({ order, items }) {
  return print({ copy: 'cancellation', order, items });
}
async function savePdf(opts) {
  return savePdfToFile(opts);
}

module.exports = {
  // New API
  listPrinters,
  renderReceiptHtml,
  pageSizeForWidth,
  print,
  savePdfToFile,
  // Legacy (keep existing IPC channels working)
  getPrinters,
  printCustomer,
  printKitchen,
  printCancellation,
  savePdf,
};
