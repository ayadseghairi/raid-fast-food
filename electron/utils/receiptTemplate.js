'use strict';

/**
 * Receipt HTML templates – customer copy and kitchen copy.
 * Returns a self-contained HTML string (inline CSS, no external resources).
 * Designed for 80mm / 58mm thermal printers via webContents.print().
 *
 * Amounts are always passed as minor-unit integers and formatted here.
 * @module electron/utils/receiptTemplate
 */

const { fromMinor } = require('./money.js');

/** Format minor-unit integer → e.g. "25.50" */
function fmtMoney(minor) {
  return fromMinor(minor).toFixed(2);
}

/**
 * Format an ISO date/datetime string as DD/MM/YYYY (English digits, Algerian style).
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format time as HH:MM (24h, English digits).
 * @param {Date} d
 * @returns {string}
 */
function fmtTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Build the CSS for the chosen paper width */
function buildCss(widthMm) {
  return `
    /* ── @page: tell Chromium the exact paper size (no margins) ── */
    @page {
      size: ${widthMm}mm auto;   /* width fixed, height = content height */
      margin: 0;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      /* Match the declared paper width so 1mm CSS = 1mm on paper */
      width: ${widthMm}mm;
      font-family: 'Arial', 'Tahoma', sans-serif;
      font-size: 12px;
      direction: rtl;
      color: #000;
      background: #fff;
    }
    .receipt { width:100%; padding:4mm; }
    .center  { text-align:center; }
    .logo    { max-width:${widthMm - 8}mm; max-height:18mm; object-fit:contain; display:block; margin:0 auto 2mm; }
    .brand   { font-size:15px; font-weight:bold; margin-bottom:1mm; }
    .phone   { font-size:11px; color:#333; margin-bottom:2mm; }
    h2       { font-size:22px; font-weight:bold; margin:2mm 0 1mm; }
    .badge   { display:inline-block; border:2px solid #000; padding:1mm 4mm; font-size:13px; font-weight:bold; border-radius:3px; margin-bottom:3mm; }
    .meta    { font-size:10px; color:#555; margin-bottom:3mm; }
    .divider { border:none; border-top:1px dashed #666; margin:2mm 0; }
    .divider-solid { border:none; border-top:1px solid #000; margin:2mm 0; }
    table    { width:100%; border-collapse:collapse; }
    th       { font-size:10px; border-bottom:1px solid #aaa; padding:1mm 0; text-align:right; }
    td       { font-size:11px; padding:1mm 0; vertical-align:top; text-align:right; }
    td.num   { text-align:left; direction:ltr; }
    .opt-line { font-size:9px; color:#444; padding-right:2mm; }
    .note-line { font-size:9px; font-style:italic; color:#555; padding-right:2mm; }
    .fee-row { font-size:11px; }
    .total-section { margin-top:2mm; }
    .total-row { display:flex; justify-content:space-between; padding:1mm 0; font-size:12px; }
    .grand   { font-size:15px; font-weight:bold; border-top:2px solid #000; padding-top:2mm; margin-top:1mm; }
    .thanks  { text-align:center; font-size:12px; margin-top:4mm; padding-top:2mm; border-top:1px dashed #aaa; }
    .stamp   { text-align:center; font-size:10px; color:#888; margin-top:2mm; }
    /* kitchen copy extras */
    .kitchen-title { font-size:20px; font-weight:bold; text-align:center; margin-bottom:2mm; }
    .order-type-badge { font-size:16px; font-weight:bold; text-align:center; padding:2mm; border:3px solid #000; margin:2mm 0; }
    .kitchen-item { font-size:14px; padding:1mm 0; border-bottom:1px dotted #aaa; }
    .kitchen-qty  { font-weight:bold; margin-left:2mm; }
    /* page-break between customer and kitchen in combined PDF */
    .page-break { page-break-before: always; }
  `;
}

const ORDER_TYPE_LABEL = {
  dine_in:  'محلي',
  takeaway: 'سفري',
  delivery: 'توصيل',
};

/**
 * Build a customer receipt HTML string.
 *
 * @param {{
 *   order:      object,            // orders row
 *   items:      object[],          // order_items rows (options already parsed)
 *   settings:   object,            // settings key/value map
 *   logoDataUrl?: string,          // data: URI for the logo
 *   widthMm?:   number,            // 80 (default) or 58
 *   isModified?: boolean,
 * }} opts
 * @returns {string}
 */
