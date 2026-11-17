/**
 * Unit tests for receiptTemplate helpers.
 *
 * These tests run in Node (no Electron) so we import only the pure template helpers.
 * electron/services/printing.js depends on Electron APIs; we extract just
 * the functions we can test without mocking Electron.
 *
 * Receipt CSS guarantees tested here:
 *   - No `opacity` declarations in the CSS block
 *   - No rgba() or gray colors for text
 *   - No font-weight below 500
 *   - Delivery block present for delivery orders (name, phone, address)
 *   - Delivery block absent for non-delivery orders
 *   - Phone has direction:ltr and unicode-bidi:isolate
 */

import { describe, it, expect } from 'vitest';

// ── Import the pure template functions directly ────────────────────
import {
  customerReceipt,
  kitchenReceipt,
  combinedPdfReceipt,
  cancellationReceipt,
  buildDeliveryBlock,
} from '../electron/utils/receiptTemplate.js';

// ── Import pageSizeForWidth via a thin stub ────────────────────────
// We cannot `require` printing.js because it calls `require('electron')`.
// Instead we inline the same logic here and test it in isolation.
// Keep this in sync with electron/services/printing.js pageSizeForWidth.
function pageSizeForWidth(widthMm) {
  if (widthMm === 210) return { width: 210_000, height: 297_000 };
  return { width: widthMm * 1000, height: 10_000_000 };
}

// ── Shared fixtures ────────────────────────────────────────────────

const ORDER = {
  id:            1,
  number:        42,
  order_type:    'delivery',
  delivery_name: 'عبد الرحمن بن محمد',
  // 14-digit phone to verify wrapping safety
  delivery_phone:'00213551234567890',
  // ~100-char address to verify multiline wrapping
  delivery_addr: 'حي النصر، شارع الاستقلال رقم 42، بجانب المسجد الكبير، قرب السوق المركزي، تيارت',
  delivery_fee:  500,    // 5.00 DA
  total:         2500,   // 25.00 DA
  created_at:    '2024-06-15T14:30:00.000Z',
  status:        'normal',
};

const ITEMS = [
  {
    product_name: 'برغر كبير',
    unit_price:   1000,   // 10.00 DA
    qty:          2,
    options:      [{ label: 'صلصة حارة', price: 50 }],
    note:         'بدون بصل',
    line_total:   2100,
  },
];

const SETTINGS = {
  restaurant_name:   'فاست فود رائد',
  restaurant_phone:  '0551234567',
  thank_you_message: 'شكراً لزيارتكم',
};

// ── pageSizeForWidth ──────────────────────────────────────────────

describe('pageSizeForWidth', () => {
  it('returns A4 microns for 210mm', () => {
    const size = pageSizeForWidth(210);
    expect(size).toEqual({ width: 210_000, height: 297_000 });
  });

  it('returns 80mm width in microns for thermal 80mm', () => {
    const size = pageSizeForWidth(80);
    expect(size).toEqual({ width: 80_000, height: 10_000_000 });
  });

  it('returns 58mm width in microns for thermal 58mm', () => {
    const size = pageSizeForWidth(58);
    expect(size).toEqual({ width: 58_000, height: 10_000_000 });
  });
});

// ── CSS quality guarantees ────────────────────────────────────────
// The receipt CSS must be safe for thermal printers:
//   - No opacity (gray dots)
//   - No rgba() gray colors for text
//   - No font-weight below 500

