'use strict';

/**
 * PDF report export service.
 * Renders a full report as HTML and uses Electron's printToPDF
 * (same pattern as receipt printing) to produce a PDF file.
 * Dates are DD/MM/YYYY (Latin digits) per item 7.
 *
 * @module electron/services/pdfExport
 */

const { BrowserWindow, dialog, app } = require('electron');
const path  = require('node:path');
const fs    = require('node:fs');
const { AppError }      = require('../utils/errors.js');
const { fromMinor }     = require('../utils/money.js');
const { fmtDate }       = require('../utils/dates.js');
const { getAllSettings } = require('../repositories/settings.js');

// ── HTML template ─────────────────────────────────────────────────

const CAT_LABELS = {
  electricity: 'كهرباء',
  rent:        'إيجار',
  salary:      'رواتب',
  maintenance: 'صيانة',
  other:       'أخرى',
};

const TYPE_LABELS   = { dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل' };
const STATUS_LABELS = { normal: 'عادي', modified: 'معدّل', cancelled: 'ملغي' };

function fmt(minor) {
  return `${fromMinor(minor).toFixed(2)} دج`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the report HTML page.
 * @param {object} report
 * @param {object} settings
 * @returns {string}
 */
function buildReportHtml(report, settings) {
  const restaurantName  = settings.restaurant_name ?? 'فاست فود رائد';
  const { from, to }    = report.period;
  const s  = report.sales;
  const p  = report.purchases;
  const e  = report.expenses;
  const wp = report.workersPay ?? { rows: [], total: 0 };
  const totalExpensesAll = e.totalExpenses + wp.total;
  const totalDebt = report.remainingDebts.reduce((sum, r) => sum + r.remaining, 0);

  // ── By-day table ──────────────────────────────────────────────
  const byDayRows = (report.byDay ?? [])
    .map(r => `<tr>
      <td>${esc(fmtDate(r.date))}</td>
      <td>${r.orders}</td>
      <td>${fmt(r.sales)}</td>
      <td>${fmt(r.fees)}</td>
      <td>${fmt(r.expenses)}</td>
      <td>${fmt(r.net)}</td>
    </tr>`)
    .join('');

  // ── Orders list ───────────────────────────────────────────────
  const orderRows = (report.orders ?? [])
    .map(o => {
      const itemSummary = (o.items ?? []).map(it => {
        const sizeOpt = (it.options ?? []).find(x => x.type === 'size');
        let name = it.product_name;
        if (sizeOpt) name += ` — ${sizeOpt.label}`;
        return `${esc(name)} x${it.qty}`;
      }).join('<br>');

      return `<tr>
        <td>${o.number}</td>
        <td>${esc(fmtDate(o.created_at?.slice(0,10)))} ${esc(o.created_at?.slice(11,16) ?? '')}</td>
        <td>${esc(TYPE_LABELS[o.order_type] ?? o.order_type)}</td>
        <td>${esc(STATUS_LABELS[o.status] ?? o.status)}</td>
        <td>${esc(o.delivery_name ?? '')}</td>
        <td style="font-size:11px">${itemSummary}</td>
        <td>${fmt(o.delivery_fee ?? 0)}</td>
        <td>${fmt(o.total)}</td>
      </tr>`;
    })
    .join('');

  // ── Cancelled orders ──────────────────────────────────────────
  const cancelledRows = (report.cancelled ?? [])
    .map(o => `<tr>
      <td>${o.number}</td>
      <td>${esc(fmtDate(o.created_at?.slice(0,10)))} ${esc(o.created_at?.slice(11,16) ?? '')}</td>
      <td>${esc(TYPE_LABELS[o.order_type] ?? o.order_type)}</td>
      <td>${fmt(o.total)}</td>
    </tr>`)
    .join('');

  // ── Purchases (per invoice) ───────────────────────────────────
  const purchaseRows = (p.purchaseDetail ?? p.rows)
    .filter(r => r.total > 0)
    .map(r => `<tr>
      <td>${esc(r.shop_name)}</td>
      <td>${esc(fmtDate(r.date))}</td>
      <td>${fmt(r.total)}</td>
      <td>${fmt(r.paid)}</td>
      <td>${fmt(r.remaining)}</td>
    </tr>`)
    .join('');

  // ── Remaining debts ───────────────────────────────────────────
  const debtRows = report.remainingDebts
    .filter(r => r.remaining > 0)
    .map(r => `<tr><td>${esc(r.shop_name)}</td><td>${fmt(r.remaining)}</td></tr>`)
    .join('');

  // ── Other expenses (individual) ───────────────────────────────
  const expenseRows = (e.expenseDetail ?? e.rows)
    .map(r => `<tr>
      <td>${esc(fmtDate(r.date ?? ''))}</td>
      <td>${esc(r.name ?? '')}</td>
      <td>${esc(CAT_LABELS[r.category] ?? r.category)}</td>
      <td>${fmt(r.amount ?? r.total)}</td>
    </tr>`)
    .join('');

  // ── Workers pay ───────────────────────────────────────────────
  const workerRows = wp.rows
    .map(r => `<tr>
      <td>${esc(r.worker_name)}</td>
      <td>${r.days_paid}</td>
      <td>${fmt(r.total_paid)}</td>
    </tr>`)
    .join('');

  // ── Products ──────────────────────────────────────────────────
  const bestRows = report.products.best
    .slice(0, 20)
    .map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(r.product_name)}</td>
      <td>${esc(r.size_name ?? '')}</td>
      <td>${r.total_qty}</td>
      <td>${fmt(r.total_revenue)}</td>
    </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 12px;
    color: #1a1a1a;
    direction: rtl;
  }
  h1 { font-size: 18px; margin: 0 0 2px 0; }
  h2 {
    font-size: 13px; margin: 14px 0 4px 0;
    border-bottom: 2px solid #3b6ea5;
    padding-bottom: 2px; color: #3b6ea5;
    break-before: auto;
  }
  .subtitle { color: #555; font-size: 11px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { padding: 4px 7px; text-align: right; border: 1px solid #d0d7de; font-size: 11px; }
  th { background: #e8f0fe; font-weight: bold; }
  tr:nth-child(even) { background: #f7f9fc; }
  .summary-table td:first-child { font-weight: bold; width: 55%; }
  .summary-table td:last-child  { color: #1a3a6a; font-weight: bold; }
  .total-row { background: #dbeafe !important; font-weight: bold; }
  .net-row   { background: #dcfce7 !important; font-weight: bold; font-size: 13px; }
  .footer { margin-top: 20px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #d0d7de; padding-top: 6px; }
  .section-wrap { page-break-inside: avoid; }
</style>
</head>
<body>
  <h1>${esc(restaurantName)}</h1>
  <div class="subtitle">التقرير من ${esc(fmtDate(from))} إلى ${esc(fmtDate(to))}</div>

  <!-- ── Summary ── -->
  <div class="section-wrap">
  <h2>ملخص المبيعات</h2>
  <table class="summary-table">
    <tr><td>عدد الفواتير</td><td>${s.receiptCount}</td></tr>
    <tr><td>إجمالي المبيعات</td><td>${fmt(s.totalSales)}</td></tr>
    <tr><td>رسوم التوصيل</td><td>${fmt(s.totalDeliveryFees ?? 0)}</td></tr>
    <tr><td>مبيعات محلي</td><td>${fmt(s.byType.dine_in ?? 0)}</td></tr>
    <tr><td>مبيعات سفري</td><td>${fmt(s.byType.takeaway ?? 0)}</td></tr>
    <tr><td>مبيعات توصيل</td><td>${fmt(s.byType.delivery ?? 0)}</td></tr>
    <tr><td>إجمالي مشتريات الموردين</td><td>${fmt(p.totalPurchases)}</td></tr>
    <tr><td>إجمالي المصروفات الأخرى</td><td>${fmt(e.totalExpenses)}</td></tr>
    <tr><td>رواتب العمال</td><td>${fmt(wp.total)}</td></tr>
    <tr><td>إجمالي المصروفات</td><td>${fmt(totalExpensesAll)}</td></tr>
    <tr class="net-row"><td>الصافي</td><td>${fmt(report.net)}</td></tr>
  </table>
  </div>

  <!-- ── By day ── -->
  ${byDayRows ? `
  <div class="section-wrap">
  <h2>حسب اليوم</h2>
  <table>
    <thead><tr><th>التاريخ</th><th>الطلبات</th><th>المبيعات</th><th>رسوم التوصيل</th><th>المصروفات</th><th>الصافي</th></tr></thead>
    <tbody>${byDayRows}</tbody>
  </table>
  </div>` : ''}

  <!-- ── Sales by type ── -->
  <div class="section-wrap">
  <h2>المبيعات حسب النوع</h2>
  <table>
    <thead><tr><th>النوع</th><th>المبلغ</th></tr></thead>
    <tbody>
      <tr><td>محلي</td><td>${fmt(s.byType.dine_in ?? 0)}</td></tr>
      <tr><td>سفري</td><td>${fmt(s.byType.takeaway ?? 0)}</td></tr>
      <tr><td>توصيل</td><td>${fmt(s.byType.delivery ?? 0)}</td></tr>
    </tbody>
  </table>
  </div>

  <!-- ── Orders list ── -->
  ${orderRows ? `
  <div class="section-wrap">
  <h2>قائمة الطلبات</h2>
  <table>
    <thead><tr><th>#</th><th>التاريخ والوقت</th><th>النوع</th><th>الحالة</th><th>العميل</th><th>الأصناف</th><th>رسوم التوصيل</th><th>الإجمالي</th></tr></thead>
    <tbody>${orderRows}</tbody>
  </table>
  </div>` : ''}

  <!-- ── Cancelled orders ── -->
  ${cancelledRows ? `
  <div class="section-wrap">
  <h2>الطلبات الملغية (مستثناة من الإجمالي)</h2>
  <table>
    <thead><tr><th>#</th><th>التاريخ والوقت</th><th>النوع</th><th>الإجمالي</th></tr></thead>
    <tbody>${cancelledRows}</tbody>
  </table>
  </div>` : ''}

  <!-- ── Purchases ── -->
  ${purchaseRows ? `
  <div class="section-wrap">
  <h2>مشتريات الموردين (${esc(fmtDate(from))} – ${esc(fmtDate(to))})</h2>
  <table>
    <thead><tr><th>المورد</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
    <tbody>${purchaseRows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2">الإجمالي</td>
        <td>${fmt(p.totalPurchases)}</td>
        <td>${fmt(p.totalPaid)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  </div>` : ''}

  <!-- ── Remaining debts ── -->
  ${debtRows ? `
  <div class="section-wrap">
  <h2>الديون المتبقية (إجمالي كل الوقت)</h2>
  <table>
    <thead><tr><th>المورد</th><th>الدين المتبقي</th></tr></thead>
    <tbody>${debtRows}</tbody>
    <tfoot><tr class="total-row"><td>الإجمالي</td><td>${fmt(totalDebt)}</td></tr></tfoot>
  </table>
  </div>` : ''}

  <!-- ── Other expenses ── -->
  ${expenseRows ? `
  <div class="section-wrap">
  <h2>المصروفات الأخرى (${esc(fmtDate(from))} – ${esc(fmtDate(to))})</h2>
  <table>
    <thead><tr><th>التاريخ</th><th>الوصف</th><th>الفئة</th><th>المبلغ</th></tr></thead>
    <tbody>${expenseRows}</tbody>
    <tfoot><tr class="total-row"><td colspan="3">الإجمالي</td><td>${fmt(e.totalExpenses)}</td></tr></tfoot>
  </table>
  </div>` : ''}

  <!-- ── Workers pay ── -->
  ${workerRows ? `
  <div class="section-wrap">
  <h2>رواتب العمال</h2>
  <table>
    <thead><tr><th>العامل</th><th>أيام الدفع</th><th>الإجمالي المدفوع</th></tr></thead>
    <tbody>${workerRows}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">الإجمالي</td><td>${fmt(wp.total)}</td></tr></tfoot>
  </table>
  </div>` : ''}

  <!-- ── Products ── -->
  ${bestRows ? `
  <div class="section-wrap">
  <h2>المنتجات حسب المبيعات</h2>
  <table>
    <thead><tr><th>#</th><th>المنتج</th><th>الحجم</th><th>الكمية المباعة</th><th>الإيرادات</th></tr></thead>
    <tbody>${bestRows}</tbody>
  </table>
  </div>` : ''}

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
