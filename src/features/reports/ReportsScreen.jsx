import React, { useState, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import { reportsGet, reportsExportExcel, reportsExportPdf } from '../../api/index.js';
import { format, fmtDate } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';
import Toast from '../../components/Toast.jsx';
import styles from './ReportsScreen.module.css';

// ── Period picker ─────────────────────────────────────────────────

const PERIODS = [
  { value: 'day',    label: ar.periodDay    },
  { value: 'week',   label: ar.periodWeek   },
  { value: 'month',  label: ar.periodMonth  },
  { value: 'custom', label: ar.periodCustom },
];

const TYPE_LABELS = { dine_in: ar.dineIn, takeaway: ar.takeaway, delivery: ar.delivery };

const CAT_LABELS = {
  electricity: ar.expenseCategoryElectricity,
  rent:        ar.expenseCategoryRent,
  salary:      ar.expenseCategorySalary,
  maintenance: ar.expenseCategoryMaintenance,
  other:       ar.expenseCategoryOther,
};

// ── Sub-components ────────────────────────────────────────────────

function SummaryCard({ label, value, highlight }) {
  return (
    <div className={`${styles.card} ${highlight ? styles.cardHighlight : ''}`}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>;
}

function DataTable({ columns, rows, footerRow }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} className={c.numeric ? styles.numeric : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key} className={c.numeric ? styles.numeric : undefined}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={styles.noData}>
                {ar.noData}
              </td>
            </tr>
          )}
        </tbody>
        {footerRow && (
          <tfoot>
            <tr className={styles.footerRow}>
              {footerRow.map((cell, i) => (
                <td key={i} className={typeof cell === 'number' || (typeof cell === 'string' && cell.includes('دج')) ? styles.numeric : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────

export default function ReportsScreen() {
  const [period,   setPeriod]   = useState('day');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [report,   setReport]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [toast,    setToast]    = useState(null);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const loadReport = useCallback(async () => {
    setLoading(true);
    setReport(null);
    const res = await reportsGet({ period, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    setLoading(false);
    if (!res.ok) {
      showToast(res.error ?? ar.unknownError, 'error');
      return;
    }
    setReport(res.data);
  }, [period, dateFrom, dateTo]);

  const handleExportExcel = async () => {
    const res = await reportsExportExcel({ period, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    if (!res.ok)        return showToast(res.error ?? ar.unknownError, 'error');
    if (!res.data.saved) return showToast(ar.exportCancelled, 'info');
    showToast(ar.exportSaved, 'success');
  };

  const handleExportPdf = async () => {
    const res = await reportsExportPdf({ period, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    if (!res.ok)        return showToast(res.error ?? ar.unknownError, 'error');
    if (!res.data.saved) return showToast(ar.exportCancelled, 'info');
    showToast(ar.exportSaved, 'success');
  };

  // ── Derived data for tables ──────────────────────────────────────

  const purchaseCols = [
    { key: 'shop',      label: ar.shopLabel      },
    { key: 'total',     label: ar.total,     numeric: true },
    { key: 'paid',      label: ar.paidLabel, numeric: true },
    { key: 'remaining', label: ar.remainingLabel, numeric: true },
  ];

  const purchaseTableRows = report
    ? report.purchases.rows
        .filter(r => r.total > 0)
        .map(r => ({
          shop:      r.shop_name,
          total:     format(r.total),
          paid:      format(r.paid),
          remaining: format(r.remaining),
        }))
    : [];

  const debtCols = [
    { key: 'shop',      label: ar.shopLabel      },
    { key: 'remaining', label: ar.remainingDebts, numeric: true },
  ];

  const debtTableRows = report
    ? report.remainingDebts
        .filter(r => r.remaining > 0)
        .map(r => ({ shop: r.shop_name, remaining: format(r.remaining) }))
    : [];

  const expenseCols = [
    { key: 'category', label: ar.categoryLabel },
    { key: 'total',    label: ar.total, numeric: true },
  ];

  const expenseTableRows = report
    ? report.expenses.rows.map(r => ({
        category: CAT_LABELS[r.category] ?? r.category,
        total:    format(r.total),
      }))
    : [];

  const productCols = [
    { key: 'rank',    label: ar.rankLabel },
    { key: 'name',    label: ar.productNameLabel },
    { key: 'qty',     label: ar.soldQtyLabel,  numeric: true },
    { key: 'revenue', label: ar.revenueLabel,  numeric: true },
  ];

  const makeProductRows = (arr) =>
    (arr ?? []).map((r, i) => ({
      rank:    i + 1,
      name:    r.product_name,
      qty:     r.total_qty,
      revenue: format(r.total_revenue),
    }));

  return (
    <div className={styles.root}>
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className={styles.toolbar}>
        <h2 className={styles.pageTitle}>{ar.reportTitle}</h2>

        <div className={styles.periodTabs}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              className={`${styles.periodTab} ${period === p.value ? styles.periodTabActive : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className={styles.customRange}>
            <FormField label={ar.dateFrom}>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className={styles.dateInput}
              />
            </FormField>
            <FormField label={ar.dateTo}>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className={styles.dateInput}
              />
            </FormField>
          </div>
        )}

        <div className={styles.actions}>
          <Button onClick={loadReport} loading={loading}>
            {ar.viewReport}
          </Button>
          <Button variant="secondary" onClick={handleExportExcel} disabled={!report}>
            {ar.exportExcel}
          </Button>
          <Button variant="secondary" onClick={handleExportPdf} disabled={!report}>
            {ar.exportPdf}
          </Button>
        </div>
      </div>

      {loading && (
        <p className={styles.loadingMsg}>{ar.reportLoading}</p>
      )}

      {report && (
        <div className={styles.content}>
          <p className={styles.periodLabel}>
            {ar.dateFrom}: {fmtDate(report.period.from)} &nbsp;–&nbsp; {ar.dateTo}: {fmtDate(report.period.to)}
          </p>

          {/* Summary cards */}
          <div className={styles.cards}>
            <SummaryCard label={ar.receiptCountLabel}     value={report.sales.receiptCount} />
            <SummaryCard label={ar.totalSalesLabel}       value={format(report.sales.totalSales)} />
            <SummaryCard label={ar.totalPurchasesLabel}   value={format(report.purchases.totalPurchases)} />
            <SummaryCard label={ar.totalExpensesLabel}    value={format(report.expenses.totalExpenses)} />
            <SummaryCard label={ar.netLabel}              value={format(report.net)} highlight />
          </div>

          {/* Sales by type */}
          <SectionTitle>{ar.salesByType}</SectionTitle>
          <div className={styles.cards}>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <SummaryCard key={type} label={label} value={format(report.sales.byType[type] ?? 0)} />
            ))}
          </div>

          {/* Shop purchases */}
          <SectionTitle>{ar.shopPurchases}</SectionTitle>
          <DataTable
            columns={purchaseCols}
            rows={purchaseTableRows}
            footerRow={purchaseTableRows.length > 0 ? [
              ar.total,
              format(report.purchases.totalPurchases),
              format(report.purchases.totalPaid),
              '',
            ] : null}
          />

          {/* Remaining debts */}
          <SectionTitle>{ar.remainingDebts}</SectionTitle>
          <DataTable
            columns={debtCols}
            rows={debtTableRows}
            footerRow={debtTableRows.length > 0 ? [
              ar.totalDebtLabel,
              format(report.remainingDebts.reduce((s, r) => s + r.remaining, 0)),
            ] : null}
          />

          {/* Expenses */}
          <SectionTitle>{ar.totalExpenses}</SectionTitle>
          <DataTable
            columns={expenseCols}
            rows={expenseTableRows}
            footerRow={expenseTableRows.length > 0 ? [
              ar.total,
              format(report.expenses.totalExpenses),
            ] : null}
          />

          {/* Best selling */}
          <SectionTitle>{ar.bestSelling}</SectionTitle>
          <DataTable
            columns={productCols}
            rows={makeProductRows(report.products.best)}
          />

          {/* Worst selling */}
          <SectionTitle>{ar.worstSelling}</SectionTitle>
          <DataTable
            columns={productCols}
            rows={makeProductRows(report.products.worst)}
          />
        </div>
      )}
    </div>
  );
}
