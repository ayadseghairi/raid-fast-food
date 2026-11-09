'use strict';

/**
 * Excel export service.
 * Builds an .xlsx file from a report object and writes it to the given path.
 *
 * Requires: exceljs (offline, bundled as npm dependency).
 * Arabic text is embedded directly; no locale or font CDN is needed.
 *
 * @module electron/services/excelExport
 */

const ExcelJS = require('exceljs');
const { fromMinor } = require('../utils/money.js');

// ── Column helpers ────────────────────────────────────────────────

const CURRENCY_FMT = '#,##0.00';
const HEADER_FILL  = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
};

/** Add a header row to a sheet with RTL columns. */
function addHeaderRow(sheet, cols) {
  const row = sheet.addRow(cols.map(c => c.header));
  row.eachCell(cell => {
    cell.font      = { bold: true };
    cell.alignment = { horizontal: 'center', readingOrder: 'rtl' };
    cell.fill      = HEADER_FILL;
    cell.border    = {
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
    };
  });
  sheet.columns = cols.map(c => ({ width: c.width ?? 20, key: c.key }));
}

// ── Sheet builders ────────────────────────────────────────────────

function addSummarySheet(wb, report) {
  const sheet = wb.addWorksheet('ملخص');
  sheet.rightToLeft = true;

  const { sales, purchases, expenses, net, period } = report;

  sheet.addRow([]);
  const titleRow = sheet.addRow(['تقرير المبيعات والمصروفات']);
  titleRow.font    = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(`A2:C2`);

  const periodRow = sheet.addRow([`الفترة: ${period.from} – ${period.to}`]);
  periodRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(`A3:C3`);

  sheet.addRow([]);

  const data = [
    ['عدد الفواتير',        sales.receiptCount, ''],
    ['إجمالي المبيعات',      fromMinor(sales.totalSales), 'دج'],
    ['مبيعات محلي',          fromMinor(sales.byType.dine_in ?? 0), 'دج'],
    ['مبيعات سفري',          fromMinor(sales.byType.takeaway ?? 0), 'دج'],
    ['مبيعات توصيل',         fromMinor(sales.byType.delivery ?? 0), 'دج'],
    ['إجمالي مشتريات الموردين', fromMinor(purchases.totalPurchases), 'دج'],
    ['إجمالي المصروفات الأخرى', fromMinor(expenses.totalExpenses), 'دج'],
    ['الصافي',               fromMinor(net), 'دج'],
  ];

  for (const [label, value, unit] of data) {
    const row = sheet.addRow([label, value, unit]);
    if (typeof value === 'number') row.getCell(2).numFmt = CURRENCY_FMT;
    row.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    row.getCell(2).alignment = { horizontal: 'right' };
  }

  // Highlight net row
  const lastRow = sheet.lastRow;
  if (lastRow) {
    lastRow.font = { bold: true };
    lastRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    });
  }

  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 8;
}

function addSalesSheet(wb, report) {
  const sheet = wb.addWorksheet('المبيعات حسب النوع');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'نوع الطلب', key: 'type',  width: 20 },
    { header: 'المبلغ (دج)', key: 'total', width: 20 },
  ]);

  const typeLabels = { dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل' };
  for (const [type, label] of Object.entries(typeLabels)) {
    const row = sheet.addRow([label, fromMinor(report.sales.byType[type] ?? 0)]);
    row.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    row.getCell(2).numFmt = CURRENCY_FMT;
    row.getCell(2).alignment = { horizontal: 'right' };
  }
}

