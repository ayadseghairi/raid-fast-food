'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposes a single `window.api.invoke(channel, payload)` function.
 * The renderer MUST NOT use ipcRenderer directly.
 * All channels are whitelisted here.
 */
const ALLOWED_CHANNELS = [
  'auth:login',
  'auth:logout',
  'auth:changePassword',
  'setup:check',
  'setup:complete',
  'settings:get',
  'settings:set',
  'categories:list',
  'categories:create',
  'categories:update',
  'categories:delete',
  'products:list',
  'products:create',
  'products:update',
  'products:delete',
  'products:setActive',
  'products:pickImage',
  'products:computeUnitPrice',
  'options:list',
  'options:create',
  'options:update',
  'options:delete',
  'customers:lookup',
  'customers:create',
  'orders:create',
  'orders:list',
  'orders:get',
  'orders:modify',
  'orders:cancel',
  'orders:auditLog',
  'day:getCurrent',
  'day:close',
  'day:list',
  'day:report',
  'day:checkReminders',
  'day:listClosed',
  'shops:list',
  'shops:create',
  'shops:update',
  'shops:delete',
  'shops:pickImage',
  'supplies:list',
  'supplies:create',
  'supplies:update',
  'supplies:delete',
  'purchases:list',
  'purchases:create',
  'purchases:updatePaid',
  'purchases:debtSummary',
  'expenses:list',
  'expenses:create',
  'expenses:update',
  'expenses:delete',
  'reports:get',
  'reports:exportExcel',
  'reports:exportPdf',
  'print:getPrinters',
  'print:receipt',
  'print:saveAsPdf',
  'print:listPrinters',
  'print:previewHtml',
  'print:run',
  'print:savePdf',
  'print:testPrint',
  'backup:now',
  'backup:restore',
  'backup:chooseFolder',
  'backup:list',
  'data:clearTransactions',
  'data:clearAll',
  'settings:openLogsFolder',
  'workers:list',
  'workers:create',
  'workers:update',
  'workers:setActive',
  'workers:getDailyEntry',
  'workers:saveDailyPayments',
  'workers:summaryForRange',
  'workers:detailForRange',
  'workers:totalPayForRange',
];

contextBridge.exposeInMainWorld('api', {
  /**
   * @param {string} channel
   * @param {object} payload
   * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
   */
  invoke: (channel, payload) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      return Promise.resolve({ ok: false, error: `قناة غير مسموح بها: ${channel}` });
    }
    return ipcRenderer.invoke(channel, payload);
  },
});
