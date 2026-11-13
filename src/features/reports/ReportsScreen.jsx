import React, { useState, useCallback, useRef, useEffect } from 'react';
import ar from '../../i18n/ar.js';
import { reportsGet, reportsExportExcel, reportsExportPdf } from '../../api/index.js';
import { format, fmtDate, fmtDateTime } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import DateInput from '../../components/DateInput.jsx';
import Modal from '../../components/Modal.jsx';
import Toast from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import styles from './ReportsScreen.module.css';

// ── Period picker ─────────────────────────────────────────────────

const PERIODS = [
  { value: 'day',    label: ar.periodDay    },
  { value: 'week',   label: ar.periodWeek   },
  { value: 'month',  label: ar.periodMonth  },
  { value: 'custom', label: ar.periodCustom },
];

// takeaway uses the legacy label; it is shown only when count > 0 in the by-type section
const TYPE_LABELS   = { dine_in: ar.dineIn, takeaway: ar.takeawayLegacy, delivery: ar.delivery };
const STATUS_LABELS = { normal: ar.statusNormal, modified: ar.statusModified, cancelled: ar.statusCancelled };

const CAT_LABELS = {
  electricity: ar.expenseCategoryElectricity,
  rent:        ar.expenseCategoryRent,
  salary:      ar.expenseCategorySalary,
  maintenance: ar.expenseCategoryMaintenance,
  other:       ar.expenseCategoryOther,
};

// ── Sub-components ────────────────────────────────────────────────

function SummaryCard({ label, value, highlight, sub }) {
  return (
    <div className={`${styles.card} ${highlight ? styles.cardHighlight : ''}`}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue}>{value}</span>
      {sub && <span className={styles.cardSub}>{sub}</span>}
    </div>
  );
}