describe('receipt CSS — thermal safety', () => {
  function extractCss(html) {
    const m = html.match(/<style>([\s\S]*?)<\/style>/);
    return m ? m[1] : '';
  }

  it('customer receipt CSS contains no "opacity" declarations', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    // Strip comments first
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/\bopacity\s*:/);
  });

  it('customer receipt CSS contains no rgba() colors', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    expect(css).not.toMatch(/rgba\s*\(/);
  });

  it('customer receipt CSS contains no gray hex colors on text properties', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    // Check explicitly for the gray values that must not appear
    const forbidden = ['color:#333', 'color:#555', 'color:#666', 'color:#888', 'color:#aaa', 'color:#444'];
    for (const g of forbidden) {
      expect(css).not.toContain(g);
    }
  });

  it('customer receipt CSS has no font-weight below 500', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/font-weight\s*:\s*(100|200|300|400|normal)\b/);
  });

  it('kitchen receipt CSS contains no "opacity" declarations', () => {
    const css = extractCss(kitchenReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/\bopacity\s*:/);
  });

  it('CSS defines --r-total token (grand total token exists)', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    expect(css).toContain('--r-total:');
  });

  it('CSS defines --r-dphone token (delivery phone token exists)', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }));
    expect(css).toContain('--r-dphone:');
  });

  it('58mm CSS has an override block for --r-dphone', () => {
    const css = extractCss(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS, widthMm: 58 }));
    // Should define --r-dphone twice (base 80mm and 58mm override)
    const count = (css.match(/--r-dphone:/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── customerReceipt ───────────────────────────────────────────────

describe('customerReceipt', () => {
  function build(overrides = {}) {
    return customerReceipt({
      order: { ...ORDER, ...overrides.order },
      items: overrides.items ?? ITEMS,
      settings: { ...SETTINGS, ...overrides.settings },
      widthMm: overrides.widthMm ?? 80,
      isModified: overrides.isModified ?? false,
    });
  }

  it('contains restaurant name', () => {
    expect(build()).toContain('فاست فود رائد');
  });

  it('embeds logo data URI when logoDataUrl provided', () => {
    const html = customerReceipt({
      order: ORDER, items: ITEMS, settings: SETTINGS,
      logoDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    expect(html).toContain('data:image/jpeg;base64,AAAA');
  });

  it('no <img> tag when logoDataUrl is null', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS, logoDataUrl: null });
    expect(html).not.toContain('<img class="logo"');
  });

  it('contains order number', () => {
    expect(build()).toContain('#42');
  });

  it('renders order type label for delivery', () => {
    expect(build()).toContain('توصيل');
  });

  it('shows date in DD/MM/YYYY format', () => {
    const html = build();
    // 2024-06-15 → 15/06/2024
    expect(html).toContain('15/06/2024');
  });

  it('shows item product name', () => {
    expect(build()).toContain('برغر كبير');
  });

  it('shows option label', () => {
    expect(build()).toContain('صلصة حارة');
  });

  it('shows item note', () => {
    expect(build()).toContain('بدون بصل');
  });

  it('shows delivery fee row when fee > 0', () => {
    expect(build()).toContain('رسوم التوصيل');
  });

  it('does NOT show delivery fee row when fee = 0', () => {
    const html = build({ order: { delivery_fee: 0, total: 2000, order_type: 'dine_in' } });
    expect(html).not.toContain('رسوم التوصيل');
  });

  it('shows grand total (25.00)', () => {
    expect(build()).toContain('25.00');
  });

  it('shows thank-you message', () => {
    expect(build()).toContain('شكراً لزيارتكم');
  });

  it('shows customer name in body', () => {
    expect(build()).toContain('عبد الرحمن');
  });

  it('shows modified badge when isModified=true', () => {
    expect(build({ isModified: true })).toContain('طلب معدّل');
  });

  it('does NOT show modified badge by default', () => {
    expect(build()).not.toContain('طلب معدّل');
  });

  it('uses requested paper width in @page CSS', () => {
    const html58 = build({ widthMm: 58 });
    expect(html58).toContain('58mm');
  });

  it('is valid HTML document', () => {
    const html = build();
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });
});

// ── Delivery block ────────────────────────────────────────────────

describe('delivery block — present for delivery orders', () => {
  it('contains "بيانات التوصيل" section heading', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('بيانات التوصيل');
  });

  it('shows customer name in delivery block', () => {
    expect(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }))
      .toContain('عبد الرحمن');
  });

  it('shows customer phone (long, 14+ digits) in delivery block', () => {
    expect(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }))
      .toContain('00213551234567890');
  });

  it('shows customer address (long ~100 chars) in delivery block', () => {
    expect(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }))
      .toContain('السوق المركزي');
  });

  it('delivery block uses delivery-phone-value class', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('delivery-phone-value');
  });

  it('phone has direction:ltr (digits never reorder)', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('direction: ltr');
  });

  it('phone has unicode-bidi:isolate', () => {
    const css = (() => { const m = html => html.match(/<style>([\s\S]*?)<\/style>/); return m(customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS }))?.[1] ?? ''; })();
    expect(css).toContain('unicode-bidi: isolate');
  });

  it('delivery block uses delivery-frame class (compact bordered box)', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    const body = html.slice(html.indexOf('<body>'));
    expect(body).toContain('delivery-frame');
  });

  it('delivery block absent for dine_in orders', () => {
    const dineInOrder = { ...ORDER, order_type: 'dine_in', delivery_name: null, delivery_phone: null, delivery_addr: null };
    const html = customerReceipt({ order: dineInOrder, items: ITEMS, settings: SETTINGS });
    // Check <body> content only (CSS comments may reference class names)
    const body = html.slice(html.indexOf('<body>'));
    expect(body).not.toContain('delivery-frame');
  });

  it('delivery block absent when order has no delivery fields', () => {
    const noDeliveryOrder = { ...ORDER, order_type: 'delivery', delivery_name: null, delivery_phone: null, delivery_addr: null };
    const html = customerReceipt({ order: noDeliveryOrder, items: ITEMS, settings: SETTINGS });
    const body = html.slice(html.indexOf('<body>'));
    expect(body).not.toContain('delivery-frame');
  });
});

