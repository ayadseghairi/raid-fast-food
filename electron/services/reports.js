'use strict';

/**
 * Reports service.
 * Computes aggregated data over a date range (from/to as YYYY-MM-DD strings).
 *
 * Returned amounts are always in INTEGER MINOR UNITS (×100).
 * The renderer converts them for display with src/utils/money.js.
 *
 * @module electron/services/reports
 */

const { getDb }  = require('../db/connection.js');
const { AppError } = require('../utils/errors.js');

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Resolve the date range for a period shortcut.
 * @param {'day'|'week'|'month'|'custom'} period
 * @param {string} [dateFrom]
 * @param {string} [dateTo]
 * @returns {{ from: string, to: string }}
 */
function resolveDateRange(period, dateFrom, dateTo) {
  const todayDate = new Date().toISOString().slice(0, 10);

  if (period === 'day') {
    return { from: todayDate, to: todayDate };
  }

  if (period === 'week') {
    const d = new Date();
    const dayOfWeek = d.getDay(); // 0=Sun
    const friday = new Date(d);
    friday.setDate(d.getDate() - dayOfWeek + 5); // end of Arabic week = Friday
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() - 6);
    return {
      from: sunday.toISOString().slice(0, 10),
      to: friday.toISOString().slice(0, 10),
    };
  }

  if (period === 'month') {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to };
  }

  // custom
  if (!dateFrom || !dateTo) throw new AppError('يجب تحديد تاريخ البداية والنهاية');
  if (dateFrom > dateTo)   throw new AppError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
  return { from: dateFrom, to: dateTo };
}

// ── Section queries ───────────────────────────────────────────────

/**
 * Get the business_day rows whose date falls within [from, to].
 * @param {string} from
 * @param {string} to
 * @returns {{ id: number, date: string }[]}
 */
function getDays(from, to) {
  return getDb()
    .prepare('SELECT id, date FROM business_days WHERE date >= ? AND date <= ? ORDER BY date ASC')
    .all(from, to);
}

/**
 * Sales summary: receipt count, total sales, delivery fees, breakdown by order type.
 */
function querySales(dayIds) {
  if (dayIds.length === 0) {
    return {
      receiptCount:       0,
      totalSales:         0,
      totalDeliveryFees:  0,
      byType: { dine_in: 0, takeaway: 0, delivery: 0 },
    };
  }

  const ph = dayIds.map(() => '?').join(',');

  const rows = getDb()
    .prepare(
      `SELECT order_type,
              COUNT(*)                     AS cnt,
              COALESCE(SUM(total),0)       AS total,
              COALESCE(SUM(delivery_fee),0) AS fees
       FROM orders
       WHERE day_id IN (${ph}) AND status != 'cancelled'
       GROUP BY order_type`
    )
    .all(...dayIds);

  const byType = { dine_in: 0, takeaway: 0, delivery: 0 };
  let receiptCount      = 0;
  let totalSales        = 0;
  let totalDeliveryFees = 0;

  for (const row of rows) {
    byType[row.order_type] = (byType[row.order_type] ?? 0) + row.total;
    receiptCount      += row.cnt;
    totalSales        += row.total;
    totalDeliveryFees += row.fees;
  }

  return { receiptCount, totalSales, totalDeliveryFees, byType };
}

/**
 * Sales grouped by day, for the by-day breakdown table.
 * @param {{ id: number, date: string }[]} days
 */
