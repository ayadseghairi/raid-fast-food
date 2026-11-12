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
 * Design notes:
 *   - A single hidden BrowserWindow is reused for all print/PDF operations.
 *   - A promise queue (printQueue) serialises all loadHtml calls so that
 *     concurrent print and preview requests never clobber each other.
 *   - The logo is read from disk once and cached as a data: URI.
 *   - savePdfToFile uses fs.promises.writeFile (non-blocking).
 *
 * @module electron/services/printing
 */

const { BrowserWindow, app, dialog, shell } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');
const { AppError } = require('../utils/errors.js');
const tmpl = require('../utils/receiptTemplate.js');
const { getAllSettings } = require('../repositories/settings.js');

// ── Virtual-printer detection ─────────────────────────────────────
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
 * Create a hidden BrowserWindow sized for the given paper width.
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

/**
 * Return (or create) the shared hidden print window.
 * If the requested width differs from the current window's width,
 * the old window is destroyed and a new one is created at the right size.
 * @param {number} widthMm
 * @returns {BrowserWindow}
 */
function getPrintWindow(widthMm = 80) {
  if (printWindow && !printWindow.isDestroyed()) {
    const pxWidth = Math.ceil(widthMm * (96 / 25.4)) + 2;
    const [currentW] = printWindow.getSize();
    if (Math.abs(currentW - pxWidth) > 2) {
      // Width changed (e.g. 80 mm → 58 mm); recreate at the correct size.
      printWindow.destroy();
      printWindow = null;
    } else {
      return printWindow;
    }
  }
  printWindow = makePrintWindow(widthMm);
  return printWindow;
}

// ── Serial print queue ────────────────────────────────────────────
// Ensures loadHtml calls never run concurrently in the same window.

/** @type {Promise<void>} */
let printQueue = Promise.resolve();

/**
 * Enqueue a thunk so all print/PDF operations run serially.
 * @template T
 * @param {() => Promise<T>} thunk
 * @returns {Promise<T>}
 */
function enqueue(thunk) {
  const next = printQueue.then(thunk);
  // Swallow errors on the queue chain itself so one failure doesn't
  // permanently block subsequent jobs.
  printQueue = next.then(
    () => {},
    () => {},
  );
  return next;
}

// ── loadHtml (serialised) ─────────────────────────────────────────

/**
 * Load an HTML string into the print window and wait for it to finish.
 * Cleans up both event listeners regardless of which fires first.
 * @param {string} html
 * @param {number} widthMm   – paper width; window is (re)created if needed
 * @returns {Promise<void>}
 */
function loadHtml(html, widthMm = 80) {
  return new Promise((resolve, reject) => {
    const win = getPrintWindow(widthMm);
    const encoded = Buffer.from(html, 'utf8').toString('base64');
    const dataUrl = `data:text/html;base64,${encoded}`;

    function onLoad() {
      win.webContents.removeListener('did-fail-load', onFail);
      resolve();
    }
    function onFail(_e, _code, desc) {
      win.webContents.removeListener('did-finish-load', onLoad);
      reject(new AppError(`فشل تحميل الفاتورة: ${desc}`));
    }

    win.webContents.once('did-finish-load', onLoad);
    win.webContents.once('did-fail-load',   onFail);
    win.loadURL(dataUrl);
  });
}

// ── Logo helper ────────────────────────────────────────────────────

/**
 * Cached logo data URI.
 * undefined = not yet resolved; null = confirmed not found; string = data URI.
 * @type {string|null|undefined}
 */
let _logoCache;

/**
 * Read the restaurant logo from disk once and cache it as a data: URI.
 *
 * Search order:
 *   1. userData/images/logo.jpg  – custom logo the owner placed
 *   2. resources/assets/logo.jpg – extraResources path in the packaged app
 *   3. <appPath>/assets/logo.jpg – dev / fallback
 *   4. Relative fallback for dev
 *
 * @returns {string|null} data: URI or null if no logo found
 */
function getLogoDataUrl() {
  if (_logoCache !== undefined) return _logoCache;

  const candidates = [
    path.join(app.getPath('userData'), 'images', 'logo.jpg'),
    path.join(process.resourcesPath,   'assets',  'logo.jpg'),
    path.join(app.getAppPath(),         'assets',  'logo.jpg'),
    path.join(__dirname, '../../assets/logo.jpg'),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const ext  = path.extname(p).toLowerCase().replace('.', '');
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const data = fs.readFileSync(p);
      _logoCache = `data:${mime};base64,${data.toString('base64')}`;
      return _logoCache;
    } catch { /* try next */ }
  }

  console.warn('[printing] Logo not found at any candidate path');
  _logoCache = null;
  return null;
}

/** Invalidate the logo cache (call after the owner replaces logo.jpg). */
function resetLogoCache() {
  _logoCache = undefined;
}

// ── Settings helpers ───────────────────────────────────────────────