function Section({ title, meta, children, defaultOpen = true, forceOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  // forceOpen lets parent override: true = open all, false = close all
  useEffect(() => {
    if (forceOpen !== undefined) setOpen(forceOpen);
  }, [forceOpen]);

  return (
    <div className={styles.section}>
      <button
        className={styles.sectionHeader}
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className={styles.sectionTitleGroup}>
          <span className={styles.sectionTitle}>{title}</span>
          {meta && <span className={styles.sectionMeta}>{meta}</span>}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className={styles.sectionChevron} />
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function DataTable({ columns, rows, footerRow, onRowClick }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                className={c.numeric ? styles.numeric : undefined}
                style={c.minWidth ? { minWidth: c.minWidth } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              className={onRowClick ? styles.clickableRow : undefined}
            >
              {columns.map(c => (
                <td
                  key={c.key}
                  className={c.numeric ? styles.numeric : undefined}
                  style={c.minWidth ? { minWidth: c.minWidth } : undefined}
                  title={typeof row[c.key] === 'string' ? row[c.key] : undefined}
                >
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
            <tr>
              {footerRow.map((cell, i) => (
                <td key={i} className={styles.numeric}>{cell}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Simple SVG bar chart ──────────────────────────────────────────

function BarChart({ data, title, color = 'var(--accent)' }) {
  if (!data || data.length === 0) {
    return (
      <div className={styles.chartWrap}>
        <p className={styles.chartTitle}>{title}</p>
        <div className={styles.chartEmpty}>{ar.chartEmpty}</div>
      </div>
    );
  }
  const W = 560;
  const H = 160;
  const PAD = { top: 10, right: 10, bottom: 40, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW   = Math.max(4, (chartW / data.length) - 2);

  return (
    <div className={styles.chartWrap}>
      <p className={styles.chartTitle}>{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} aria-hidden="true">
        {/* Y-axis gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = PAD.top + chartH * (1 - t);
          const label = format(Math.round(maxVal * t));
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                stroke="var(--border)" strokeWidth="0.5" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end"
                fontSize="8" fill="var(--text-secondary)">{label}</text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const barH = chartH * (d.value / maxVal);
          const x    = PAD.left + i * (chartW / data.length) + (chartW / data.length - barW) / 2;
          const y    = PAD.top + chartH - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" />
              {data.length <= 14 && (
                <text
                  x={x + barW / 2} y={H - PAD.bottom + 14}
                  textAnchor="middle" fontSize="8" fill="var(--text-secondary)"
                  transform={data.length > 7 ? `rotate(-45, ${x + barW / 2}, ${H - PAD.bottom + 14})` : undefined}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Axes */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom}
          stroke="var(--border)" strokeWidth="1" />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
          stroke="var(--border)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── Order detail modal ────────────────────────────────────────────

function OrderDetailModal({ order, onClose }) {
  if (!order) return null;

  return (
    <Modal open title={`${ar.orderDetailTitle} #${order.number}`} onClose={onClose} size="lg">
      <div className={styles.orderDetail}>
        <div className={styles.orderDetailMeta}>
          <span>{fmtDateTime(order.created_at)}</span>
          <span>{TYPE_LABELS[order.order_type] ?? order.order_type}</span>
          <span className={styles[`status_${order.status}`]}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          {order.delivery_name && <span>{order.delivery_name} — {order.delivery_phone}</span>}
          {order.delivery_addr && <span>{order.delivery_addr}</span>}
        </div>

        <table className={styles.table} style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>{ar.productNameLabel}</th>
              <th className={styles.numeric}>{ar.unitPrice}</th>
              <th className={styles.numeric}>{ar.quantity}</th>
              <th className={styles.numeric}>{ar.total}</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map((it, i) => {
              const sizeOpt = (it.options ?? []).find(o => o.type === 'size');
              const extras  = (it.options ?? []).filter(o => o.type === 'extra');
              return (
                <tr key={i}>
                  <td>
                    {it.product_name}
                    {sizeOpt && <span className={styles.itemSize}> — {sizeOpt.label}</span>}
                    {extras.map((e, j) => (
                      <span key={j} className={styles.itemExtra}> + {e.label}</span>
                    ))}
                    {it.note && <span className={styles.itemNote}> ({it.note})</span>}
                  </td>
                  <td className={styles.numeric}>{format(it.unit_price)}</td>
                  <td className={styles.numeric}>{it.qty}</td>
                  <td className={styles.numeric}>{format(it.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {order.delivery_fee > 0 && (
              <tr>
                <td colSpan={3}>{ar.deliveryFee}</td>
                <td className={styles.numeric}>{format(order.delivery_fee)}</td>
              </tr>
            )}
            <tr className={styles.footerRow}>
              <td colSpan={3}>{ar.grandTotal}</td>
              <td className={styles.numeric}>{format(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.auditLog && order.auditLog.length > 0 && (
          <div className={styles.auditSection}>
            <h4 className={styles.auditTitle}>{ar.auditLogTitle}</h4>
            {order.auditLog.map((entry, i) => (
              <div key={i} className={styles.auditEntry}>
                <span className={styles.auditAction}>
                  {entry.action === 'modify' ? ar.auditModify : ar.auditCancel}
                </span>
                <span className={styles.auditTime}>{fmtDateTime(entry.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────

export default function ReportsScreen() {
  const [period,       setPeriod]       = useState('day');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [report,       setReport]       = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [toast,        setToast]        = useState(null);
  const [activeOrder,  setActiveOrder]  = useState(null);
  // undefined = uncontrolled (each section owns its own state)
  const [forceOpen,    setForceOpen]    = useState(undefined);
  const [showBackTop,  setShowBackTop]  = useState(false);
  const contentRef = useRef(null);

  // Reset forceOpen after one render cycle so sections own their state again
  const handleForceOpen = (value) => {
    setForceOpen(value);
    setTimeout(() => setForceOpen(undefined), 0);
  };

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
    if (!res.ok)         return showToast(res.error ?? ar.unknownError, 'error');
    if (!res.data.saved) return showToast(ar.exportCancelled, 'info');
    showToast(ar.exportSaved, 'success');
  };

  const handleExportPdf = async () => {
    const res = await reportsExportPdf({ period, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    if (!res.ok)         return showToast(res.error ?? ar.unknownError, 'error');
    if (!res.data.saved) return showToast(ar.exportCancelled, 'info');
    showToast(ar.exportSaved, 'success');
  };

  // ── Chart data ───────────────────────────────────────────────────

  const salesPerDayData = report
    ? (report.byDay ?? []).map(d => ({
        label: fmtDate(d.date).slice(0, 5), // DD/MM
        value: d.sales,
      }))
    : [];

  // Filter out takeaway from chart if no legacy data exists
  const salesByTypeData = report
    ? [
        { label: ar.dineIn,          value: report.sales.byType.dine_in  ?? 0 },
        ...(report.sales.byType.takeaway > 0
          ? [{ label: ar.takeawayLegacy, value: report.sales.byType.takeaway ?? 0 }]
          : []),
        { label: ar.delivery,        value: report.sales.byType.delivery  ?? 0 },
      ]
    : [];

  // ── Table row builders ───────────────────────────────────────────

  const byDayCols = [
    { key: 'date',     label: ar.dayDate,            minWidth: 100 },
    { key: 'orders',   label: ar.receiptCountLabel,  numeric: true, minWidth: 70 },
    { key: 'sales',    label: ar.totalSalesLabel,    numeric: true, minWidth: 110 },
    { key: 'fees',     label: ar.totalDeliveryFees,  numeric: true, minWidth: 110 },
    { key: 'expenses', label: ar.totalExpensesLabel, numeric: true, minWidth: 110 },
    { key: 'net',      label: ar.netLabel,           numeric: true, minWidth: 110 },
  ];

  const byDayRows = report
    ? (report.byDay ?? []).map(r => ({
        date:     fmtDate(r.date),
        orders:   r.orders,
        sales:    format(r.sales),
        fees:     format(r.fees),
        expenses: format(r.expenses),
        net:      format(r.net),
      }))
    : [];

  const productCols = [
    { key: 'rank',    label: ar.rankLabel,       minWidth: 48 },
    { key: 'name',    label: ar.productNameLabel, minWidth: 160 },
    { key: 'size',    label: ar.sizeLabelReport,  minWidth: 80 },
    { key: 'qty',     label: ar.soldQtyLabel,    numeric: true, minWidth: 70 },
    { key: 'revenue', label: ar.revenueLabel,    numeric: true, minWidth: 110 },
  ];

  const makeProductRows = arr =>
    (arr ?? []).map((r, i) => ({
      rank:    i + 1,
      name:    r.product_name,
      size:    r.size_name ?? '',
      qty:     r.total_qty,
      revenue: format(r.total_revenue),
    }));

  const purchaseCols = [
    { key: 'shop',      label: ar.shopLabel,       minWidth: 150 },
    { key: 'date',      label: ar.purchaseDate,    minWidth: 100 },
    { key: 'total',     label: ar.total,           numeric: true, minWidth: 110 },
    { key: 'paid',      label: ar.paidLabel,       numeric: true, minWidth: 110 },
    { key: 'remaining', label: ar.remainingLabel,  numeric: true, minWidth: 110 },
  ];

  const purchaseTableRows = report
    ? (report.purchases.purchaseDetail ?? report.purchases.rows)
        .filter(r => r.total > 0)
        .map(r => ({
          shop:      r.shop_name,
          date:      fmtDate(r.date),
          total:     format(r.total),
          paid:      format(r.paid),
          remaining: format(r.remaining),
        }))
    : [];

  const debtCols = [
    { key: 'shop',      label: ar.shopLabel,      minWidth: 150 },
    { key: 'remaining', label: ar.remainingDebts, numeric: true, minWidth: 110 },
  ];

  const debtTableRows = report
    ? report.remainingDebts
        .filter(r => r.remaining > 0)
        .map(r => ({ shop: r.shop_name, remaining: format(r.remaining) }))
    : [];

  const expenseCols = [
    { key: 'date',     label: ar.expenseDate,    minWidth: 100 },
    { key: 'name',     label: ar.expenseName,    minWidth: 160 },
    { key: 'category', label: ar.categoryLabel,  minWidth: 100 },
    { key: 'amount',   label: ar.expenseAmount,  numeric: true, minWidth: 110 },
  ];

  const expenseTableRows = report
    ? (report.expenses.expenseDetail ?? report.expenses.rows).map(r => ({
        date:     fmtDate(r.date ?? ''),
        name:     r.name ?? '',
        category: CAT_LABELS[r.category] ?? r.category,
        amount:   format(r.amount ?? r.total),
      }))
    : [];

  const workerCols = [
    { key: 'name',  label: ar.workerName,         minWidth: 150 },
    { key: 'days',  label: ar.daysPaid, numeric: true, minWidth: 80 },
    { key: 'total', label: ar.totalPaid, numeric: true, minWidth: 110 },
  ];

  const workerRows = report
    ? (report.workersPay?.rows ?? []).map(r => ({
        name:  r.worker_name,
        days:  r.days_paid,
        total: format(r.total_paid),
      }))
    : [];

  const orderCols = [
    { key: 'number',   label: ar.receiptNumber, numeric: true,  minWidth: 56 },
    { key: 'datetime', label: ar.orderDate,                     minWidth: 140 },
    { key: 'type',     label: ar.orderType,                     minWidth: 90 },
    { key: 'status',   label: ar.orderStatus,                   minWidth: 90 },
    { key: 'customer', label: ar.customerName,                  minWidth: 120 },
    { key: 'fee',      label: ar.deliveryFee,   numeric: true,  minWidth: 90 },
    { key: 'total',    label: ar.total,         numeric: true,  minWidth: 110 },
  ];

  // Status badge: colored chip with text label (not color alone)
  function StatusBadge({ status }) {
    return (
      <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
        {STATUS_LABELS[status] ?? status}
      </span>
    );
  }

  const makeOrderRows = (orders) => (orders ?? []).map(o => ({
    _raw:     o,
    number:   o.number,
    datetime: fmtDateTime(o.created_at),
    type:     TYPE_LABELS[o.order_type]   ?? o.order_type,
    status:   <StatusBadge status={o.status} />,
    customer: o.delivery_name ?? '—',
    fee:      format(o.delivery_fee ?? 0),
    total:    format(o.total),
  }));

  const orderRows     = report ? makeOrderRows(report.orders)    : [];
  const cancelledRows = report ? makeOrderRows(report.cancelled) : [];

  return (
    <div className={styles.root}>
      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}

      {activeOrder && (
        <OrderDetailModal order={activeOrder} onClose={() => setActiveOrder(null)} />
      )}

      {/* ── Toolbar ── */}
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
            <span className={styles.rangeLabel}>{ar.dateFrom}</span>
            <DateInput value={dateFrom} onChange={setDateFrom} />
            <span className={styles.rangeLabel}>{ar.dateTo}</span>
            <DateInput value={dateTo} onChange={setDateTo} />
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
        <div
          className={styles.content}
          ref={contentRef}
          onScroll={e => setShowBackTop(e.currentTarget.scrollTop > 200)}
        >
          {/* ── Content toolbar: period label + expand/collapse buttons ── */}
          <div className={styles.contentToolbar}>
            <p className={styles.periodLabel} style={{ margin: 0 }}>
              {ar.dateFrom}: {fmtDate(report.period.from)} &nbsp;–&nbsp; {ar.dateTo}: {fmtDate(report.period.to)}
            </p>
            <div className={styles.expandBtns}>
              <button
                type="button"
                className={styles.periodTab}
                onClick={() => handleForceOpen(true)}
              >
                {ar.expandAll}
              </button>
              <button
                type="button"
                className={styles.periodTab}
                onClick={() => handleForceOpen(false)}
              >
                {ar.collapseAll}
              </button>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <Section
            title={ar.receiptCountLabel + ' / ' + ar.totalSalesLabel}
            forceOpen={forceOpen}
            meta={`${report.sales.receiptCount} ${ar.receiptCountLabel} · ${format(report.sales.totalSales)} ${ar.currency}`}
          >
            <div className={styles.cards}>
              <SummaryCard label={ar.receiptCountLabel}  value={report.sales.receiptCount} />
              <SummaryCard label={ar.totalSalesLabel}    value={format(report.sales.totalSales)} />
              <SummaryCard label={ar.totalDeliveryFees}  value={format(report.sales.totalDeliveryFees ?? 0)} />
              <SummaryCard label={ar.totalPurchasesLabel} value={format(report.purchases.totalPurchases)} />
              <SummaryCard label={ar.totalExpensesLabel} value={format(report.expenses.totalExpenses)} />
              <SummaryCard label={ar.workersPaySection}  value={format(report.workersPay?.total ?? 0)} />
              <SummaryCard
                label={ar.netLabel}
                value={format(report.net)}
                highlight
              />
            </div>
          </Section>

          {/* ── Charts ── */}
          {(salesPerDayData.length > 0 || salesByTypeData.some(d => d.value > 0)) && (
            <Section title={ar.chartsTitle} defaultOpen={false} forceOpen={forceOpen}>
              <div className={styles.chartsRow}>
                {salesPerDayData.length > 0 && (
                  <BarChart data={salesPerDayData} title={ar.chartSalesPerDay} />
                )}
                <BarChart
                  data={salesByTypeData.filter(d => d.value > 0)}
                  title={ar.chartSalesByType}
                  color="var(--color-accent-secondary, #7c5cd8)"
                />
              </div>
            </Section>
          )}

          {/* ── By day ── */}
          <Section title={ar.byDayLabel} meta={`${byDayRows.length}`} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable
              columns={byDayCols}
              rows={byDayRows}
            />
          </Section>

          {/* ── Sales by type ── */}
          <Section title={ar.salesByType} meta={format(report.sales.totalSales) + ' ' + ar.currency} defaultOpen={false} forceOpen={forceOpen}>
            <div className={styles.cards}>
              {Object.entries(TYPE_LABELS)
                // Hide takeaway row when there is no legacy data
                .filter(([type]) => type !== 'takeaway' || (report.sales.byType.takeaway ?? 0) > 0)
                .map(([type, label]) => (
                  <SummaryCard key={type} label={label} value={format(report.sales.byType[type] ?? 0)} />
                ))}
            </div>
          </Section>

          {/* ── Products ── */}
          <Section title={ar.bestSelling} meta={`${(report.products.best ?? []).length}`} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable columns={productCols} rows={makeProductRows(report.products.best)} />
          </Section>

          <Section title={ar.worstSelling} meta={`${(report.products.worst ?? []).length}`} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable columns={productCols} rows={makeProductRows(report.products.worst)} />
          </Section>

          {/* ── Orders list ── */}
          <Section title={ar.ordersList} meta={`${orderRows.length} ${ar.receiptCountLabel}`} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable
              columns={orderCols}
              rows={orderRows}
              onRowClick={row => setActiveOrder(row._raw)}
            />
          </Section>

          {/* ── Cancelled orders ── */}
          <Section
            title={ar.cancelledOrders}
            meta={`${cancelledRows.length} · ${ar.cancelledNote}`}
            defaultOpen={false}
            forceOpen={forceOpen}
          >
            <DataTable
              columns={orderCols}
              rows={cancelledRows}
              onRowClick={row => setActiveOrder(row._raw)}
            />
          </Section>

          {/* ── Shop purchases ── */}
          <Section title={ar.shopPurchases} meta={format(report.purchases.totalPurchases) + ' ' + ar.currency} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable
              columns={purchaseCols}
              rows={purchaseTableRows}
              footerRow={purchaseTableRows.length > 0 ? [
                ar.total, '',
                format(report.purchases.totalPurchases),
                format(report.purchases.totalPaid),
                '',
              ] : null}
            />
          </Section>

          {/* ── Remaining debts ── */}
          <Section title={ar.remainingDebts} meta={`${debtTableRows.length}`} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable
              columns={debtCols}
              rows={debtTableRows}
              footerRow={debtTableRows.length > 0 ? [
                ar.totalDebtLabel,
                format(report.remainingDebts.reduce((s, r) => s + r.remaining, 0)),
              ] : null}
            />
          </Section>

          {/* ── Other expenses ── */}
          <Section title={ar.totalExpenses} meta={format(report.expenses.totalExpenses) + ' ' + ar.currency} defaultOpen={false} forceOpen={forceOpen}>
            <DataTable
              columns={expenseCols}
              rows={expenseTableRows}
              footerRow={expenseTableRows.length > 0 ? [
                '', ar.total, '',
                format(report.expenses.totalExpenses),
              ] : null}
            />
          </Section>

          {/* ── Workers pay ── */}
          {report.workersPay?.rows?.length > 0 && (
            <Section title={ar.workersPaySection} meta={format(report.workersPay.total) + ' ' + ar.currency} defaultOpen={false} forceOpen={forceOpen}>
              <DataTable
                columns={workerCols}
                rows={workerRows}
                footerRow={workerRows.length > 0 ? [
                  ar.total, '',
                  format(report.workersPay.total),
                ] : null}
              />
            </Section>
          )}
        </div>
      )}

      {/* ── Floating back-to-top button ── */}
      <button
        type="button"
        className={`${styles.backToTop} ${showBackTop ? styles.backToTopVisible : ''}`}
        onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label={ar.backToTop}
      >
        ↑ {ar.backToTop}
      </button>
    </div>
  );
}
