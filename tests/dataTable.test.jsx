/**
 * Tests for DataTable component logic and legacy takeaway row visibility.
 * Pure logic tests — no DOM rendering needed (avoids testing-library dependency).
 */
import { describe, it, expect } from 'vitest';

// ── DataTable column/row builder helpers ───────────────────────────
// (Mirrors the logic in ReportsScreen.jsx without mounting React.)

/**
 * Simulate DataTable rendering: returns the cells it would render.
 * Returns { headers, rows, footerCells, hasNoData }.
 */
function simulateTable({ columns, rows, footerRow }) {
  const headers = columns.map(c => c.label);

  const dataRows = rows.map(row =>
    columns.map(c => ({ value: row[c.key], numeric: !!c.numeric, minWidth: c.minWidth }))
  );

  const hasNoData = rows.length === 0;
  const footerCells = footerRow ?? null;

  return { headers, rows: dataRows, footerCells, hasNoData };
}

const COLS = [
  { key: 'name',  label: 'الاسم' },
  { key: 'total', label: 'الإجمالي', numeric: true, minWidth: 110 },
];

// ── DataTable rendering logic ──────────────────────────────────────

describe('DataTable – column headers', () => {
  it('extracts all column labels as headers', () => {
    const { headers } = simulateTable({ columns: COLS, rows: [] });
    expect(headers).toEqual(['الاسم', 'الإجمالي']);
  });
});

describe('DataTable – data rows', () => {
  it('renders correct number of rows', () => {
    const rows = [
      { name: 'برغر', total: '25.00' },
      { name: 'بيتزا', total: '50.00' },
    ];
    const { rows: rendered } = simulateTable({ columns: COLS, rows });
    expect(rendered).toHaveLength(2);
  });

  it('maps row values to correct columns', () => {
    const rows = [{ name: 'برغر', total: '25.00' }];
    const { rows: rendered } = simulateTable({ columns: COLS, rows });
    expect(rendered[0][0].value).toBe('برغر');
    expect(rendered[0][1].value).toBe('25.00');
  });

  it('marks numeric columns correctly', () => {
    const rows = [{ name: 'برغر', total: '25.00' }];
    const { rows: rendered } = simulateTable({ columns: COLS, rows });
    expect(rendered[0][0].numeric).toBe(false);
    expect(rendered[0][1].numeric).toBe(true);
  });

  it('propagates minWidth to cells', () => {
    const rows = [{ name: 'برغر', total: '25.00' }];
    const { rows: rendered } = simulateTable({ columns: COLS, rows });
    expect(rendered[0][1].minWidth).toBe(110);
  });
});

describe('DataTable – empty state', () => {
  it('flags hasNoData when rows is empty', () => {
    const { hasNoData } = simulateTable({ columns: COLS, rows: [] });
    expect(hasNoData).toBe(true);
  });

  it('does not flag hasNoData when rows exist', () => {
    const rows = [{ name: 'برغر', total: '25.00' }];
    const { hasNoData } = simulateTable({ columns: COLS, rows });
    expect(hasNoData).toBe(false);
  });
});

describe('DataTable – totals footer', () => {
  it('passes through footerRow cells', () => {
    const rows = [{ name: 'برغر', total: '25.00' }];
    const { footerCells } = simulateTable({
      columns: COLS,
      rows,
      footerRow: ['الإجمالي', '25.00'],
    });
    expect(footerCells).toEqual(['الإجمالي', '25.00']);
  });

  it('footerCells is null when footerRow is not provided', () => {
    const rows = [{ name: 'برغر', total: '25.00' }];
    const { footerCells } = simulateTable({ columns: COLS, rows, footerRow: null });
    expect(footerCells).toBeNull();
  });
});

// ── Legacy takeaway row in reports by-type section ─────────────────

describe('reports by-type: takeaway row visibility', () => {
  const TYPE_LABELS = { dine_in: 'محلي', takeaway: 'سفري (قديم)', delivery: 'توصيل' };

  function makeByTypeRows(byType) {
    return Object.entries(TYPE_LABELS)
      .filter(([type]) => type !== 'takeaway' || (byType[type] ?? 0) > 0)
      .map(([type, label]) => ({ label, value: String(byType[type] ?? 0) }));
  }

  it('omits takeaway row when count is 0', () => {
    const rows = makeByTypeRows({ dine_in: 5000, takeaway: 0, delivery: 3000 });
    expect(rows.map(r => r.label)).not.toContain('سفري (قديم)');
    expect(rows).toHaveLength(2); // only dine_in and delivery
  });

  it('includes takeaway row when legacy orders exist', () => {
    const rows = makeByTypeRows({ dine_in: 5000, takeaway: 2500, delivery: 3000 });
    expect(rows.map(r => r.label)).toContain('سفري (قديم)');
    expect(rows).toHaveLength(3);
  });

  it('shows correct value for legacy takeaway', () => {
    const rows = makeByTypeRows({ dine_in: 5000, takeaway: 1500, delivery: 3000 });
    const tw = rows.find(r => r.label === 'سفري (قديم)');
    expect(tw).toBeTruthy();
    expect(tw.value).toBe('1500');
  });

  it('total excludes takeaway when it is zero', () => {
    const rows = makeByTypeRows({ dine_in: 5000, takeaway: 0, delivery: 3000 });
    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    expect(total).toBe(8000); // 5000 + 3000
  });
});
