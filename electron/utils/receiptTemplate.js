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
 * Size system:
 *   CSS variables --r-* are defined at the top and control every font-size.
 *   A 58 mm override block (~0.85×) follows immediately after.
 *   Phone is never below 18px; body text never below 12px on 58mm.
 *
 * Font weights: 700+ for delivery block labels/values and totals; 600 for item
 * names and secondary info; 500 minimum for all other body text.
 * font-synthesis:weight ensures bold is never faked as a thin face.
 * -webkit-font-smoothing:antialiased for clean rendering.
 */
function buildCss(widthMm) {
  const is58 = widthMm <= 60;

  return `
    /* ══════════════════════════════════════════════════════════════
       Receipt size tokens – edit here to tune all sizes at once.
       80mm base values (px at 96 dpi / CSS px):
         --r-brand   restaurant name
         --r-num     order number (#11) – most prominent after total
         --r-badge   order-type badge text
         --r-meta    date / time
         --r-th      table header
         --r-td      item name / row body
         --r-qty     quantity × price column
         --r-sub     subtotal / fee lines
         --r-total   GRAND TOTAL – most prominent
         --r-thanks  thank-you footer
         --r-rphone  restaurant phone in header
         --r-dlabel  delivery row label (الاسم / الهاتف / العنوان)
         --r-dvalue  delivery name / address value
         --r-dphone  delivery phone number (extra large, ltr)
       ══════════════════════════════════════════════════════════════ */
    :root {
      --r-brand:  18px;
      --r-num:    28px;
      --r-badge:  14px;
      --r-meta:   12px;
      --r-th:     12px;
      --r-td:     14px;
      --r-qty:    13px;
      --r-sub:    14px;
      --r-total:  22px;
      --r-thanks: 13px;
      --r-rphone: 13px;
      --r-dlabel: 12px;
      --r-dvalue: 16px;
      --r-dphone: 20px;
    }

    ${is58 ? `
    /* ── 58mm override: ~0.85× scale; phone/body never below 18px/12px ── */
    :root {
      --r-brand:  15px;
      --r-num:    24px;
      --r-badge:  12px;
      --r-meta:   11px;
      --r-th:     11px;
      --r-td:     12px;
      --r-qty:    11px;
      --r-sub:    12px;
      --r-total:  19px;
      --r-thanks: 11px;
      --r-rphone: 11px;
      --r-dlabel: 10px;
      --r-dvalue: 14px;
      --r-dphone: 18px;
    }
    ` : ''}

    /* ── @page: tell Chromium the exact paper size (no margins) ── */
    @page {
      size: ${widthMm}mm auto;
      margin: 0;
    }

    /* font-synthesis:weight ensures bold is never faked as thin */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-synthesis: weight style;
    }

    html, body {
      width: ${widthMm}mm;
      /* Arial/Tahoma are always present on Windows and produce clean thermal output */
      font-family: 'Arial', 'Tahoma', sans-serif;
      font-size: var(--r-td);
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
    .brand    { font-size: var(--r-brand); font-weight: 700; margin-bottom: 1mm; color: #000; }

    /* Restaurant phone in header */
    .rphone   { font-size: var(--r-rphone); font-weight: 600; color: #000; margin-bottom: 2mm; }

    /* Order number – most prominent element, only outranked by GRAND TOTAL visually */
    h2        { font-size: var(--r-num); font-weight: 800; margin: 2mm 0 1mm; color: #000; }

    /* Order type badge: solid 1.5px border, tight rounded corners */
    .badge    {
      display: inline-block;
      border: 1.5px solid #000;
      padding: 1mm 3mm;
      font-size: var(--r-badge);
      font-weight: 700;
      border-radius: 4px;
      margin-bottom: 2mm;
      color: #000;
      background: #fff;
    }

    /* Date / time meta */
    .meta     { font-size: var(--r-meta); font-weight: 500; color: #000; margin-bottom: 2mm; }

    /* Section spacing: 8px rhythm between logical blocks */
    .section-gap { margin: 2mm 0; }

    /* Dividers */
    .divider        { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
    .divider-solid  { border: none; border-top: 1px solid #000;  margin: 2mm 0; }

    /* Items table */
    table { width: 100%; border-collapse: collapse; }
    th    {
      font-size: var(--r-th);
      font-weight: 700;
      border-bottom: 1px solid #000;
      padding: 1mm 0;
      text-align: right;
      color: #000;
    }
    td    {
      font-size: var(--r-td);
      font-weight: 600;
      padding: 1.5mm 0;
      vertical-align: top;
      text-align: right;
      color: #000;
      line-height: 1.5;
    }
    td.num  { font-size: var(--r-qty); text-align: left; direction: ltr; font-weight: 600; }
    td.tot  { font-size: var(--r-td);  text-align: left; direction: ltr; font-weight: 700; }

    /* Item sub-lines */
    .opt-line  { font-size: var(--r-qty); font-weight: 500; color: #000; padding-right: 2mm; line-height: 1.4; }
    .note-line { font-size: var(--r-qty); font-weight: 500; color: #000; font-style: italic; padding-right: 2mm; line-height: 1.4; }

    /* Totals */
    .total-section { margin-top: 2mm; }
    .total-row     {
      display: flex;
      justify-content: space-between;
      padding: 1mm 0;
      font-size: var(--r-sub);
      font-weight: 600;
      color: #000;
    }
    /* GRAND TOTAL: largest after order number */
    .grand {
      font-size: var(--r-total);
      font-weight: 800;
      border-top: 1.5px solid #000;
      padding-top: 2mm;
      margin-top: 1mm;
      color: #000;
    }

    /* Thank-you footer */
    .thanks {
      text-align: center;
      font-size: var(--r-thanks);
      font-weight: 600;
      color: #000;
      margin-top: 3mm;
      padding-top: 2mm;
      border-top: 1px dashed #000;
    }

    /* ── Delivery block (compact, framed box) ──────────────────────
       A solid 1.5px black border with 6px rounded corners wraps the
       entire block. Padding 8px 10px. No background fill.
       Title 14px bold centered with a thin separator below.
       Three rows label/value side-by-side on a baseline.
       Phone direction:ltr + unicode-bidi:isolate; digits never reorder.
       No gray, no opacity anywhere.
    ── */
    .delivery-frame {
      border: 1.5px solid #000;
      border-radius: 6px;
      padding: 2mm 2.5mm;
      margin: 2mm 0;
    }
    .delivery-title {
      font-size: var(--r-badge);
      font-weight: 700;
      color: #000;
      text-align: center;
      padding-bottom: 1mm;
      border-bottom: 1px solid #000;
      margin-bottom: 2mm;
    }
    .delivery-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
      padding: 1.5mm 0;
      border-bottom: 1px solid #000;
    }
    .delivery-row:last-child {
      border-bottom: none;
    }
    .delivery-label {
      font-size: var(--r-dlabel);
      font-weight: 700;
      color: #000;
      flex-shrink: 0;
      padding-left: 2mm;
    }
    .delivery-value {
      font-size: var(--r-dvalue);
      font-weight: 700;
      color: #000;
      text-align: right;
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.4;
      flex: 1;
    }
    .delivery-phone-value {
      font-size: var(--r-dphone);
      font-weight: 800;
      color: #000;
      font-variant-numeric: tabular-nums;
      direction: ltr;
      unicode-bidi: isolate;
      text-align: start;
      word-break: break-all;
      overflow-wrap: anywhere;
      flex: 1;
    }

    /* kitchen copy extras */
    .kitchen-title    { font-size: var(--r-num);   font-weight: 700; text-align: center; margin-bottom: 2mm; color: #000; }
    .order-type-badge { font-size: var(--r-dvalue); font-weight: 700; text-align: center; padding: 2mm; border: 1.5px solid #000; border-radius: 4px; margin: 2mm 0; color: #000; background: #fff; }
    .kitchen-item     { font-size: var(--r-dvalue); font-weight: 600; padding: 1.5mm 0; border-bottom: 1px solid #000; color: #000; line-height: 1.5; }
    .kitchen-qty      { font-weight: 700; margin-left: 2mm; }

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
 * Build the compact framed delivery info block (only for delivery orders).
 * Returns empty string for non-delivery orders or when all delivery fields are null.
 *
 * Layout: a bordered box (1.5px solid, 6px radius) with:
 *   - Title "بيانات التوصيل" 14px bold + thin separator
 *   - Three label/value rows (الاسم / الهاتف / العنوان), only non-empty shown
 *   - Phone: direction:ltr + unicode-bidi:isolate so digits never reorder
 *   - Address: wraps to as many lines as needed (never truncated)
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
    <div class="delivery-frame">
      <div class="delivery-title">بيانات التوصيل</div>
      ${nameRow}
      ${phoneRow}
      ${addrRow}
    </div>
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
        <td class="tot">${fmtMoney(item.line_total)}</td>
      </tr>
      ${optLines}${noteLines}
    `;
  }).join('');

  const feeRow = fee > 0
    ? `<div class="total-row"><span>رسوم التوصيل</span><span>${fmtMoney(fee)}</span></div>`
    : '';

  const modifiedBadge = isModified
    ? `<div class="badge" style="margin-bottom:2mm;">طلب معدّل</div>`
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
 * }} opts
 * @returns {string}
 */
