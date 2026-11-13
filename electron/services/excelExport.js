'use strict';

/**
 * Excel export service.
 * Builds an .xlsx file from a report object and writes it to the given path.
 * One sheet per section (as required by item 3).
 *
 * Requires: exceljs (offline, bundled as npm dependency).
 * Arabic text is embedded directly; no locale or font CDN is needed.
 * Dates are DD/MM/YYYY (Latin digits) per item 7.
 *
 * @module electron/services/excelExport
 */

const ExcelJS = require('exceljs');
const { fromMinor } = require('../utils/money.js');
const { fmtDate }   = require('../utils/dates.js');

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

function fmt(minor) {
  return fromMinor(minor);
}

// ── Sheet builders ────────────────────────────────────────────────

function addSummarySheet(wb, report) {
  const sheet = wb.addWorksheet('ملخص');
  sheet.rightToLeft = true;

  const { sales, purchases, expenses, workersPay, net, period } = report;

  sheet.addRow([]);
  const titleRow = sheet.addRow(['تقرير المبيعات والمصروفات']);
  titleRow.font    = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(`A2:C2`);

  const periodRow = sheet.addRow([
    `الفترة: ${fmtDate(period.from)} – ${fmtDate(period.to)}`,
  ]);
  periodRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(`A3:C3`);

  sheet.addRow([]);

  const totalExpensesAll = expenses.totalExpenses + (workersPay?.total ?? 0);

  const data = [
    ['عدد الفواتير',           sales.receiptCount,               ''],
    ['إجمالي المبيعات',         fmt(sales.totalSales),             'دج'],
    ['رسوم التوصيل',           fmt(sales.totalDeliveryFees ?? 0), 'دج'],
    ['مبيعات محلي',             fmt(sales.byType.dine_in ?? 0),   'دج'],
    ...(( sales.byType.takeaway ?? 0) > 0 ? [['مبيعات سفري (قديم)', fmt(sales.byType.takeaway ?? 0), 'دج']] : []),
    ['مبيعات توصيل',            fmt(sales.byType.delivery ?? 0),  'دج'],
    ['إجمالي مشتريات الموردين', fmt(purchases.totalPurchases),    'دج'],
    ['إجمالي المصروفات الأخرى', fmt(expenses.totalExpenses),      'دج'],
    ['رواتب العمال',            fmt(workersPay?.total ?? 0),       'دج'],
    ['إجمالي المصروفات',       fmt(totalExpensesAll),              'دج'],
    ['الصافي',                  fmt(net),                          'دج'],
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

  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 8;
}

function addByDaySheet(wb, report) {
  const sheet = wb.addWorksheet('حسب اليوم');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'التاريخ',          key: 'date',     width: 16 },
    { header: 'الطلبات',           key: 'orders',   width: 12 },
    { header: 'المبيعات (دج)',     key: 'sales',    width: 20 },
    { header: 'رسوم التوصيل (دج)', key: 'fees',     width: 20 },
    { header: 'المصروفات (دج)',    key: 'expenses', width: 20 },
    { header: 'الصافي (دج)',       key: 'net',      width: 20 },
  ]);

  for (const row of (report.byDay ?? [])) {
    const r = sheet.addRow([
      fmtDate(row.date),
      row.orders,
      fmt(row.sales),
      fmt(row.fees),
      fmt(row.expenses),
      fmt(row.net),
    ]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    for (let i = 3; i <= 6; i++) {
      r.getCell(i).numFmt    = CURRENCY_FMT;
      r.getCell(i).alignment = { horizontal: 'right' };
    }
  }
}

function addSalesSheet(wb, report) {
  const sheet = wb.addWorksheet('المبيعات حسب النوع');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'نوع الطلب',     key: 'type',  width: 20 },
    { header: 'عدد الطلبات',   key: 'count', width: 15 },
    { header: 'المبلغ (دج)',   key: 'total', width: 20 },
  ]);

  const typeLabels = { dine_in: 'محلي', takeaway: 'سفري (قديم)', delivery: 'توصيل' };
  const byType = report.sales.byType;

  // Count per type from orders list
  const counts = { dine_in: 0, takeaway: 0, delivery: 0 };
  for (const o of (report.orders ?? [])) counts[o.order_type] = (counts[o.order_type] ?? 0) + 1;

  for (const [type, label] of Object.entries(typeLabels)) {
    // Skip takeaway row if no legacy orders exist
    if (type === 'takeaway' && (counts[type] ?? 0) === 0) continue;
    const row = sheet.addRow([label, counts[type] ?? 0, fmt(byType[type] ?? 0)]);
    row.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    row.getCell(3).numFmt    = CURRENCY_FMT;
    row.getCell(3).alignment = { horizontal: 'right' };
  }
}

