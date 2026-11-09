'use strict';

/**
 * Day-close service.
 * Computes receipt count, total sales, total expenses, net profit,
 * writes the summary into business_days, and marks the day closed.
 *
 * Rules:
 * – Cancelled orders do NOT count toward totals.
 * – "Close day" can be triggered by either role (owner or cashier).
 * – After closing, the next order will auto-create a fresh day.
 * @module electron/services/dayClose
 */

const { AppError } = require('../utils/errors.js');
const { nowIso, today } = require('../utils/dates.js');
const dayRepo   = require('../repositories/businessDays.js');
const orderRepo = require('../repositories/orders.js');
const backupSvc = require('./backup.js');

// ── Expenses total ────────────────────────────────────────────────

/**
 * Sum expenses for a given business day id.
 * @param {number} dayId
 * @returns {number} minor units
 */
function sumExpenses(dayId) {
  const { getDb } = require('../db/connection.js');
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE day_id = ?')
    .get(dayId);
  return row?.total ?? 0;
}

// ── Close day ─────────────────────────────────────────────────────

/**
 * Close the current open business day.
 * @returns {{
 *   day: object,
 *   receiptCount: number,
 *   totalSales: number,
 *   totalExpenses: number,
 *   net: number,
 *   byType: { dine_in: number, takeaway: number, delivery: number }
 * }}
 */
function closeDay() {
  const day = dayRepo.getOpenDay();
  if (!day) throw new AppError('لا يوجد يوم مفتوح لإغلاقه');

  const orders = orderRepo.listByDay(day.id);

  // Only count non-cancelled orders
  const active = orders.filter(o => o.status !== 'cancelled');
  const receiptCount = active.length;
  const totalSales   = active.reduce((s, o) => s + o.total, 0);
  const totalExpenses = sumExpenses(day.id);
  const net          = totalSales - totalExpenses;

  // Breakdown by type
  const byType = { dine_in: 0, takeaway: 0, delivery: 0 };
  for (const o of active) {
    byType[o.order_type] = (byType[o.order_type] ?? 0) + o.total;
  }

  dayRepo.close(day.id, {
    closedAt: nowIso(),
    receiptCount,
    totalSales,
    totalExpenses,
    net,
  });

  // Auto-backup after every close-day (best-effort; never blocks or throws)
  let autoBackupResult = null;
  try {
    autoBackupResult = backupSvc.autoBackup();
  } catch {
    // Backup failure must NOT prevent the day from being marked closed.
  }

  return {
    day:          dayRepo.getById(day.id),
    receiptCount,
    totalSales,
    totalExpenses,
    net,
    byType,
    autoBackup: autoBackupResult,
  };
}

// ── Get day report ────────────────────────────────────────────────

/**
 * Return the summary report for a closed day (by id).
 * Also includes a fresh byType breakdown computed from orders.
 * @param {number} dayId
 * @returns {object}
 */
function getDayReport(dayId) {
  const day = dayRepo.getById(dayId);
  if (!day) throw new AppError('اليوم غير موجود');

  const orders = orderRepo.listByDay(dayId);
  const active = orders.filter(o => o.status !== 'cancelled');

  const byType = { dine_in: 0, takeaway: 0, delivery: 0 };
  for (const o of active) {
    byType[o.order_type] = (byType[o.order_type] ?? 0) + o.total;
  }

  return {
    day,
    receiptCount:   day.receipt_count,
    totalSales:     day.total_sales,
    totalExpenses:  day.total_expenses,
    net:            day.net,
    byType,
    orders: active,
  };
}

// ── Reminder logic ────────────────────────────────────────────────

/**
 * Check whether the owner should see a morning reminder.
 * Returns { showReminder: true } if yesterday's day was not closed.
 * Returns { unclosedDays: number } with the count of all unclosed days
 * (excluding today's open day) so the owner can see a badge.
 * @returns {{ showReminder: boolean, unclosedCount: number, lastOpenDay: object|null }}
 */
function checkReminders() {
  const allDays   = dayRepo.listAll();          // newest first
  const todayStr  = today();
  const openDays  = allDays.filter(d => d.closed_at === null);

  // Today's open day is expected – exclude it from the "unclosed" count
  const staleOpen = openDays.filter(d => d.date !== todayStr);
  const unclosedCount = staleOpen.length;

  // Morning reminder: if there's an open day from before today
  const showReminder = staleOpen.length > 0;
  const lastOpenDay  = staleOpen[0] ?? null;  // oldest unclosed non-today day

  return { showReminder, unclosedCount, lastOpenDay };
}

module.exports = { closeDay, getDayReport, checkReminders };
