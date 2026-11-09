'use strict';

/**
 * Orders service – business rules for POS order creation, modification and cancellation.
 * Handles business-day management and receipt numbering.
 * @module electron/services/orders
 */

const { AppError } = require('../utils/errors.js');
const { nowIso, today } = require('../utils/dates.js');
const dayRepo = require('../repositories/businessDays.js');
const orderRepo = require('../repositories/orders.js');
const custRepo = require('../repositories/customers.js');
const auditSvc = require('./audit.js');

// ── Business day helpers ──────────────────────────────────────────

/**
 * Get the current open business day, creating one for today if none exists.
 * @returns {object} business_days row
 */
function getOrCreateOpenDay() {
  const open = dayRepo.getOpenDay();
  if (open) return open;
  return dayRepo.create(today());
}

// ── Order creation ────────────────────────────────────────────────

/**
 * Validate and normalize a cart item sent from the renderer.
 * @param {object} item
 * @returns {object} normalized item with minor-unit prices
 */
function normalizeItem(item) {
  if (!item.product_id) throw new AppError('معرّف المنتج مطلوب');
  if (!item.product_name?.trim()) throw new AppError('اسم المنتج مطلوب');
  if (!Number.isInteger(item.unit_price) || item.unit_price < 0)
    throw new AppError('سعر الوحدة غير صحيح');
  if (!Number.isInteger(item.qty) || item.qty < 1)
    throw new AppError('الكمية يجب أن تكون رقماً موجباً');

  const options = Array.isArray(item.options) ? item.options : [];
  const optionsTotal = options.reduce((s, o) => s + (o.price ?? 0), 0);
  const lineTotal = (item.unit_price + optionsTotal) * item.qty;

  return {
    product_id: item.product_id,
    product_name: item.product_name.trim(),
    unit_price: item.unit_price,
    qty: item.qty,
    options,
    note: item.note?.trim() ?? null,
    line_total: lineTotal,
  };
}

/**
 * Create a new order.
 *
 * @param {{
 *   order_type: 'dine_in'|'takeaway'|'delivery',
 *   items: object[],
 *   delivery_fee?: number,
 *   customer?: { name, phone, address },
 *   delivery_name?: string,
 *   delivery_phone?: string,
 *   delivery_addr?: string,
 * }} payload
 * @returns {{ order: object, items: object[] }}
 */
function createOrder(payload) {
  const { order_type, items, delivery_fee, customer,
    delivery_name, delivery_phone, delivery_addr } = payload;

  if (!['dine_in', 'takeaway', 'delivery'].includes(order_type))
    throw new AppError('نوع الطلب غير صحيح');
  if (!Array.isArray(items) || items.length === 0)
    throw new AppError('السلة فارغة');

  const normalized = items.map(normalizeItem);
  const itemsTotal = normalized.reduce((s, i) => s + i.line_total, 0);
  const fee = Number.isInteger(delivery_fee) ? delivery_fee : 0;
  const total = itemsTotal + fee;

  // Delivery validation
  if (order_type === 'delivery' && !delivery_phone?.trim() && !customer?.phone?.trim())
    throw new AppError('رقم هاتف العميل مطلوب للتوصيل');

  const day = getOrCreateOpenDay();
  const number = orderRepo.nextNumber(day.id);

  // Upsert customer for delivery orders
  let customerId = null;
  if (order_type === 'delivery' && (customer?.phone || delivery_phone)) {
    const phone = (customer?.phone || delivery_phone).trim();
    const name = (customer?.name || delivery_name || 'عميل').trim();
    const address = (customer?.address || delivery_addr || '').trim();
    const saved = custRepo.upsert({ name, phone, address });
    customerId = saved.id;
  }

  const order = orderRepo.create(
    {
      day_id: day.id,
      number,
      order_type,
      customer_id: customerId,
      delivery_name: delivery_name?.trim() ?? null,
      delivery_phone: delivery_phone?.trim() ?? null,
      delivery_addr: delivery_addr?.trim() ?? null,
      delivery_fee: fee,
      total,
      created_at: nowIso(),
    },
    normalized,
  );

  return { order, items: orderRepo.getItems(order.id) };
}

/**
 * List orders for a given business day with their items.
 * @param {number} dayId
 */
function listOrdersForDay(dayId) {
  const orders = orderRepo.listByDay(dayId);
  return orders.map(o => ({
    ...o,
    items: orderRepo.getItems(o.id),
  }));
}

/**
 * Get a single order with items.
 * @param {number} id
 */
function getOrder(id) {
  const order = orderRepo.getById(id);
  if (!order) throw new AppError('الطلب غير موجود');
  return { ...order, items: orderRepo.getItems(id) };
}

// ── Modify order ──────────────────────────────────────────────────

/**
 * Modify an existing order (re-set its items, update total/status).
 * Logs the change to the audit log.
 *
 * @param {number} id
 * @param {{
 *   items: object[],
 *   delivery_fee?: number,
 * }} payload
 * @returns {{ order: object, items: object[] }}
 */
function modifyOrder(id, payload) {
  const existing = orderRepo.getById(id);
  if (!existing) throw new AppError('الطلب غير موجود');
  if (existing.status === 'cancelled') throw new AppError('لا يمكن تعديل طلب ملغي');

  const { items, delivery_fee } = payload;
  if (!Array.isArray(items) || items.length === 0) throw new AppError('السلة فارغة');
  const normalized = items.map(normalizeItem);
  const itemsTotal = normalized.reduce((s, i) => s + i.line_total, 0);
  const fee = Number.isInteger(delivery_fee) ? delivery_fee : existing.delivery_fee;
  const newTotal = itemsTotal + fee;

  // Snapshot the state BEFORE the change for the audit trail
  const beforeItems = orderRepo.getItems(id);
  auditSvc.log('modify', id, {
    before: { status: existing.status, total: existing.total, items: beforeItems },
  });

  const db = require('../db/connection.js').getDb();
  db.transaction(() => {
    db.prepare('UPDATE orders SET status = ?, delivery_fee = ?, total = ? WHERE id = ?')
      .run('modified', fee, newTotal, id);
    orderRepo.updateItems(id, normalized);
  })();

  const updated = orderRepo.getById(id);
  const updatedItems = orderRepo.getItems(id);
  return { order: updated, items: updatedItems };
}

// ── Cancel order ──────────────────────────────────────────────────

/**
 * Cancel an order.
 * @param {number} id
 * @returns {object} updated order
 */
function cancelOrder(id) {
  const existing = orderRepo.getById(id);
  if (!existing) throw new AppError('الطلب غير موجود');
  if (existing.status === 'cancelled') throw new AppError('الطلب ملغي مسبقاً');

  const beforeItems = orderRepo.getItems(id);
  auditSvc.log('cancel', id, {
    before: { status: existing.status, total: existing.total, items: beforeItems },
  });

  orderRepo.setStatus(id, 'cancelled');
  const updated = orderRepo.getById(id);
  const updatedItems = orderRepo.getItems(id);
  return { order: updated, items: updatedItems };
}

module.exports = {
  getOrCreateOpenDay,
  createOrder,
  listOrdersForDay,
  getOrder,
  modifyOrder,
  cancelOrder,
};
