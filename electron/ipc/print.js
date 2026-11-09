'use strict';

/**
 * IPC handlers: printing.
 * @module electron/ipc/print
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const printSvc = require('../services/printing.js');
const orderSvc = require('../services/orders.js');

// ── Printers ──────────────────────────────────────────────────────

handle('print:getPrinters', async () => {
  return printSvc.getPrinters();
});

// ── Print receipt ─────────────────────────────────────────────────

/**
 * payload:
 *   orderId:  number
 *   copies:   'customer' | 'kitchen' | 'both' | 'none'
 *   isModified?: boolean
 *   isCancellation?: boolean
 */
handle('print:receipt', async ({ orderId, copies, isModified, isCancellation }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');
  if (!['customer', 'kitchen', 'both', 'none'].includes(copies))
    throw new AppError('خيار الطباعة غير صحيح');

  if (copies === 'none') return { printed: false };

  // getOrder returns { ...orderRow, items } (flat spread), so pull items off the object.
  const orderData = orderSvc.getOrder(Number(orderId));
  const items = orderData.items;
  const order = orderData;          // same reference – items property is just redundant but harmless

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

// ── Save receipt as PDF ────────────────────────────────────────────

/**
 * payload:
 *   orderId:  number
 *   isModified?: boolean
 *   isCancellation?: boolean
 */
handle('print:saveAsPdf', async ({ orderId, isModified, isCancellation }) => {
  if (!orderId) throw new AppError('معرّف الطلب مطلوب');

  const orderData = orderSvc.getOrder(Number(orderId));
  const items = orderData.items;
  const order = orderData;

  return printSvc.savePdf({
    order,
    items,
    isModified:     !!isModified,
    isCancellation: !!isCancellation,
  });
});