function queryByDay(days) {
  if (days.length === 0) return [];
  const ph = days.map(() => '?').join(',');
  const ids = days.map(d => d.id);

  const rows = getDb()
    .prepare(
      `SELECT day_id,
              COUNT(*)                      AS orders,
              COALESCE(SUM(total),0)        AS sales,
              COALESCE(SUM(delivery_fee),0) AS fees
       FROM orders
       WHERE day_id IN (${ph}) AND status != 'cancelled'
       GROUP BY day_id`
    )
    .all(...ids);

  // Expense totals per day
  const expRows = getDb()
    .prepare(
      `SELECT day_id, COALESCE(SUM(amount),0) AS expenses
       FROM expenses WHERE day_id IN (${ph})
       GROUP BY day_id`
    )
    .all(...ids);

  // Worker pay per day (join through date) — guard against missing migration
  const dayDates = days.map(d => d.date);
  let workerPayByDate = {};
  const wpTableExists = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='worker_payments'")
    .get();
  if (wpTableExists && dayDates.length > 0) {
    const ph2 = dayDates.map(() => '?').join(',');
    const wpRows = getDb()
      .prepare(
        `SELECT date, COALESCE(SUM(amount),0) AS wpay
         FROM worker_payments
         WHERE date IN (${ph2})
         GROUP BY date`
      )
      .all(...dayDates);
    for (const r of wpRows) workerPayByDate[r.date] = r.wpay;
  }

  const salesMap = Object.fromEntries(rows.map(r => [r.day_id, r]));
  const expMap   = Object.fromEntries(expRows.map(r => [r.day_id, r.expenses]));

  return days.map(d => {
    const s   = salesMap[d.id] ?? { orders: 0, sales: 0, fees: 0 };
    const exp = (expMap[d.id] ?? 0) + (workerPayByDate[d.date] ?? 0);
    return {
      date:     d.date,
      orders:   s.orders,
      sales:    s.sales,
      fees:     s.fees,
      expenses: exp,
      net:      s.sales - exp,
    };
  });
}

/**
 * Shop purchases summary: total purchased, total paid, total remaining (debt).
 * Grouped by shop.
 */
function queryPurchases(from, to) {
  const rows = getDb()
    .prepare(
      `SELECT s.id as shop_id, s.name as shop_name,
              COALESCE(SUM(p.total),0)     as total,
              COALESCE(SUM(p.paid),0)      as paid,
              COALESCE(SUM(p.remaining),0) as remaining
       FROM shops s
       LEFT JOIN purchases p ON p.shop_id = s.id AND p.date >= ? AND p.date <= ?
       GROUP BY s.id, s.name
       ORDER BY s.name ASC`
    )
    .all(from, to);

  // Also get individual purchase rows (with items) for detailed view
  const purchaseRows = getDb()
    .prepare(
      `SELECT p.id, p.shop_id, s.name as shop_name,
              p.date, p.total, p.paid, p.remaining
       FROM purchases p
       JOIN shops s ON s.id = p.shop_id
       WHERE p.date >= ? AND p.date <= ?
       ORDER BY p.date DESC, s.name ASC`
    )
    .all(from, to);

  for (const pr of purchaseRows) {
    pr.items = getDb()
      .prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id')
      .all(pr.id);
  }

  const totalPurchases = rows.reduce((s, r) => s + r.total, 0);
  const totalPaid      = rows.reduce((s, r) => s + r.paid, 0);

  return { rows, purchaseRows, totalPurchases, totalPaid };
}

/**
 * Remaining debts across ALL time (not filtered by date — debt is cumulative).
 */
function queryRemainingDebts() {
  return getDb()
    .prepare(
      `SELECT s.id as shop_id, s.name as shop_name,
              COALESCE(SUM(p.remaining),0) as remaining
       FROM shops s
       LEFT JOIN purchases p ON p.shop_id = s.id
       GROUP BY s.id, s.name
       ORDER BY s.name ASC`
    )
    .all();
}

/**
 * Other expenses summary (by category, for date range).
 * Also returns individual expense rows.
 */
function queryExpenses(from, to) {
  const rows = getDb()
    .prepare(
      `SELECT category, COALESCE(SUM(amount),0) as total
       FROM expenses WHERE date >= ? AND date <= ?
       GROUP BY category
       ORDER BY total DESC`
    )
    .all(from, to);

  const expenseRows = getDb()
    .prepare(
      `SELECT id, name, amount, date, category
       FROM expenses WHERE date >= ? AND date <= ?
       ORDER BY date DESC, id DESC`
    )
    .all(from, to);

  const totalExpenses = rows.reduce((s, r) => s + r.total, 0);
  return { rows, expenseRows, totalExpenses };
}

/**
 * Workers' pay for the date range.
 * Returns per-worker summary + total.
 */
function queryWorkersPay(from, to) {
  // Check if workers table exists (migration 003 may not have run in tests)
  const tableExists = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workers'")
    .get();
  if (!tableExists) return { rows: [], total: 0 };

  const rows = getDb()
    .prepare(
      `SELECT w.id as worker_id, w.name as worker_name,
              COUNT(wp.id)              AS days_paid,
              COALESCE(SUM(wp.amount),0) AS total_paid
       FROM workers w
       LEFT JOIN worker_payments wp ON wp.worker_id = w.id
         AND wp.date >= ? AND wp.date <= ?
       GROUP BY w.id, w.name
       ORDER BY w.name ASC`
    )
    .all(from, to);

  const total = rows.reduce((s, r) => s + r.total_paid, 0);
  return { rows, total };
}