/** @returns {{ printerName: string, paperWidth: number }} */
function getPrinterSettings() {
  const all = getAllSettings();
  return {
    printerName: all.printer_name ?? '',
    paperWidth:  Number(all.paper_width ?? 80),
  };
}

// ── Paper-size helper (exported for tests) ─────────────────────────

/**
 * Convert a paper width (mm) to a Chromium pageSize object in microns.
 *
 * For thermal rolls we build an explicit pageSize object that tells
 * the print driver the exact roll width; we leave height generous
 * (10 m worth) so the driver feeds as much as the content requires.
 * This is more reliable than relying on @page { size: Wmm auto } with
 * webContents.print, which some thermal drivers ignore.
 *
 * A4 (210 mm) uses the standard ISO page dimensions.
 *
 * @param {number} widthMm
 * @returns {{ width: number, height: number }}
 */
function pageSizeForWidth(widthMm) {
  if (widthMm === 210) {
    return { width: 210_000, height: 297_000 };
  }
  // Thermal: fixed roll width, very long height (content dictates actual feed).
  return { width: widthMm * 1000, height: 10_000_000 };
}

// ── Public: list printers ─────────────────────────────────────────

/**
 * List all installed printers, enriched with isVirtual / isDefault.
 * @returns {Promise<PrinterInfo[]>}
 */
async function listPrinters() {
  // Ensure the window has loaded something so getPrintersAsync works.
  if (!printWindow || printWindow.isDestroyed() || printWindow.webContents.getURL() === '') {
    await enqueue(() => loadHtml('<html><body></body></html>'));
  }
  const raw = await getPrintWindow().webContents.getPrintersAsync();

  const printers = raw.map(p => ({
    name:        p.name,
    displayName: p.displayName || p.name,
    description: p.description || '',
    isDefault:   !!p.isDefault,
    isVirtual:   isVirtualPrinter(p.name),
    status:      p.status ?? 0,
  }));

  printers.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ?  1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });

  return printers;
}

// ── Public: render HTML (pure, no side-effects) ────────────────────

/**
 * Build the receipt HTML string for the given copy type.
 * This is the single source of truth for both the print window
 * and the in-app preview iframe.
 *
 * @param {{
 *   copy:          'customer'|'kitchen'|'combined'|'cancellation',
 *   order:         object,
 *   items:         object[],
 *   settings:      object,
 *   logoDataUrl?:  string|null,
 *   widthMm?:      number,
 *   isModified?:   boolean,
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
 * Print a receipt copy. Serialised through the print queue.
 *
 * @param {{
 *   copy:        'customer'|'kitchen'|'both'|'cancellation',
 *   order:       object,
 *   items:       object[],
 *   deviceName?: string,
 *   widthMm?:    number,
 *   silent?:     boolean,   default true; false = OS print dialog
 *   isModified?: boolean,
 * }} opts
 * @returns {Promise<void>}
 */
function print({ copy, order, items, deviceName, widthMm, silent = true, isModified = false }) {
  return enqueue(async () => {
    const ps      = getPrinterSettings();
    const printer = deviceName ?? ps.printerName;
    const width   = widthMm   ?? ps.paperWidth;
    const logo    = getLogoDataUrl();
    const settings = getAllSettings();

    // For 'both' we print customer then kitchen sequentially inside the same queue slot.
    if (copy === 'both') {
      await _printOne({ copy: 'customer', order, items, printer, width, silent, isModified, logo, settings });
      await _printOne({ copy: 'kitchen',  order, items, printer, width, silent, isModified, logo: null, settings });
      return;
    }

    const effectiveLogo = copy === 'kitchen' ? null : logo;
    await _printOne({ copy, order, items, printer, width, silent, isModified, logo: effectiveLogo, settings });
  });
}

/** @private */
async function _printOne({ copy, order, items, printer, width, silent, isModified, logo, settings }) {
  const html = renderReceiptHtml({ copy, order, items, settings, logoDataUrl: logo, widthMm: width, isModified });

  await loadHtml(html, width);

  const pageSize = pageSizeForWidth(width);

  await new Promise((resolve, reject) => {
    const win = getPrintWindow(width);
    /** @type {Electron.WebContentsPrintOptions} */
    const opts = {
      silent,
      printBackground: true,
      color: false,
      margins: { marginType: 'none' },
      pageSize,
      ...(printer ? { deviceName: printer } : {}),
    };
    win.webContents.print(opts, (success, reason) => {
      if (success) resolve();
      else reject(new AppError(`حدث خطأ أثناء الطباعة: ${reason ?? 'unknown'}`));
    });
  });
}

// ── Public: save PDF ───────────────────────────────────────────────

/**
 * Render a combined receipt and save as PDF. Serialised through the print queue.
 * Uses non-blocking fs.promises.writeFile.
 *
 * @param {{
 *   order:           object,
 *   items:           object[],
 *   widthMm?:        number,
 *   isModified?:     boolean,
 *   isCancellation?: boolean,
 * }} opts
 * @returns {Promise<{ saved: boolean, filePath?: string }>}
 */
