'use strict';

/**
 * IPC handlers: reports, Excel export, PDF export.
 * @module electron/ipc/reports
 */

const { handle }     = require('./_handle.js');
const { AppError }   = require('../utils/errors.js');
const reportsSvc     = require('../services/reports.js');
const excelExport    = require('../services/excelExport.js');
const pdfExport      = require('../services/pdfExport.js');
const { dialog, app } = require('electron');
const path = require('node:path');

const VALID_PERIODS = ['day', 'week', 'month', 'custom'];

function validateParams({ period, dateFrom, dateTo } = {}) {
  const p = period ?? 'day';
  if (!VALID_PERIODS.includes(p)) throw new AppError('فترة غير صحيحة');

  if (p === 'custom') {
    if (!dateFrom || !dateTo) throw new AppError('يجب تحديد تاريخ البداية والنهاية');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) throw new AppError('تنسيق تاريخ البداية غير صحيح');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo))   throw new AppError('تنسيق تاريخ النهاية غير صحيح');
  }

  return { period: p, dateFrom, dateTo };
}

handle('reports:get', (payload) => {
  const params = validateParams(payload);
  return reportsSvc.getReport(params);
});

handle('reports:exportExcel', async (payload) => {
  const params = validateParams(payload);
  const report = reportsSvc.getReport(params);

  const defaultName = `report-${report.period.from}--${report.period.to}.xlsx`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'حفظ التقرير كـ Excel',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (canceled || !filePath) return { saved: false };

  await excelExport.exportToExcel(report, filePath);
  return { saved: true, filePath };
});

handle('reports:exportPdf', async (payload) => {
  const params = validateParams(payload);
  const report = reportsSvc.getReport(params);
  return pdfExport.exportToPdf(report);
});
