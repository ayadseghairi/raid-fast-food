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

/**
 * Build the receipt CSS for the chosen paper width.
 *
 * IMPORTANT – hard-coded colors are intentional here.
 * This stylesheet is used in a hidden Electron BrowserWindow for thermal printing.
 * Thermal printers render every non-black pixel as sparse dots, so any gray or
 * muted color appears nearly transparent on paper.  ALL text must be pure black
 * (#000) on pure white (#fff).  CSS custom properties (--color-*) must NOT be
 * used here because they come from the app theme and may resolve to gray/dark
 * values in dark mode.  This file is explicitly excluded from the
 * "no hard-coded colors outside tokens.css" lint rule.
 *
 * Font weights: 700 (bold) for delivery block and totals, 500+ for everything else.
 * font-synthesis: weight is set so bold never falls back to a fake thin face.
 * -webkit-font-smoothing: antialiased for clean rendering.
 */
function buildCss(widthMm) {
  /* Scale some sizes for 58 mm paper */
  const is58 = widthMm <= 60;
  const phoneSz   = is58 ? 22 : 28;  /* phone number: huge on both widths    */
  const nameSz    = is58 ? 17 : 20;  /* customer name / address               */
  const labelSz   = is58 ? 11 : 13;  /* "الاسم:" / "الهاتف:" labels           */
  const itemSz    = is58 ? 10 : 11;  /* item rows                             */
  const totalSz   = is58 ? 12 : 15;  /* grand total row                       */
  const headerSz  = is58 ? 13 : 15;  /* restaurant name                       */
  const orderNumSz= is58 ? 18 : 22;  /* #42 heading                           */

  return `
    /* ── @page: tell Chromium the exact paper size (no margins) ── */
    @page {
      size: ${widthMm}mm auto;
      margin: 0;
    }

    /* font-synthesis: weight ensures bold is never faked as thin */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-synthesis: weight style;
    }

    html, body {
      width: ${widthMm}mm;
      /* Arial / Tahoma are always present on Windows and produce clean thermal output */
      font-family: 'Arial', 'Tahoma', sans-serif;
      font-size: ${itemSz}px;
      font-weight: 500;
      direction: rtl;
      /* Hard-coded black on white — required for thermal printers (see file header) */
      color: #000;
      background: #fff;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .receipt  { width: 100%; padding: 4mm; }
    .center   { text-align: center; }

    .logo     { max-width: ${widthMm - 8}mm; max-height: 18mm; object-fit: contain; display: block; margin: 0 auto 2mm; }

    /* Restaurant name */
    .brand    { font-size: ${headerSz}px; font-weight: 700; margin-bottom: 1mm; color: #000; }

    /* Restaurant phone in header */
    .rphone   { font-size: ${itemSz}px; font-weight: 500; color: #000; margin-bottom: 2mm; }

    /* Order number */
    h2        { font-size: ${orderNumSz}px; font-weight: 700; margin: 2mm 0 1mm; color: #000; }

    /* Order type badge */
    .badge    { display: inline-block; border: 2px solid #000; padding: 1mm 4mm; font-size: ${labelSz}px; font-weight: 700; border-radius: 3px; margin-bottom: 3mm; color: #000; background: #fff; }

    /* Date / time meta */
    .meta     { font-size: ${itemSz}px; font-weight: 500; color: #000; margin-bottom: 3mm; }

    /* Dividers */
    .divider        { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
    .divider-solid  { border: none; border-top: 1px solid #000;  margin: 2mm 0; }
    .divider-thick  { border: none; border-top: 2px solid #000;  margin: 2mm 0; }

    /* Items table */
    table { width: 100%; border-collapse: collapse; }
    th    { font-size: ${itemSz}px; font-weight: 700; border-bottom: 1px solid #000; padding: 1mm 0; text-align: right; color: #000; }
    td    { font-size: ${itemSz}px; font-weight: 500; padding: 1mm 0; vertical-align: top; text-align: right; color: #000; }
    td.num { text-align: left; direction: ltr; }

    /* Item sub-lines */
    .opt-line  { font-size: ${itemSz}px; font-weight: 500; color: #000; padding-right: 2mm; }
    .note-line { font-size: ${itemSz}px; font-weight: 500; color: #000; font-style: italic; padding-right: 2mm; }

    /* Fee row */
    .fee-row  { font-size: ${itemSz}px; font-weight: 600; color: #000; }

    /* Totals */
    .total-section { margin-top: 2mm; }
    .total-row     { display: flex; justify-content: space-between; padding: 1mm 0; font-size: ${itemSz}px; font-weight: 600; color: #000; }
    .grand         { font-size: ${totalSz}px; font-weight: 700; border-top: 2px solid #000; padding-top: 2mm; margin-top: 1mm; color: #000; }

    /* Thank-you footer */
    .thanks { text-align: center; font-size: ${itemSz}px; font-weight: 600; color: #000; margin-top: 4mm; padding-top: 2mm; border-top: 1px dashed #000; }
    .stamp  { text-align: center; font-size: ${itemSz}px; font-weight: 500; color: #000; margin-top: 2mm; }

    /* ── delivery-block: thick solid black dividers above/below,
       name/address bold >= ${nameSz}px, phone extra-bold >= ${phoneSz}px,
       labels bold black, no gray, no opacity. ── */
    .delivery-block {
      margin: 1mm 0;
      padding: 2mm 0;
    }
    .delivery-title {
      font-size: ${nameSz}px;
      font-weight: 700;
      color: #000;
      text-align: center;
      margin-bottom: 2mm;
    }
    .delivery-row {
      display: flex;
      flex-direction: column;
      margin-bottom: 2mm;
    }
    .delivery-label {
      font-size: ${labelSz}px;
      font-weight: 700;
      color: #000;
      margin-bottom: 0.5mm;
    }
    .delivery-value {
      font-size: ${nameSz}px;
      font-weight: 700;
      color: #000;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .delivery-phone-value {
      font-size: ${phoneSz}px;
      font-weight: 700;
      color: #000;
      font-variant-numeric: tabular-nums;
      direction: ltr;
      text-align: right;
    }

    /* kitchen copy extras */
    .kitchen-title      { font-size: ${orderNumSz}px; font-weight: 700; text-align: center; margin-bottom: 2mm; color: #000; }
    .order-type-badge   { font-size: ${nameSz}px; font-weight: 700; text-align: center; padding: 2mm; border: 3px solid #000; margin: 2mm 0; color: #000; background: #fff; }
    .kitchen-item       { font-size: ${nameSz}px; font-weight: 600; padding: 1mm 0; border-bottom: 1px solid #000; color: #000; }
    .kitchen-qty        { font-weight: 700; margin-left: 2mm; }

    /* page-break between customer and kitchen in combined PDF */
    .page-break { page-break-before: always; }
  `;
}