function savePdfToFile({ order, items, widthMm, isModified = false, isCancellation = false }) {
  return enqueue(async () => {
    const ps       = getPrinterSettings();
    const width    = widthMm ?? ps.paperWidth;
    const logo     = getLogoDataUrl();
    const settings = getAllSettings();

    const copy = isCancellation ? 'cancellation' : 'combined';
    const html = renderReceiptHtml({ copy, order, items, settings, logoDataUrl: logo, widthMm: width, isModified });

    await loadHtml(html, width);

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
    const pdfBuffer = await getPrintWindow(width).webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize,
    });

    await fsp.writeFile(filePath, pdfBuffer);

    try { shell.showItemInFolder(filePath); } catch { /* non-fatal */ }

    return { saved: true, filePath };
  });
}

// ── Test print helpers ────────────────────────────────────────────

/**
 * Build a sample receipt HTML for the test-print feature.
 * Uses the same CSS as real receipts but with dummy content.
 *
 * @param {{ settings: object, logoDataUrl: string|null, widthMm: number }} opts
 * @returns {string}
 */
function buildTestReceiptHtml({ settings, logoDataUrl, widthMm = 80 }) {
  const name    = settings.restaurant_name  ?? 'فاست فود رائد';
  const phone   = settings.restaurant_phone ?? '';
  const thanks  = settings.thank_you_message ?? 'شكراً لزيارتكم';
  const now     = new Date();
  const dd      = String(now.getDate()).padStart(2, '0');
  const mm      = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy    = now.getFullYear();
  const hh      = String(now.getHours()).padStart(2, '0');
  const min     = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-width:${widthMm * 0.5}mm;height:auto;display:block;margin:0 auto 4mm auto;" />`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${widthMm}mm;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 11px;
    color: #000;
    direction: rtl;
    padding: 4mm;
  }
  .center { text-align: center; }
  .bold   { font-weight: bold; }
  .line   { border-top: 1px dashed #000; margin: 3mm 0; }
  .row    { display: flex; justify-content: space-between; margin: 1mm 0; }
</style>
</head>
<body>
  ${logoHtml}
  <div class="center bold" style="font-size:14px">${name}</div>
  ${phone ? `<div class="center" style="font-size:10px;direction:ltr">${phone}</div>` : ''}
  <div class="center" style="font-size:10px;margin-top:2mm">طباعة تجريبية — ${dateStr}</div>
  <div class="line"></div>
  <div class="row"><span>فاتورة رقم:</span><span><b>999</b></span></div>
  <div class="row"><span>النوع:</span><span>محلي</span></div>
  <div class="line"></div>
  <div class="row"><span>بيتزا مشكلة</span><span>250.00</span></div>
  <div class="row"><span>عصير — 1 L</span><span>150.00</span></div>
  <div class="row"><span>برغر دجاج x2</span><span>400.00</span></div>
  <div class="line"></div>
  <div class="row bold"><span>الإجمالي</span><span>800.00 دج</span></div>
  <div class="line"></div>
  <div class="center" style="font-size:12px;margin-top:2mm">${thanks}</div>
</body>
</html>`;
}

/**
 * Print an arbitrary HTML string directly to a printer (no order needed).
 * Used for test-print.
 * @param {{ html: string, deviceName: string, widthMm: number }} opts
 */
function printHtmlDirect({ html, deviceName, widthMm = 80 }) {
  return enqueue(async () => {
    await loadHtml(html, widthMm);
    const pageSize = pageSizeForWidth(widthMm);
    await new Promise((resolve, reject) => {
      const win = getPrintWindow(widthMm);
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          color: false,
          margins: { marginType: 'none' },
          pageSize,
          deviceName,
        },
        (success, reason) => {
          if (success) resolve();
          else reject(new AppError(`فشلت الطباعة التجريبية: ${reason ?? 'unknown'}`));
        }
      );
    });
  });
}

/**
 * Save a test receipt HTML as PDF (prompts save dialog).
 * @param {{ html: string, width: number }} opts
 * @returns {Promise<{ saved: boolean, filePath?: string }>}
 */
function saveTestPdf({ html, width = 80 }) {
  return enqueue(async () => {
    await loadHtml(html, width);
    const pageSize = pageSizeForWidth(width);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'حفظ الطباعة التجريبية كـ PDF',
      defaultPath: path.join(app.getPath('downloads'), 'test-receipt.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { saved: false };
    const pdfBuf = await getPrintWindow(width).webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize,
    });
    await fsp.writeFile(filePath, pdfBuf);
    return { saved: true, filePath };
  });
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
  getLogoDataUrl,
  resetLogoCache,
  print,
  savePdfToFile,
  // Test print
  buildTestReceiptHtml,
  printHtmlDirect,
  saveTestPdf,
  // Legacy (keep existing IPC channels working)
  getPrinters,
  printCustomer,
  printKitchen,
  printCancellation,
  savePdf,
};
