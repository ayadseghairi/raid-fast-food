/**
 * Unit tests for renderReceiptHtml and pageSizeForWidth.
 *
 * These tests run in Node (no Electron) so we import only the pure helpers.
 * electron/services/printing.js depends on Electron APIs; we extract just
 * the two functions we can test without mocking Electron.
 */

import { describe, it, expect } from 'vitest';

// ── Import the pure template functions directly ────────────────────
import { customerReceipt, kitchenReceipt, combinedPdfReceipt, cancellationReceipt }
  from '../electron/utils/receiptTemplate.js';

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
  delivery_name: 'أحمد',
  delivery_phone:'0551234567',
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

  it('shows customer delivery info', () => {
    expect(build()).toContain('أحمد');
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