function addOrdersSheet(wb, report) {
  const sheet = wb.addWorksheet('قائمة الطلبات');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: '#',              key: 'number',    width: 8  },
    { header: 'التاريخ والوقت', key: 'created',   width: 22 },
    { header: 'النوع',          key: 'type',      width: 12 },
    { header: 'الحالة',         key: 'status',    width: 12 },
    { header: 'العميل (توصيل)', key: 'customer',  width: 22 },
    { header: 'الأصناف',        key: 'items',     width: 40 },
    { header: 'رسوم التوصيل',   key: 'fee',       width: 16 },
    { header: 'الإجمالي (دج)',  key: 'total',     width: 16 },
  ]);

  const typeLabels   = { dine_in: 'محلي', takeaway: 'سفري (قديم)', delivery: 'توصيل' };
  const statusLabels = { normal: 'عادي', modified: 'معدّل', cancelled: 'ملغي' };

  for (const o of (report.orders ?? [])) {
    const itemSummary = (o.items ?? []).map(it => {
      const sizeOpt = (it.options ?? []).find(x => x.type === 'size');
      const extraOpts = (it.options ?? []).filter(x => x.type === 'extra').map(x => x.label).join('+');
      let name = it.product_name;
      if (sizeOpt) name += ` — ${sizeOpt.label}`;
      if (extraOpts) name += ` (${extraOpts})`;
      return `${name} x${it.qty}`;
    }).join(' | ');

    const r = sheet.addRow([
      o.number,
      fmtDate(o.created_at?.slice(0, 10)) + ' ' + (o.created_at?.slice(11, 16) ?? ''),
      typeLabels[o.order_type] ?? o.order_type,
      statusLabels[o.status] ?? o.status,
      o.delivery_name ?? '',
      itemSummary,
      fmt(o.delivery_fee ?? 0),
      fmt(o.total),
    ]);
    r.getCell(1).alignment = { horizontal: 'right' };
    r.getCell(7).numFmt    = CURRENCY_FMT;
    r.getCell(8).numFmt    = CURRENCY_FMT;
  }
}

function addCancelledSheet(wb, report) {
  if (!report.cancelled || report.cancelled.length === 0) return;

  const sheet = wb.addWorksheet('الطلبات الملغية');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: '#',              key: 'number',   width: 8  },
    { header: 'التاريخ والوقت', key: 'created',  width: 22 },
    { header: 'النوع',          key: 'type',     width: 12 },
    { header: 'الأصناف',        key: 'items',    width: 40 },
    { header: 'الإجمالي (دج)', key: 'total',    width: 16 },
  ]);

  const typeLabels = { dine_in: 'محلي', takeaway: 'سفري (قديم)', delivery: 'توصيل' };

  for (const o of report.cancelled) {
    const itemSummary = (o.items ?? []).map(it => `${it.product_name} x${it.qty}`).join(' | ');
    const r = sheet.addRow([
      o.number,
      fmtDate(o.created_at?.slice(0, 10)) + ' ' + (o.created_at?.slice(11, 16) ?? ''),
      typeLabels[o.order_type] ?? o.order_type,
      itemSummary,
      fmt(o.total),
    ]);
    r.getCell(5).numFmt = CURRENCY_FMT;
  }
}

function addPurchasesSheet(wb, report) {
  const sheet = wb.addWorksheet('مشتريات الموردين');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'المورد',         key: 'shop',      width: 25 },
    { header: 'التاريخ',        key: 'date',      width: 16 },
    { header: 'الإجمالي (دج)', key: 'total',     width: 20 },
    { header: 'المدفوع (دج)',  key: 'paid',      width: 20 },
    { header: 'المتبقي (دج)',  key: 'remaining', width: 20 },
  ]);

  for (const row of (report.purchases.purchaseDetail ?? report.purchases.rows)) {
    const r = sheet.addRow([
      row.shop_name,
      fmtDate(row.date),
      fmt(row.total),
      fmt(row.paid),
      fmt(row.remaining),
    ]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    for (let i = 3; i <= 5; i++) {
      r.getCell(i).numFmt    = CURRENCY_FMT;
      r.getCell(i).alignment = { horizontal: 'right' };
    }
  }

  // Total row
  const totRow = sheet.addRow([
    'الإجمالي', '',
    fmt(report.purchases.totalPurchases),
    fmt(report.purchases.totalPaid),
    '',
  ]);
  totRow.font = { bold: true };
  totRow.getCell(3).numFmt = CURRENCY_FMT;
  totRow.getCell(4).numFmt = CURRENCY_FMT;
}

