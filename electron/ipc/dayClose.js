'use strict';

/**
 * IPC handlers: day-close, day-report, reminders.
 * @module electron/ipc/dayClose
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const dayCloseSvc = require('../services/dayClose.js');
const dayRepo     = require('../repositories/businessDays.js');

function requireId(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw new AppError('معرّف غير صحيح');
  return n;
}

handle('day:close', () => {
  return dayCloseSvc.closeDay();
});

handle('day:report', ({ dayId }) => {
  return dayCloseSvc.getDayReport(requireId(dayId));
});

handle('day:checkReminders', () => {
  return dayCloseSvc.checkReminders();
});

handle('day:listClosed', () => {
  return dayRepo.listAll().filter(d => d.closed_at !== null);
});
