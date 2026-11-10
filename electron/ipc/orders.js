'use strict';

/**
 * IPC handlers: orders, customers, business-day queries.
 */

const { handle } = require('./_handle.js');
const { AppError } = require('../utils/errors.js');
const orderSvc = require('../services/orders.js');
const custRepo = require('../repositories/customers.js');
const dayRepo = require('../repositories/businessDays.js');

// ── Input helpers ──────────────────────────────────────────────────

function requireId(val) {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) throw new AppError('معرّف غير صحيح');
  return n;
}

// Renderer sends prices as minor-unit integers already (it uses format() for display).
// We still validate they are integers.
function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new AppError('السلة فارغة');
  return items.map(item => ({
    ...item,
    unit_price: Math.floor(Number(item.unit_price)),
    qty: Math.floor(Number(item.qty ?? 1)),
    options: (item.options ?? []).map(o => ({
      ...o,
      price: Math.floor(Number(o.price ?? 0)),
    })),
  }));
}

// ── Day ────────────────────────────────────────────────────────────

handle('day:getCurrent', () => {
  return orderSvc.getOrCreateOpenDay();
});

// day:list kept here for backward compat; day:close is handled in ipc/dayClose.js
handle('day:list', () => {
  return dayRepo.listAll();
});

// ── Orders ─────────────────────────────────────────────────────────

handle('orders:create', (payload) => {
  const { order_type, items, delivery_fee, customer,
    delivery_name, delivery_phone, delivery_addr } = payload;

  const normalizedItems = validateItems(items);
  // delivery_fee arrives as integer minor units from the renderer (renderer
  // already called toMinor). Clamp to a non-negative integer; never re-convert.
  const fee = Number.isInteger(Number(delivery_fee)) ? Math.max(0, Math.floor(Number(delivery_fee))) : 0;

  return orderSvc.createOrder({
    order_type,
    items: normalizedItems,
    delivery_fee: fee,
    customer,
    delivery_name,
    delivery_phone,
    delivery_addr,
  });
});

handle('orders:list', ({ dayId } = {}) => {
  let id = dayId;
  if (!id) {
    const day = orderSvc.getOrCreateOpenDay();
    id = day.id;
  }
  return orderSvc.listOrdersForDay(requireId(id));
});

handle('orders:get', ({ id }) => {
  return orderSvc.getOrder(requireId(id));
});

handle('orders:modify', ({ id, items, delivery_fee }) => {
  const oid = requireId(id);
  const normalizedItems = validateItems(items);
  const fee = Number.isInteger(Number(delivery_fee)) ? Math.floor(Number(delivery_fee)) : undefined;
  return orderSvc.modifyOrder(oid, {
    items: normalizedItems,
    ...(fee !== undefined ? { delivery_fee: fee } : {}),
  });
});

handle('orders:cancel', ({ id }) => {
  return orderSvc.cancelOrder(requireId(id));
});

handle('orders:auditLog', ({ orderId }) => {
  const auditSvc = require('../services/audit.js');
  return auditSvc.listForOrder(requireId(orderId));
});

// ── Customers ──────────────────────────────────────────────────────

handle('customers:lookup', ({ phone }) => {
  if (!phone?.trim()) return null;
  return custRepo.lookup(phone.trim());
});

handle('customers:create', ({ name, phone, address }) => {
  if (!phone?.trim()) throw new AppError('رقم الهاتف مطلوب');
  if (!name?.trim()) throw new AppError('اسم العميل مطلوب');
  return custRepo.upsert({ name: name.trim(), phone: phone.trim(), address: address?.trim() ?? '' });
});
