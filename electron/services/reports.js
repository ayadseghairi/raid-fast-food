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

const { getDb } = require('../db/connection.js');
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
  if (dateFrom > dateTo) throw new AppError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
  return { from: dateFrom, to: dateTo };
}

// ── Section queries ───────────────────────────────────────────────

/**
 * Get the business_day ids whose date falls within [from, to].
 * @param {string} from
 * @param {string} to
 * @returns {number[]}
 */
function getDayIds(from, to) {
  const rows = getDb()
    .prepare('SELECT id FROM business_days WHERE date >= ? AND date <= ?')
    .all(from, to);
  return rows.map(r => r.id);
}

/**
 * Sales summary: receipt count, total sales, breakdown by order type.
 */
function querySales(dayIds) {
  if (dayIds.length === 0) {
    return {
      receiptCount: 0,
      totalSales: 0,
      byType: { dine_in: 0, takeaway: 0, delivery: 0 },
    };
  }

  const placeholders = dayIds.map(() => '?').join(',');

  const rows = getDb()
    .prepare(
      `SELECT order_type, COUNT(*) as cnt, COALESCE(SUM(total),0) as total
       FROM orders
       WHERE day_id IN (${placeholders}) AND status != 'cancelled'
       GROUP BY order_type`
    )
    .all(...dayIds);

  const byType = { dine_in: 0, takeaway: 0, delivery: 0 };
  let receiptCount = 0;
  let totalSales = 0;

  for (const row of rows) {
    byType[row.order_type] = (byType[row.order_type] ?? 0) + row.total;
    receiptCount += row.cnt;
    totalSales   += row.total;
  }

  return { receiptCount, totalSales, byType };
}

/**
 * Shop purchases summary: total purchased, total paid, total remaining (debt).
 * Grouped by shop.
 */
function queryPurchases(from, to) {
  const rows = getDb()
    .prepare(
      `SELECT s.id as shop_id, s.name as shop_name,
              COALESCE(SUM(p.total),0) as total,
              COALESCE(SUM(p.paid),0) as paid,
              COALESCE(SUM(p.remaining),0) as remaining
       FROM shops s
       LEFT JOIN purchases p ON p.shop_id = s.id AND p.date >= ? AND p.date <= ?
       GROUP BY s.id, s.name
       ORDER BY s.name ASC`
    )
    .all(from, to);

  const totalPurchases = rows.reduce((s, r) => s + r.total, 0);
  const totalPaid      = rows.reduce((s, r) => s + r.paid, 0);

  return { rows, totalPurchases, totalPaid };
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

  const totalExpenses = rows.reduce((s, r) => s + r.total, 0);
  return { rows, totalExpenses };
}

/**
 * Best/worst selling products.
 * @param {number[]} dayIds
 * @returns {{ best: object[], worst: object[] }}
 */
function queryProductRanking(dayIds) {
  if (dayIds.length === 0) return { best: [], worst: [] };

  const placeholders = dayIds.map(() => '?').join(',');

  const rows = getDb()
    .prepare(
      `SELECT oi.product_name,
              SUM(oi.qty) as total_qty,
              COALESCE(SUM(oi.line_total),0) as total_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.day_id IN (${placeholders}) AND o.status != 'cancelled'
       GROUP BY oi.product_name
       ORDER BY total_qty DESC`
    )
    .all(...dayIds);

  const best  = rows.slice(0, 10);
  const worst = [...rows].reverse().slice(0, 10);

  return { best, worst };
}

// ── Main entry point ──────────────────────────────────────────────

/**
 * Build a full report for the given period.
 * @param {{ period: 'day'|'week'|'month'|'custom', dateFrom?: string, dateTo?: string }} opts
 * @returns {object}
 */
function getReport({ period = 'day', dateFrom, dateTo } = {}) {
  const { from, to } = resolveDateRange(period, dateFrom, dateTo);

  const dayIds = getDayIds(from, to);

  const { receiptCount, totalSales, byType } = querySales(dayIds);
  const { rows: purchaseRows, totalPurchases, totalPaid } = queryPurchases(from, to);
  const remainingDebts = queryRemainingDebts();
  const { rows: expenseRows, totalExpenses } = queryExpenses(from, to);
  const { best, worst } = queryProductRanking(dayIds);

  const net = totalSales - totalExpenses - totalPurchases;

  return {
    period: { period, from, to },
    sales: { receiptCount, totalSales, byType },
    purchases: { rows: purchaseRows, totalPurchases, totalPaid },
    remainingDebts,
    expenses: { rows: expenseRows, totalExpenses },
    products: { best, worst },
    net,
  };
}

module.exports = { getReport, resolveDateRange };