function addPurchasesSheet(wb, report) {
  const sheet = wb.addWorksheet('مشتريات الموردين');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'المورد',        key: 'shop',      width: 25 },
    { header: 'الإجمالي (دج)', key: 'total',     width: 20 },
    { header: 'المدفوع (دج)', key: 'paid',      width: 20 },
    { header: 'المتبقي (دج)', key: 'remaining', width: 20 },
  ]);

  for (const row of report.purchases.rows) {
    const r = sheet.addRow([
      row.shop_name,
      fromMinor(row.total),
      fromMinor(row.paid),
      fromMinor(row.remaining),
    ]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    for (let i = 2; i <= 4; i++) {
      r.getCell(i).numFmt   = CURRENCY_FMT;
      r.getCell(i).alignment = { horizontal: 'right' };
    }
  }

  // Total row
  const totRow = sheet.addRow([
    'الإجمالي',
    fromMinor(report.purchases.totalPurchases),
    fromMinor(report.purchases.totalPaid),
    '',
  ]);
  totRow.font = { bold: true };
  totRow.getCell(2).numFmt = CURRENCY_FMT;
  totRow.getCell(3).numFmt = CURRENCY_FMT;
}

function addDebtsSheet(wb, report) {
  const sheet = wb.addWorksheet('الديون المتبقية');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'المورد',          key: 'shop',      width: 25 },
    { header: 'الدين المتبقي (دج)', key: 'remaining', width: 25 },
  ]);

  for (const row of report.remainingDebts) {
    const r = sheet.addRow([row.shop_name, fromMinor(row.remaining)]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(2).numFmt    = CURRENCY_FMT;
    r.getCell(2).alignment = { horizontal: 'right' };
  }

  const totalDebt = report.remainingDebts.reduce((s, r) => s + r.remaining, 0);
  const totRow    = sheet.addRow(['إجمالي الديون', fromMinor(totalDebt)]);
  totRow.font = { bold: true };
  totRow.getCell(2).numFmt = CURRENCY_FMT;
}

function addExpensesSheet(wb, report) {
  const sheet = wb.addWorksheet('المصروفات');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'الفئة',        key: 'category', width: 25 },
    { header: 'الإجمالي (دج)', key: 'total',    width: 20 },
  ]);

  const catLabels = {
    electricity: 'كهرباء',
    rent:        'إيجار',
    salary:      'رواتب',
    maintenance: 'صيانة',
    other:       'أخرى',
  };

  for (const row of report.expenses.rows) {
    const r = sheet.addRow([catLabels[row.category] ?? row.category, fromMinor(row.total)]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(2).numFmt    = CURRENCY_FMT;
    r.getCell(2).alignment = { horizontal: 'right' };
  }

  const totRow = sheet.addRow(['الإجمالي', fromMinor(report.expenses.totalExpenses)]);
  totRow.font = { bold: true };
  totRow.getCell(2).numFmt = CURRENCY_FMT;
}

function addProductsSheet(wb, report) {
  const sheet = wb.addWorksheet('المنتجات');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'المنتج',       key: 'name',    width: 30 },
    { header: 'الكمية المباعة', key: 'qty',    width: 20 },
    { header: 'الإيرادات (دج)', key: 'revenue', width: 20 },
  ]);

  const allRows = report.products.best;
  for (const row of allRows) {
    const r = sheet.addRow([row.product_name, row.total_qty, fromMinor(row.total_revenue)]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(3).numFmt    = CURRENCY_FMT;
    r.getCell(3).alignment = { horizontal: 'right' };
  }
}

// ── Main export function ──────────────────────────────────────────

/**
 * Build an Excel workbook from a report object and write it to filePath.
 * @param {object} report  – result of services/reports.getReport()
 * @param {string} filePath – absolute path to write the .xlsx file
 * @returns {Promise<void>}
 */
async function exportToExcel(report, filePath) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'فاست فود رائد';
  wb.created  = new Date();
  wb.modified = new Date();

  addSummarySheet(wb, report);
  addSalesSheet(wb, report);
  addPurchasesSheet(wb, report);
  addDebtsSheet(wb, report);
  addExpensesSheet(wb, report);
  addProductsSheet(wb, report);

  await wb.xlsx.writeFile(filePath);
}

module.exports = { exportToExcel };
