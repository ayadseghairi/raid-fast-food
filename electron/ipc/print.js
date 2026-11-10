'use strict';

/**
 * IPC handlers: printing.
 * New channels: print:listPrinters, print:previewHtml, print:run
 * Legacy channels kept: print:getPrinters, print:receipt, print:saveAsPdf
 * @module electron/ipc/print
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const printSvc = require('../services/printing.js');
const orderSvc = require('../services/orders.js');
const { getAllSettings } = require('../repositories/settings.js');

// ── Helper: load order ─────────────────────────────────────────────

function loadOrder(orderId) {
  const data = orderSvc.getOrder(Number(orderId));
  return { order: data, items: data.items };
}

// ── New: list printers with full metadata ─────────────────────────

/**
 * Returns all installed printers with { name, displayName, description,
 * isDefault, isVirtual, status }.
 */
handle('print:listPrinters', async () => {
  return printSvc.listPrinters();
});

// ── New: get preview HTML for a receipt ───────────────────────────

/**
 * payload:
 *   orderId:       number
 *   copy:          'customer' | 'kitchen' | 'combined' | 'cancellation'
 *   widthMm?:      number   (overrides setting)
 *   isModified?:   boolean
 */
handle('print:previewHtml', ({ orderId, copy, widthMm, isModified }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');
  const VALID_COPIES = ['customer', 'kitchen', 'combined', 'cancellation'];
  if (!VALID_COPIES.includes(copy)) throw new AppError('نوع الوصل غير صحيح');

  const { order, items } = loadOrder(orderId);
  const settings    = getAllSettings();
  const paperWidth  = widthMm ?? Number(settings.paper_width ?? 80);

  const html = printSvc.renderReceiptHtml({
    copy,
    order,
    items,
    settings,
    logoDataUrl: null,   // preview will use data: URI if available
    widthMm: paperWidth,
    isModified: !!isModified,
  });

  return { html };
});

// ── New: print with full options ──────────────────────────────────

/**
 * payload:
 *   orderId:       number
 *   copy:          'customer' | 'kitchen' | 'both' | 'cancellation'
 *   deviceName?:   string
 *   widthMm?:      number
 *   silent?:       boolean   (default true; false = OS print dialog)
 *   isModified?:   boolean
 *   isCancellation?: boolean
 */
handle('print:run', async ({ orderId, copy, deviceName, widthMm, silent, isModified, isCancellation }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');
  const VALID = ['customer', 'kitchen', 'both', 'cancellation'];
  const effectiveCopy = isCancellation ? 'cancellation' : (copy ?? 'customer');
  if (!VALID.includes(effectiveCopy)) throw new AppError('خيار الطباعة غير صحيح');

  const { order, items } = loadOrder(orderId);

  await printSvc.print({
    copy: effectiveCopy,
    order,
    items,
    deviceName: deviceName || undefined,
    widthMm:    widthMm    || undefined,
    silent:     silent !== false,   // default true
    isModified: !!isModified,
  });

  return { printed: true };
});

// ── New: save as PDF ──────────────────────────────────────────────

handle('print:savePdf', async ({ orderId, widthMm, isModified, isCancellation }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');
  const { order, items } = loadOrder(orderId);

  return printSvc.savePdfToFile({
    order,
    items,
    widthMm:        widthMm    || undefined,
    isModified:     !!isModified,
    isCancellation: !!isCancellation,
  });
});

// ── Legacy channels (backward compatibility) ──────────────────────

handle('print:getPrinters', async () => {
  return printSvc.getPrinters();
});

handle('print:receipt', async ({ orderId, copies, isModified, isCancellation }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');
  if (!['customer', 'kitchen', 'both', 'none'].includes(copies))
    throw new AppError('خيار الطباعة غير صحيح');

  if (copies === 'none') return { printed: false };

  const { order, items } = loadOrder(orderId);

  if (isCancellation) {
    await printSvc.printCancellation({ order, items });
    return { printed: true };
  }

  if (copies === 'customer' || copies === 'both') {
    await printSvc.printCustomer({ order, items, isModified: !!isModified });
  }
  if (copies === 'kitchen' || copies === 'both') {
    await printSvc.printKitchen({ order, items, isModified: !!isModified });
  }

  return { printed: true };
});

handle('print:saveAsPdf', async ({ orderId, isModified, isCancellation }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');
  const { order, items } = loadOrder(orderId);

  return printSvc.savePdf({
    order,
    items,
    isModified:     !!isModified,
    isCancellation: !!isCancellation,
  });
});
