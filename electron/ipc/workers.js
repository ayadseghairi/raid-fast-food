'use strict';

/**
 * IPC handlers: workers and daily pay (رواتب العمال).
 * @module electron/ipc/workers
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const workersSvc = require('../services/workers.js');

function requireId(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw new AppError('معرّف غير صحيح');
  return n;
}

// ── Workers management ─────────────────────────────────────────────

handle('workers:list', ({ activeOnly } = {}) => {
  return workersSvc.listWorkers(!!activeOnly);
});

handle('workers:create', ({ name }) => {
  if (!name?.trim()) throw new AppError('اسم العامل مطلوب');
  return workersSvc.createWorker(name);
});

handle('workers:update', ({ id, name }) => {
  return workersSvc.updateWorker(requireId(id), name);
});

handle('workers:setActive', ({ id, active }) => {
  workersSvc.setWorkerActive(requireId(id), !!active);
  return { done: true };
});

// ── Daily payments ─────────────────────────────────────────────────

handle('workers:getDailyEntry', ({ date }) => {
  return workersSvc.getDailyEntry(date);
});

handle('workers:saveDailyPayments', ({ date, payments }) => {
  workersSvc.saveDailyPayments(date, payments);
  return { done: true };
});

// ── Reports / summaries ────────────────────────────────────────────

handle('workers:summaryForRange', ({ from, to }) => {
  return workersSvc.workerSummaryForRange(from, to);
});

handle('workers:detailForRange', ({ workerId, from, to }) => {
  return workersSvc.workerDetailForRange(requireId(workerId), from, to);
});

handle('workers:totalPayForRange', ({ from, to }) => {
  return { total: workersSvc.totalPayForRange(from, to) };
});
