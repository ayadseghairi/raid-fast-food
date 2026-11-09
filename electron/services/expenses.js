'use strict';

/**
 * Expenses service – business rules for other expenses.
 * @module electron/services/expenses
 */

const { AppError } = require('../utils/errors.js');
const expRepo = require('../repositories/expenses.js');
const dayRepo = require('../repositories/businessDays.js');
const { today } = require('../utils/dates.js');

const VALID_CATEGORIES = ['electricity', 'rent', 'salary', 'maintenance', 'other'];

function list(filters) {
  return expRepo.list(filters ?? {});
}

function create({ name, amount, date, category, day_id }) {
  if (!name?.trim())  throw new AppError('وصف المصروف مطلوب');
  if (!amount)        throw new AppError('المبلغ مطلوب');
  if (!VALID_CATEGORIES.includes(category ?? 'other'))
    throw new AppError('فئة المصروف غير صحيحة');

  const amountMinor = Math.round(Number(amount) * 100);
  if (amountMinor <= 0) throw new AppError('المبلغ يجب أن يكون أكبر من صفر');

  // Auto-link to the current open day if none supplied
  let resolvedDayId = day_id ?? null;
  if (!resolvedDayId) {
    const openDay = dayRepo.getOpenDay();
    if (openDay) resolvedDayId = openDay.id;
  }

  return expRepo.create({
    day_id:   resolvedDayId,
    name:     name.trim(),
    amount:   amountMinor,
    date:     date ?? today(),
    category: category ?? 'other',
  });
}

function update(id, data) {
  if (!expRepo.getById(id)) throw new AppError('المصروف غير موجود');
  const patch = {};
  if (data.name     !== undefined) patch.name     = data.name.trim();
  if (data.amount   !== undefined) patch.amount   = Math.round(Number(data.amount) * 100);
  if (data.date     !== undefined) patch.date     = data.date;
  if (data.category !== undefined) {
    if (!VALID_CATEGORIES.includes(data.category)) throw new AppError('فئة المصروف غير صحيحة');
    patch.category = data.category;
  }
  return expRepo.update(id, patch);
}

function remove(id) {
  if (!expRepo.getById(id)) throw new AppError('المصروف غير موجود');
  expRepo.remove(id);
}

module.exports = { list, create, update, remove };