// 'takeaway' uses the legacy label so reprinted old receipts still show the right type
const ORDER_TYPE_LABEL = {
  dine_in:  'محلي',
  takeaway: 'سفري (قديم)',
  delivery: 'توصيل',
};

/**
 * Build the delivery info HTML block (only for delivery orders).
 * Returns empty string for non-delivery orders.
 *
 * @param {object} order
 * @returns {string}
 */
function buildDeliveryBlock(order) {
  if (order.order_type !== 'delivery') return '';
  const name  = order.delivery_name  ?? '';
  const phone = order.delivery_phone ?? '';
  const addr  = order.delivery_addr  ?? '';
  if (!name && !phone && !addr) return '';

  const nameRow = name
    ? `<div class="delivery-row">
         <div class="delivery-label">الاسم:</div>
         <div class="delivery-value">${name}</div>
       </div>`
    : '';
  const phoneRow = phone
    ? `<div class="delivery-row">
         <div class="delivery-label">الهاتف:</div>
         <div class="delivery-phone-value">${phone}</div>
       </div>`
    : '';
  const addrRow = addr
    ? `<div class="delivery-row">
         <div class="delivery-label">العنوان:</div>
         <div class="delivery-value">${addr}</div>
       </div>`
    : '';

  return `
    <hr class="divider-thick">
    <div class="delivery-block">
      <div class="delivery-title">بيانات التوصيل</div>
      ${nameRow}
      ${phoneRow}
      ${addrRow}
    </div>
    <hr class="divider-thick">
  `;
}

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
    ${restaurantPhone ? `<div class="rphone">${restaurantPhone}</div>` : ''}
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
  ${buildDeliveryBlock(order)}
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
    ? `<div style="font-size:18px;font-weight:700;text-align:center;color:#000;border:3px solid #000;padding:2mm;margin:2mm 0;">*** طلب معدّل ***</div>`
    : '';

  const itemRows = items.map(item => {
    const opts = (item.options ?? []).map(o => `<div style="font-size:11px;font-weight:500;padding-right:4mm;color:#000;">+ ${o.label}</div>`).join('');
    const note = item.note ? `<div style="font-size:11px;font-weight:500;font-style:italic;padding-right:4mm;color:#000;">📝 ${item.note}</div>` : '';
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
  <div style="text-align:center;font-size:28px;font-weight:700;margin:2mm 0;color:#000;">#${order.number}</div>
  <div class="order-type-badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
  <div style="text-align:center;font-size:12px;font-weight:600;color:#000;margin-bottom:3mm;">${timeStr}</div>
  <hr class="divider-solid">
  ${itemRows}
  ${buildDeliveryBlock(order)}
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
    ? `<div style="font-size:18px;font-weight:700;text-align:center;color:#000;border:3px solid #000;padding:2mm;margin:2mm 0;">*** طلب معدّل ***</div>`
    : '';

  const kitchenItemRows = items.map(item => {
    const opts = (item.options ?? []).map(o => `<div style="font-size:11px;font-weight:500;padding-right:4mm;color:#000;">+ ${o.label}</div>`).join('');
    const note = item.note ? `<div style="font-size:11px;font-weight:500;font-style:italic;padding-right:4mm;color:#000;">📝 ${item.note}</div>` : '';
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
    ${restaurantPhone ? `<div class="rphone">${restaurantPhone}</div>` : ''}
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
  ${buildDeliveryBlock(order)}
  <div class="thanks">${thankYou}</div>
</div>

<!-- ══ Kitchen receipt (no logo, page break before) ══ -->
<div class="receipt page-break">
  <div class="kitchen-title">${restaurantName} – مطبخ</div>
  ${kitchenModifiedBadge}
  <div style="text-align:center;font-size:28px;font-weight:700;margin:2mm 0;color:#000;">#${order.number}</div>
  <div class="order-type-badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
  <div style="text-align:center;font-size:12px;font-weight:600;color:#000;margin-bottom:3mm;">${timeStr}</div>
  <hr class="divider-solid">
  ${kitchenItemRows}
  ${buildDeliveryBlock(order)}
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
      `<div style="text-align:center;font-size:16px;font-weight:700;color:#000;border:3px solid #000;padding:3mm;margin-top:4mm;">
        *** إيصال إلغاء ***
      </div></div>\n</body>`,
    );
}

module.exports = { customerReceipt, kitchenReceipt, combinedPdfReceipt, cancellationReceipt, buildDeliveryBlock };