function addDebtsSheet(wb, report) {
  const sheet = wb.addWorksheet('الديون المتبقية');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'المورد',             key: 'shop',      width: 25 },
    { header: 'الدين المتبقي (دج)', key: 'remaining', width: 25 },
  ]);

  for (const row of report.remainingDebts) {
    const r = sheet.addRow([row.shop_name, fmt(row.remaining)]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(2).numFmt    = CURRENCY_FMT;
    r.getCell(2).alignment = { horizontal: 'right' };
  }

  const totalDebt = report.remainingDebts.reduce((s, r) => s + r.remaining, 0);
  const totRow    = sheet.addRow(['إجمالي الديون', fmt(totalDebt)]);
  totRow.font = { bold: true };
  totRow.getCell(2).numFmt = CURRENCY_FMT;
}

function addExpensesSheet(wb, report) {
  const sheet = wb.addWorksheet('المصروفات');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'التاريخ',      key: 'date',     width: 16 },
    { header: 'الوصف',        key: 'name',     width: 25 },
    { header: 'الفئة',        key: 'category', width: 20 },
    { header: 'المبلغ (دج)', key: 'amount',   width: 20 },
  ]);

  const catLabels = {
    electricity: 'كهرباء',
    rent:        'إيجار',
    salary:      'رواتب',
    maintenance: 'صيانة',
    other:       'أخرى',
  };

  for (const row of (report.expenses.expenseDetail ?? report.expenses.rows)) {
    const r = sheet.addRow([
      fmtDate(row.date ?? ''),
      row.name ?? '',
      catLabels[row.category] ?? row.category,
      fmt(row.amount ?? row.total),
    ]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(4).numFmt    = CURRENCY_FMT;
    r.getCell(4).alignment = { horizontal: 'right' };
  }

  const totRow = sheet.addRow(['', 'الإجمالي', '', fmt(report.expenses.totalExpenses)]);
  totRow.font = { bold: true };
  totRow.getCell(4).numFmt = CURRENCY_FMT;
}

function addWorkersSheet(wb, report) {
  const wp = report.workersPay;
  if (!wp || wp.rows.length === 0) return;

  const sheet = wb.addWorksheet('رواتب العمال');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: 'العامل',           key: 'name',       width: 25 },
    { header: 'أيام الدفع',       key: 'days',       width: 15 },
    { header: 'الإجمالي المدفوع (دج)', key: 'total', width: 25 },
  ]);

  for (const row of wp.rows) {
    const r = sheet.addRow([row.worker_name, row.days_paid, fmt(row.total_paid)]);
    r.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(3).numFmt    = CURRENCY_FMT;
    r.getCell(3).alignment = { horizontal: 'right' };
  }

  const totRow = sheet.addRow(['الإجمالي', '', fmt(wp.total)]);
  totRow.font = { bold: true };
  totRow.getCell(3).numFmt = CURRENCY_FMT;
}

function addProductsSheet(wb, report) {
  const sheet = wb.addWorksheet('المنتجات');
  sheet.rightToLeft = true;

  addHeaderRow(sheet, [
    { header: '#',             key: 'rank',    width: 8  },
    { header: 'المنتج',        key: 'name',    width: 30 },
    { header: 'الحجم',         key: 'size',    width: 20 },
    { header: 'الكمية المباعة', key: 'qty',    width: 18 },
    { header: 'الإيرادات (دج)', key: 'revenue', width: 20 },
  ]);

  const allRows = report.products.best;
  for (const [i, row] of allRows.entries()) {
    const r = sheet.addRow([
      i + 1,
      row.product_name,
      row.size_name ?? '',
      row.total_qty,
      fmt(row.total_revenue),
    ]);
    r.getCell(2).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(3).alignment = { horizontal: 'right', readingOrder: 'rtl' };
    r.getCell(4).alignment = { horizontal: 'right' };
    r.getCell(5).numFmt    = CURRENCY_FMT;
    r.getCell(5).alignment = { horizontal: 'right' };
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
  addByDaySheet(wb, report);
  addSalesSheet(wb, report);
  addOrdersSheet(wb, report);
  addCancelledSheet(wb, report);
  addPurchasesSheet(wb, report);
  addDebtsSheet(wb, report);
  addExpensesSheet(wb, report);
  addWorkersSheet(wb, report);
  addProductsSheet(wb, report);

  await wb.xlsx.writeFile(filePath);
}

module.exports = { exportToExcel };
