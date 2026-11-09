'use strict';

/**
 * Printing service – manages a hidden BrowserWindow for receipt rendering,
 * calls webContents.print() for thermal printers, and webContents.printToPDF()
 * for saving a PDF to a user-chosen path.
 *
 * Design notes:
 * – A single hidden "print window" is created on demand and reused.
 * – HTML is loaded via loadURL('data:text/html,...') to stay 100% offline.
 * – If no printer is configured or printing fails, an AppError is thrown
 *   so the IPC layer can return a clear Arabic error to the renderer.
 *   The order is always saved before printing is attempted.
 * @module electron/services/printing
 */

const { BrowserWindow, app, dialog } = require('electron');
const path = require('node:path');
const { AppError } = require('../utils/errors.js');
const { customerReceipt, kitchenReceipt, cancellationReceipt } = require('../utils/receiptTemplate.js');
const { getAllSettings } = require('../repositories/settings.js');
const fs = require('node:fs');

/** @type {BrowserWindow|null} */
let printWindow = null;

/**
 * Get (or create) the hidden print window.
 * @returns {BrowserWindow}
 */
/**
 * Create a print window sized to the given paper width.
 * Width in CSS px at 96 dpi: 1mm = 96/25.4 ≈ 3.7795 px.
 * @param {number} widthMm
 * @returns {BrowserWindow}
 */
function makePrintWindow(widthMm) {
  const pxWidth = Math.ceil(widthMm * (96 / 25.4)) + 2; // +2 for scroll-bar safety
  const win = new BrowserWindow({
    show: false,
    width: pxWidth,
    height: 1200,   // tall enough for any receipt; PDF height comes from @page auto
    webPreferences: {
      // The print window only renders static HTML we generate; no preload needed.
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
 * Load HTML into the print window and wait until it's ready.
 * @param {string} html
 * @returns {Promise<void>}
 */
function loadHtml(html) {
  return new Promise((resolve, reject) => {
    const win = getPrintWindow();
    // data: URI keeps us fully offline; encoding handles Arabic text
    const encoded = Buffer.from(html, 'utf8').toString('base64');
    const dataUrl = `data:text/html;base64,${encoded}`;

    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_e, code, desc) =>
      reject(new AppError(`فشل تحميل الفاتورة: ${desc}`)),
    );
    win.loadURL(dataUrl);
  });
}

/**
 * Print the currently-loaded page.
 * @param {string} deviceName  printer name from webContents.getPrintersAsync()
 * @returns {Promise<void>}
 */
function printCurrentPage(deviceName) {
  return new Promise((resolve, reject) => {
    const win = getPrintWindow();
    /** @type {Electron.WebContentsPrintOptions} */
    const options = {
      silent: true,
      printBackground: true,
      color: false,
      margins: { marginType: 'none' },
      // Let the printer driver use its own paper size setting rather than
      // forcing a page size here – thermal printers use custom roll sizes.
      ...(deviceName ? { deviceName } : {}),
    };

    win.webContents.print(options, (success, failureReason) => {
      if (success) {
        resolve();
      } else {
        reject(new AppError(`حدث خطأ أثناء الطباعة: ${failureReason}`));
      }
    });
  });
}

/**
 * Get the logo as a data: URI (reads from userData/images or falls back to the bundled logo).
 * @returns {string|null}
 */
function getLogoDataUrl() {
  // Try userData logo first
  const userLogoPath = path.join(app.getPath('userData'), 'images', 'logo.jpg');
  let logoPath = userLogoPath;

  if (!fs.existsSync(logoPath)) {
    // Fall back to the assets directory (bundled with the app)
    logoPath = path.join(__dirname, '../../assets/logo.jpg');
  }

  if (!fs.existsSync(logoPath)) return null;

  try {
    const data = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Read printer settings.
 * @returns {{ printerName: string, paperWidth: number }}
 */
function getPrinterSettings() {
  const all = getAllSettings();
  return {
    printerName: all.printer_name ?? '',
    paperWidth: Number(all.paper_width ?? 80),
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Get the list of available printers.
 * @returns {Promise<string[]>}
 */
async function getPrinters() {
  const win = getPrintWindow();
  // Load a blank page first if the window is brand new
  if (win.webContents.getURL() === '') {
    await loadHtml('<html><body></body></html>');
  }
  const printers = await win.webContents.getPrintersAsync();
  return printers.map(p => p.name);
}

/**
 * Print a customer receipt.
 * @param {{ order: object, items: object[], isModified?: boolean }} opts
 * @returns {Promise<void>}
 */
async function printCustomer({ order, items, isModified = false }) {
  const settings = getAllSettings();
  const { printerName, paperWidth } = getPrinterSettings();
  const logoDataUrl = getLogoDataUrl();

  const html = customerReceipt({ order, items, settings, logoDataUrl, widthMm: paperWidth, isModified });
  await loadHtml(html);
  await printCurrentPage(printerName);
}

/**
 * Print a kitchen receipt.
 * @param {{ order: object, items: object[], isModified?: boolean }} opts
 * @returns {Promise<void>}
 */
async function printKitchen({ order, items, isModified = false }) {
  const settings = getAllSettings();
  const { printerName, paperWidth } = getPrinterSettings();

  const html = kitchenReceipt({ order, items, settings, widthMm: paperWidth, isModified });
  await loadHtml(html);
  await printCurrentPage(printerName);
}

/**
 * Print a cancellation receipt.
 * @param {{ order: object, items: object[] }} opts
 * @returns {Promise<void>}
 */
async function printCancellation({ order, items }) {
  const settings = getAllSettings();
  const { printerName, paperWidth } = getPrinterSettings();
  const logoDataUrl = getLogoDataUrl();

  const html = cancellationReceipt({ order, items, settings, logoDataUrl, widthMm: paperWidth });
  await loadHtml(html);
  await printCurrentPage(printerName);
}

/**
 * Save the customer receipt as a PDF file chosen by the user via a save dialog.
 * Falls back to the Downloads folder if the user cancels.
 *
 * @param {{ order: object, items: object[], isModified?: boolean, isCancellation?: boolean }} opts
 * @returns {Promise<{ saved: boolean, filePath?: string }>}
 */
async function savePdf({ order, items, isModified = false, isCancellation = false }) {
  const settings = getAllSettings();
  const { paperWidth } = getPrinterSettings();
  const logoDataUrl = getLogoDataUrl();

  let html;
  if (isCancellation) {
    html = cancellationReceipt({ order, items, settings, logoDataUrl, widthMm: paperWidth });
  } else {
    html = customerReceipt({ order, items, settings, logoDataUrl, widthMm: paperWidth, isModified });
  }

  await loadHtml(html);

  // Ask user where to save
  const defaultName = `receipt-${order.number ?? 'unknown'}.pdf`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'حفظ الفاتورة كـ PDF',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { saved: false };

  // We rely on the @page { size: Wmm auto } CSS rule already embedded in the
  // HTML. When printToPDF is called WITHOUT a pageSize override, Chromium
  // honours the CSS @page declaration and trims the PDF to the content height.
  // Passing an explicit pageSize here would override the CSS rule and either
  // clip the content or produce blank pages.
  const pdfBuffer = await getPrintWindow().webContents.printToPDF({
    printBackground: true,
    margins:         { marginType: 'none' },
  });

  fs.writeFileSync(filePath, pdfBuffer);
  return { saved: true, filePath };
}

module.exports = { getPrinters, printCustomer, printKitchen, printCancellation, savePdf };