function kitchenReceipt({ order, items, settings, widthMm = 80, isModified = false }) {
  const orderDate = new Date(order.created_at);
  const timeStr = fmtTime(orderDate);
  const restaurantName = settings.restaurant_name ?? 'فاست فود رائد';

  const modifiedBadge = isModified
    ? `<div style="font-size:18px;font-weight:700;text-align:center;color:#000;border:1.5px solid #000;border-radius:4px;padding:2mm;margin:2mm 0;">*** طلب معدّل ***</div>`
    : '';

  const itemRows = items.map(item => {
    const opts = (item.options ?? []).map(o => `<div style="font-size:12px;font-weight:500;padding-right:4mm;color:#000;line-height:1.4;">+ ${o.label}</div>`).join('');
    const note = item.note ? `<div style="font-size:12px;font-weight:500;font-style:italic;padding-right:4mm;color:#000;line-height:1.4;">📝 ${item.note}</div>` : '';
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
  <div style="text-align:center;font-size:28px;font-weight:800;margin:2mm 0;color:#000;">#${order.number}</div>
  <div class="order-type-badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
  <div style="text-align:center;font-size:12px;font-weight:600;color:#000;margin-bottom:2mm;">${timeStr}</div>
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
        <td class="tot">${fmtMoney(item.line_total)}</td>
      </tr>
      ${optLines}${noteLines}
    `;
  }).join('');

  const feeRow = fee > 0
    ? `<div class="total-row"><span>رسوم التوصيل</span><span>${fmtMoney(fee)}</span></div>`
    : '';

  const modifiedBadge = isModified
    ? `<div class="badge" style="margin-bottom:2mm;">طلب معدّل</div>`
    : '';

  const kitchenModifiedBadge = isModified
    ? `<div style="font-size:18px;font-weight:700;text-align:center;color:#000;border:1.5px solid #000;border-radius:4px;padding:2mm;margin:2mm 0;">*** طلب معدّل ***</div>`
    : '';

  const kitchenItemRows = items.map(item => {
    const opts = (item.options ?? []).map(o => `<div style="font-size:12px;font-weight:500;padding-right:4mm;color:#000;line-height:1.4;">+ ${o.label}</div>`).join('');
    const note = item.note ? `<div style="font-size:12px;font-weight:500;font-style:italic;padding-right:4mm;color:#000;line-height:1.4;">📝 ${item.note}</div>` : '';
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
  <div style="text-align:center;font-size:28px;font-weight:800;margin:2mm 0;color:#000;">#${order.number}</div>
  <div class="order-type-badge">${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}</div>
  <div style="text-align:center;font-size:12px;font-weight:600;color:#000;margin-bottom:2mm;">${timeStr}</div>
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
      `<div style="text-align:center;font-size:16px;font-weight:700;color:#000;border:1.5px solid #000;border-radius:4px;padding:3mm;margin-top:3mm;">
        *** إيصال إلغاء ***
      </div></div>\n</body>`,
    );
}

module.exports = { customerReceipt, kitchenReceipt, combinedPdfReceipt, cancellationReceipt, buildDeliveryBlock };