/**
 * Best/worst selling products (with size).
 * @param {number[]} dayIds
 * @returns {{ best: object[], worst: object[] }}
 */
function queryProductRanking(dayIds) {
  if (dayIds.length === 0) return { best: [], worst: [] };

  const ph = dayIds.map(() => '?').join(',');

  const rows = getDb()
    .prepare(
      `SELECT oi.product_name,
              oi.options,
              SUM(oi.qty)                    AS total_qty,
              COALESCE(SUM(oi.line_total),0) AS total_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.day_id IN (${ph}) AND o.status != 'cancelled'
       GROUP BY oi.product_name, oi.options
       ORDER BY total_qty DESC`
    )
    .all(...dayIds)
    .map(r => {
      // Extract size name from options JSON if present
      let sizeName = '';
      try {
        const opts = JSON.parse(r.options ?? '[]');
        const sizeOpt = opts.find(o => o.type === 'size');
        if (sizeOpt) sizeName = sizeOpt.label ?? '';
      } catch { /* ignore */ }
      return { ...r, size_name: sizeName };
    });

  const best  = rows.slice(0, 20);
  const worst = [...rows].reverse().slice(0, 20);

  return { best, worst };
}

/**
 * Orders list for the period (including items, audit log, delivery info).
 * Excludes cancelled orders (they are returned separately).
 */
function queryOrdersList(dayIds) {
  if (dayIds.length === 0) return { orders: [], cancelled: [] };

  const ph = dayIds.map(() => '?').join(',');

  const allOrders = getDb()
    .prepare(
      `SELECT o.*,
              bd.date AS day_date
       FROM orders o
       JOIN business_days bd ON bd.id = o.day_id
       WHERE o.day_id IN (${ph})
       ORDER BY o.created_at DESC`
    )
    .all(...dayIds);

  for (const o of allOrders) {
    o.items = getDb()
      .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
      .all(o.id)
      .map(r => ({ ...r, options: JSON.parse(r.options ?? '[]') }));

    o.auditLog = getDb()
      .prepare('SELECT * FROM audit_log WHERE order_id = ? ORDER BY created_at ASC')
      .all(o.id);
  }

  const orders    = allOrders.filter(o => o.status !== 'cancelled');
  const cancelled = allOrders.filter(o => o.status === 'cancelled');

  return { orders, cancelled };
}

// ── Main entry point ──────────────────────────────────────────────

/**
 * Build a full report for the given period.
 * @param {{ period: 'day'|'week'|'month'|'custom', dateFrom?: string, dateTo?: string }} opts
 * @returns {object}
 */
function getReport({ period = 'day', dateFrom, dateTo } = {}) {
  const { from, to } = resolveDateRange(period, dateFrom, dateTo);

  const days   = getDays(from, to);
  const dayIds = days.map(d => d.id);

  const { receiptCount, totalSales, totalDeliveryFees, byType } = querySales(dayIds);
  const byDay  = queryByDay(days);
  const { rows: purchaseRows, purchaseRows: purchaseDetail, totalPurchases, totalPaid } = queryPurchases(from, to);
  const remainingDebts = queryRemainingDebts();
  const { rows: expenseRows, expenseRows: expenseDetail, totalExpenses } = queryExpenses(from, to);
  const workersPay     = queryWorkersPay(from, to);
  const { best, worst } = queryProductRanking(dayIds);
  const { orders, cancelled } = queryOrdersList(dayIds);

  const totalExpensesAll = totalExpenses + workersPay.total;
  const net = totalSales - totalExpensesAll - totalPurchases;

  return {
    period: { period, from, to },
    sales: { receiptCount, totalSales, totalDeliveryFees, byType },
    byDay,
    purchases: { rows: purchaseRows, purchaseDetail, totalPurchases, totalPaid },
    remainingDebts,
    expenses: { rows: expenseRows, expenseDetail, totalExpenses },
    workersPay,
    products: { best, worst },
    orders,
    cancelled,
    net,
  };
}

module.exports = { getReport, resolveDateRange };