function customerReceipt({ order, items, settings, logoDataUrl, widthMm = 80, isModified = false }) {
  const orderDate = new Date(order.created_at);
  const dateStr = fmtDate(orderDate);
  const timeStr = fmtTime(orderDate);

  const itemsTotal = items.reduce((s, i) => s + i.line_total, 0);
  const fee = order.delivery_fee ?? 0;
  const restaurantName = settings.restaurant_name ?? 'فاست فود رائد';
  const restaurantPhone = settings.restaurant_phone ?? '';
  const thankYou = settings.thank_you_message ?? 'شكراً لزيارتكم';

  const logoHtml = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="${restaurantName}" />`
    : '';

  const itemRows = items.map(item => {
    const optLines = (item.options ?? [])
      .map(o => `<tr><td colspan="3" class="opt-line">+ ${o.label} (+${fmtMoney(o.price)})</td></tr>`)
      .join('');
    const noteLines = item.note
      ? `<tr><td colspan="3" class="note-line">📝 ${item.note}</td></tr>`
      : '';
    return `
      <tr>
        <td>${item.product_name}</td>
        <td class="num">${item.qty}×${fmtMoney(item.unit_price)}</td>
        <td class="num">${fmtMoney(item.line_total)}</td>
      </tr>
      ${optLines}${noteLines}
    `;
  }).join('');

  const feeRow = fee > 0
    ? `<div class="total-row fee-row"><span>رسوم التوصيل</span><span>${fmtMoney(fee)}</span></div>`
    : '';

  const modifiedBadge = isModified
    ? `<div class="badge" style="margin-bottom:3mm;">طلب معدّل</div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>${buildCss(widthMm)}</style>
</head>
<body>
<div class="receipt">
  <div class="center">
    ${logoHtml}
    <div class="brand">${restaurantName}</div>
    ${restaurantPhone ? `<div class="phone">${restaurantPhone}</div>` : ''}
    ${modifiedBadge}
    <h2>#${order.number}</h2>
    <div class="badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
    <div class="meta">${dateStr} – ${timeStr}</div>
  </div>
  <hr class="divider-solid">
  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th>الكمية×السعر</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <hr class="divider">
  <div class="total-section">
    <div class="total-row"><span>المجموع الفرعي</span><span>${fmtMoney(itemsTotal)}</span></div>
    ${feeRow}
    <div class="total-row grand"><span>الإجمالي</span><span>${fmtMoney(order.total)}</span></div>
  </div>
  ${order.order_type === 'delivery' && order.delivery_name
    ? `<hr class="divider"><div class="meta">العميل: ${order.delivery_name} – ${order.delivery_phone ?? ''}</div>`
    : ''}
  <div class="thanks">${thankYou}</div>
</div>
</body>
</html>`;
}

/**
 * Build a kitchen-only receipt HTML string (no prices).
 *
 * @param {{
 *   order:    object,
 *   items:    object[],
 *   settings: object,
 *   widthMm?: number,
 *   isModified?: boolean,
 *   pageBreakBefore?: boolean,  // add CSS page-break for combined PDF
 * }} opts
 * @returns {string}
 */
function kitchenReceipt({ order, items, settings, widthMm = 80, isModified = false }) {
  const orderDate = new Date(order.created_at);
  const timeStr = fmtTime(orderDate);
  const restaurantName = settings.restaurant_name ?? 'فاست فود رائد';

  const modifiedBadge = isModified
    ? `<div style="font-size:18px;font-weight:bold;text-align:center;color:#000;border:3px solid #000;padding:2mm;margin:2mm 0;">*** طلب معدّل ***</div>`
    : '';

  const itemRows = items.map(item => {
    const opts = (item.options ?? []).map(o => `<div style="font-size:11px;padding-right:4mm;">+ ${o.label}</div>`).join('');
    const note = item.note ? `<div style="font-size:11px;font-style:italic;padding-right:4mm;">📝 ${item.note}</div>` : '';
    return `<div class="kitchen-item">
      <span class="kitchen-qty">${item.qty}×</span>${item.product_name}
      ${opts}${note}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>${buildCss(widthMm)}</style>
</head>
<body>
<div class="receipt">
  <div class="kitchen-title">${restaurantName} – مطبخ</div>
  ${modifiedBadge}
  <div style="text-align:center;font-size:28px;font-weight:bold;margin:2mm 0;">#${order.number}</div>
  <div class="order-type-badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
  <div style="text-align:center;font-size:12px;color:#555;margin-bottom:3mm;">${timeStr}</div>
  <hr class="divider-solid">
  ${itemRows}
  ${order.order_type === 'delivery' && order.delivery_name
    ? `<hr class="divider"><div style="font-size:12px;">التوصيل: ${order.delivery_name}</div>`
    : ''}
</div>
</body>
</html>`;
}

/**
 * Build a combined HTML page: customer receipt on top, kitchen receipt below
 * (separated by a page-break), suitable for printing to PDF.
 *
 * @param {{
 *   order:       object,
 *   items:       object[],
 *   settings:    object,
 *   logoDataUrl?: string,
 *   widthMm?:   number,
 *   isModified?: boolean,
 * }} opts
 * @returns {string}
 */
function combinedPdfReceipt({ order, items, settings, logoDataUrl, widthMm = 80, isModified = false }) {
  const orderDate = new Date(order.created_at);
  const dateStr = fmtDate(orderDate);
  const timeStr = fmtTime(orderDate);

  const itemsTotal = items.reduce((s, i) => s + i.line_total, 0);
  const fee = order.delivery_fee ?? 0;
  const restaurantName = settings.restaurant_name ?? 'فاست فود رائد';
  const restaurantPhone = settings.restaurant_phone ?? '';
  const thankYou = settings.thank_you_message ?? 'شكراً لزيارتكم';

  const logoHtml = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="${restaurantName}" />`
    : '';

  const customerItemRows = items.map(item => {
    const optLines = (item.options ?? [])
      .map(o => `<tr><td colspan="3" class="opt-line">+ ${o.label} (+${fmtMoney(o.price)})</td></tr>`)
      .join('');
    const noteLines = item.note
      ? `<tr><td colspan="3" class="note-line">📝 ${item.note}</td></tr>`
      : '';
    return `
      <tr>
        <td>${item.product_name}</td>
        <td class="num">${item.qty}×${fmtMoney(item.unit_price)}</td>
        <td class="num">${fmtMoney(item.line_total)}</td>
      </tr>
      ${optLines}${noteLines}
    `;
  }).join('');

  const feeRow = fee > 0
    ? `<div class="total-row fee-row"><span>رسوم التوصيل</span><span>${fmtMoney(fee)}</span></div>`
    : '';

  const modifiedBadge = isModified
    ? `<div class="badge" style="margin-bottom:3mm;">طلب معدّل</div>`
    : '';

  const kitchenModifiedBadge = isModified
    ? `<div style="font-size:18px;font-weight:bold;text-align:center;color:#000;border:3px solid #000;padding:2mm;margin:2mm 0;">*** طلب معدّل ***</div>`
    : '';

  const kitchenItemRows = items.map(item => {
    const opts = (item.options ?? []).map(o => `<div style="font-size:11px;padding-right:4mm;">+ ${o.label}</div>`).join('');
    const note = item.note ? `<div style="font-size:11px;font-style:italic;padding-right:4mm;">📝 ${item.note}</div>` : '';
    return `<div class="kitchen-item">
      <span class="kitchen-qty">${item.qty}×</span>${item.product_name}
      ${opts}${note}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>${buildCss(widthMm)}</style>
</head>
<body>
<!-- ══ Customer receipt ══ -->
<div class="receipt">
  <div class="center">
    ${logoHtml}
    <div class="brand">${restaurantName}</div>
    ${restaurantPhone ? `<div class="phone">${restaurantPhone}</div>` : ''}
    ${modifiedBadge}
    <h2>#${order.number}</h2>
    <div class="badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
    <div class="meta">${dateStr} – ${timeStr}</div>
  </div>
  <hr class="divider-solid">
  <table>
    <thead>
      <tr>
        <th>الصنف</th>
        <th>الكمية×السعر</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${customerItemRows}</tbody>
  </table>
  <hr class="divider">
  <div class="total-section">
    <div class="total-row"><span>المجموع الفرعي</span><span>${fmtMoney(itemsTotal)}</span></div>
    ${feeRow}
    <div class="total-row grand"><span>الإجمالي</span><span>${fmtMoney(order.total)}</span></div>
  </div>
  ${order.order_type === 'delivery' && order.delivery_name
    ? `<hr class="divider"><div class="meta">العميل: ${order.delivery_name} – ${order.delivery_phone ?? ''}</div>`
    : ''}
  <div class="thanks">${thankYou}</div>
</div>

<!-- ══ Kitchen receipt (no logo, page break before) ══ -->
<div class="receipt page-break">
  <div class="kitchen-title">${restaurantName} – مطبخ</div>
  ${kitchenModifiedBadge}
  <div style="text-align:center;font-size:28px;font-weight:bold;margin:2mm 0;">#${order.number}</div>
  <div class="order-type-badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
  <div style="text-align:center;font-size:12px;color:#555;margin-bottom:3mm;">${timeStr}</div>
  <hr class="divider-solid">
  ${kitchenItemRows}
  ${order.order_type === 'delivery' && order.delivery_name
    ? `<hr class="divider"><div style="font-size:12px;">التوصيل: ${order.delivery_name}</div>`
    : ''}
</div>
</body>
</html>`;
}

/**
 * Build a cancellation receipt (cashier copy for the owner).
 * @param {{ order: object, items: object[], settings: object, logoDataUrl?: string, widthMm?: number }} opts
 * @returns {string}
 */
function cancellationReceipt({ order, items, settings, logoDataUrl, widthMm = 80 }) {
  return customerReceipt({ order, items, settings, logoDataUrl, widthMm })
    .replace(
      '</div>\n</body>',
      `<div style="text-align:center;font-size:16px;font-weight:bold;border:3px solid #000;padding:3mm;margin-top:4mm;">
        *** إيصال إلغاء ***
      </div></div>\n</body>`,
    );
}

module.exports = { customerReceipt, kitchenReceipt, combinedPdfReceipt, cancellationReceipt };
