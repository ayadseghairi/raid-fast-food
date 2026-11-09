'use strict';

/**
 * PDF report export service.
 * Renders a full report as HTML and uses Electron's printToPDF
 * (same pattern as receipt printing) to produce a PDF file.
 *
 * @module electron/services/pdfExport
 */

const { BrowserWindow, dialog, app } = require('electron');
const path  = require('node:path');
const fs    = require('node:fs');
const { AppError }   = require('../utils/errors.js');
const { fromMinor }  = require('../utils/money.js');
const { getAllSettings } = require('../repositories/settings.js');

// ── HTML template ─────────────────────────────────────────────────

const CAT_LABELS = {
  electricity: 'كهرباء',
  rent:        'إيجار',
  salary:      'رواتب',
  maintenance: 'صيانة',
  other:       'أخرى',
};

function fmt(minor) {
  return `${fromMinor(minor).toFixed(2)} دج`;
}

/**
 * Build the report HTML page.
 * @param {object} report
 * @param {object} settings
 * @returns {string}
 */
function buildReportHtml(report, settings) {
  const restaurantName = settings.restaurant_name ?? 'فاست فود رائد';
  const { from, to } = report.period;
  const s = report.sales;
  const p = report.purchases;
  const e = report.expenses;
  const totalDebt = report.remainingDebts.reduce((sum, r) => sum + r.remaining, 0);

  const purchaseRows = p.rows
    .filter(r => r.total > 0)
    .map(
      r =>
        `<tr>
          <td>${r.shop_name}</td>
          <td>${fmt(r.total)}</td>
          <td>${fmt(r.paid)}</td>
          <td>${fmt(r.remaining)}</td>
        </tr>`
    )
    .join('');

  const debtRows = report.remainingDebts
    .filter(r => r.remaining > 0)
    .map(r => `<tr><td>${r.shop_name}</td><td>${fmt(r.remaining)}</td></tr>`)
    .join('');

  const expenseRows = e.rows
    .map(r => `<tr><td>${CAT_LABELS[r.category] ?? r.category}</td><td>${fmt(r.total)}</td></tr>`)
    .join('');

  const bestRows = report.products.best
    .slice(0, 10)
    .map((r, i) => `<tr><td>${i + 1}</td><td>${r.product_name}</td><td>${r.total_qty}</td><td>${fmt(r.total_revenue)}</td></tr>`)
    .join('');

  const worstRows = report.products.worst
    .slice(0, 10)
    .map((r, i) => `<tr><td>${i + 1}</td><td>${r.product_name}</td><td>${r.total_qty}</td><td>${fmt(r.total_revenue)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 13px;
    color: #1a1a1a;
    direction: rtl;
  }
  h1 { font-size: 20px; margin: 0 0 4px 0; }
  h2 { font-size: 15px; margin: 18px 0 6px 0; border-bottom: 2px solid #3b6ea5; padding-bottom: 3px; color: #3b6ea5; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { padding: 5px 8px; text-align: right; border: 1px solid #d0d7de; }
  th { background: #e8f0fe; font-weight: bold; }
  tr:nth-child(even) { background: #f7f9fc; }
  .summary-table td:first-child { font-weight: bold; width: 55%; }
  .summary-table td:last-child  { color: #1a3a6a; font-weight: bold; }
  .total-row { background: #dbeafe !important; font-weight: bold; }
  .net-row   { background: #dcfce7 !important; font-weight: bold; font-size: 15px; }
  .footer { margin-top: 30px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #d0d7de; padding-top: 8px; }
</style>
</head>
<body>
  <h1>${restaurantName}</h1>
  <div class="subtitle">التقرير من ${from} إلى ${to}</div>

  <h2>ملخص المبيعات</h2>
  <table class="summary-table">
    <tr><td>عدد الفواتير</td><td>${s.receiptCount}</td></tr>
    <tr><td>إجمالي المبيعات</td><td>${fmt(s.totalSales)}</td></tr>
    <tr><td>مبيعات محلي</td><td>${fmt(s.byType.dine_in ?? 0)}</td></tr>
    <tr><td>مبيعات سفري</td><td>${fmt(s.byType.takeaway ?? 0)}</td></tr>
    <tr><td>مبيعات توصيل</td><td>${fmt(s.byType.delivery ?? 0)}</td></tr>
    <tr><td>إجمالي مشتريات الموردين</td><td>${fmt(p.totalPurchases)}</td></tr>
    <tr><td>إجمالي المصروفات الأخرى</td><td>${fmt(e.totalExpenses)}</td></tr>
    <tr class="net-row"><td>الصافي</td><td>${fmt(report.net)}</td></tr>
  </table>

  ${purchaseRows
    ? `<h2>مشتريات الموردين (${from} – ${to})</h2>
  <table>
    <thead><tr><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody>${purchaseRows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td>الإجمالي</td>
        <td>${fmt(p.totalPurchases)}</td>
        <td>${fmt(p.totalPaid)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>`
    : ''}

  ${debtRows
    ? `<h2>الديون المتبقية (إجمالي)</h2>
  <table>
    <thead><tr><th>المورد</th><th>الدين المتبقي</th></tr></thead>
    <tbody>${debtRows}</tbody>
    <tfoot>
      <tr class="total-row"><td>الإجمالي</td><td>${fmt(totalDebt)}</td></tr>
    </tfoot>
  </table>`
    : ''}

  ${expenseRows
    ? `<h2>المصروفات الأخرى (${from} – ${to})</h2>
  <table>
    <thead><tr><th>الفئة</th><th>الإجمالي</th></tr></thead>
    <tbody>${expenseRows}</tbody>
    <tfoot>
      <tr class="total-row"><td>الإجمالي</td><td>${fmt(e.totalExpenses)}</td></tr>
    </tfoot>
  </table>`
    : ''}

  ${bestRows
    ? `<h2>الأكثر مبيعاً</h2>
  <table>
    <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإيرادات</th></tr></thead>
    <tbody>${bestRows}</tbody>
  </table>`
    : ''}

  ${worstRows
    ? `<h2>الأقل مبيعاً</h2>
  <table>
    <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإيرادات</th></tr></thead>
    <tbody>${worstRows}</tbody>
  </table>`
    : ''}

  <div class="footer">تم إنشاؤه بواسطة فاست فود رائد</div>
</body>
</html>`;
}

// ── Export ────────────────────────────────────────────────────────

/** @type {BrowserWindow|null} */
let reportWin = null;

function getReportWindow() {
  if (reportWin && !reportWin.isDestroyed()) return reportWin;
  reportWin = new BrowserWindow({
    show: false,
    width: 794,   // A4 at 96dpi ≈ 794px
    height: 1123, // A4 height
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  reportWin.on('closed', () => { reportWin = null; });
  return reportWin;
}

/**
 * Render a report as an A4 PDF and prompt the user to save it.
 * @param {object} report  – result of services/reports.getReport()
 * @returns {Promise<{ saved: boolean, filePath?: string }>}
 */
async function exportToPdf(report) {
  const settings = getAllSettings();
  const html     = buildReportHtml(report, settings);

  const win = getReportWindow();
  const encoded = Buffer.from(html, 'utf8').toString('base64');

  await new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', resolve);
    win.webContents.once('did-fail-load', (_e, code, desc) =>
      reject(new AppError(`فشل تحميل التقرير: ${desc}`))
    );
    win.loadURL(`data:text/html;base64,${encoded}`);
  });

  const defaultName = `report-${report.period.from}--${report.period.to}.pdf`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'حفظ التقرير كـ PDF',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { saved: false };

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    margins: { marginType: 'none' },
  });

  fs.writeFileSync(filePath, pdfBuffer);
  return { saved: true, filePath };
}

module.exports = { exportToPdf };