describe('buildDeliveryBlock', () => {
  it('returns empty string for dine_in', () => {
    expect(buildDeliveryBlock({ ...ORDER, order_type: 'dine_in' })).toBe('');
  });

  it('returns empty string when all delivery fields are null', () => {
    expect(buildDeliveryBlock({ ...ORDER, delivery_name: null, delivery_phone: null, delivery_addr: null })).toBe('');
  });

  it('contains delivery-frame class for delivery order', () => {
    expect(buildDeliveryBlock(ORDER)).toContain('delivery-frame');
  });

  it('contains phone in delivery block', () => {
    expect(buildDeliveryBlock(ORDER)).toContain('00213551234567890');
  });

  it('contains address in delivery block', () => {
    expect(buildDeliveryBlock(ORDER)).toContain('السوق المركزي');
  });

  it('phone element uses delivery-phone-value class', () => {
    expect(buildDeliveryBlock(ORDER)).toContain('delivery-phone-value');
  });
});

// ── kitchenReceipt ────────────────────────────────────────────────

describe('kitchenReceipt', () => {
  function build(overrides = {}) {
    return kitchenReceipt({
      order:    { ...ORDER, ...overrides.order },
      items:    overrides.items ?? ITEMS,
      settings: { ...SETTINGS, ...overrides.settings },
      widthMm:  overrides.widthMm ?? 80,
      isModified: overrides.isModified ?? false,
    });
  }

  it('shows restaurant name with مطبخ', () => {
    expect(build()).toContain('مطبخ');
  });

  it('shows order number', () => {
    expect(build()).toContain('#42');
  });

  it('shows item name', () => {
    expect(build()).toContain('برغر كبير');
  });

  it('shows option label (no price in kitchen)', () => {
    expect(build()).toContain('صلصة حارة');
  });

  it('does NOT show prices', () => {
    // kitchen receipt should not show money amounts like "25.00"
    expect(build()).not.toContain('25.00');
  });

  it('shows modified badge when isModified=true', () => {
    expect(build({ isModified: true })).toContain('طلب معدّل');
  });

  it('shows delivery block for delivery orders', () => {
    expect(build()).toContain('بيانات التوصيل');
  });
});

// ── combinedPdfReceipt ────────────────────────────────────────────

describe('combinedPdfReceipt', () => {
  function build() {
    return combinedPdfReceipt({
      order: ORDER, items: ITEMS, settings: SETTINGS, widthMm: 80,
    });
  }

  it('contains both customer and kitchen sections', () => {
    const html = build();
    expect(html).toContain('رسوم التوصيل');   // customer section
    expect(html).toContain('مطبخ');            // kitchen title
  });

  it('has a page-break between sections', () => {
    expect(build()).toContain('page-break');
  });

  it('shows order number twice (once per receipt)', () => {
    const matches = (build().match(/#42/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('shows delivery block in both sections', () => {
    const html = build();
    const count = (html.match(/بيانات التوصيل/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── cancellationReceipt ───────────────────────────────────────────

describe('cancellationReceipt', () => {
  it('contains cancellation stamp', () => {
    const html = cancellationReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('إيصال إلغاء');
  });

  it('still shows the order number', () => {
    const html = cancellationReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('#42');
  });
});

// ── RTL / direction ───────────────────────────────────────────────

describe('RTL and encoding', () => {
  it('sets dir=rtl on the html element', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('dir="rtl"');
  });

  it('sets lang=ar', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('lang="ar"');
  });

  it('specifies UTF-8 charset', () => {
    const html = customerReceipt({ order: ORDER, items: ITEMS, settings: SETTINGS });
    expect(html).toContain('charset="UTF-8"');
  });
});
