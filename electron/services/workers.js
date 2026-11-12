'use strict';

/**
 * Workers service – business rules for workers and daily pay.
 * @module electron/services/workers
 */

const { AppError } = require('../utils/errors.js');
const workersRepo = require('../repositories/workers.js');

// ── Workers management ────────────────────────────────────────────

function listWorkers(activeOnly = false) {
  return workersRepo.listWorkers(activeOnly);
}

function createWorker(name) {
  if (!name?.trim()) throw new AppError('اسم العامل مطلوب');
  return workersRepo.createWorker(name.trim());
}

function updateWorker(id, name) {
  if (!name?.trim()) throw new AppError('اسم العامل مطلوب');
  const worker = workersRepo.getWorkerById(id);
  if (!worker) throw new AppError('العامل غير موجود');
  return workersRepo.updateWorker(id, name.trim());
}

/**
 * Deactivate a worker. Never delete (keeps payment history).
 * Reactivate is also allowed.
 */
function setWorkerActive(id, active) {
  const worker = workersRepo.getWorkerById(id);
  if (!worker) throw new AppError('العامل غير موجود');
  workersRepo.setWorkerActive(id, active);
}

// ── Daily payments ────────────────────────────────────────────────

/**
 * Get the daily entry form for a date:
 * all active workers with their saved amount (0 if not yet entered).
 */
function getDailyEntry(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new AppError('تنسيق التاريخ غير صحيح');
  return workersRepo.getPaymentsForDate(date);
}

/**
 * Save daily payments for all workers.
 * @param {string} date
 * @param {{ worker_id: number, amount: number }[]} payments – amounts in minor units
 */
function saveDailyPayments(date, payments) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new AppError('تنسيق التاريخ غير صحيح');
  if (!Array.isArray(payments)) throw new AppError('بيانات المدفوعات غير صحيحة');

  // Validate amounts
  for (const p of payments) {
    if (!Number.isInteger(p.amount) || p.amount < 0)
      throw new AppError('المبلغ يجب أن يكون صحيحاً غير سالب');
  }

  workersRepo.savePaymentsForDate(date, payments);
}

/**
 * Get total worker pay for a date range (for reports and close-day).
 */
function totalPayForRange(from, to) {
  return workersRepo.totalPayForRange(from, to);
}

/**
 * Per-worker summary for a date range.
 */
function workerSummaryForRange(from, to) {
  return workersRepo.workerSummaryForRange(from, to);
}

/**
 * Per-worker per-day detail.
 */
function workerDetailForRange(workerId, from, to) {
  const worker = workersRepo.getWorkerById(workerId);
  if (!worker) throw new AppError('العامل غير موجود');
  return {
    worker,
    payments: workersRepo.workerDetailForRange(workerId, from, to),
  };
}

module.exports = {
  listWorkers, createWorker, updateWorker, setWorkerActive,
  getDailyEntry, saveDailyPayments,
  totalPayForRange, workerSummaryForRange, workerDetailForRange,
};
