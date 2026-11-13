/**
 * Tests for date helpers:
 * - fmtDate, fmtDateTime (src/utils/money.js + electron/utils/dates.js)
 * - DD/MM/YYYY format, Latin digits only
 * - Edge cases: 31/12, 29/02 leap day, invalid dates
 * - localISODate / parseISODate local-time helpers
 */
import { describe, it, expect } from 'vitest';
import { fmtDate, fmtDateTime } from '../src/utils/money.js';
import {
  fmtDate as fmtDateMain,
  formatDisplay,
  today,
  nowIso,
  localISODate,
  parseISODate,
} from '../electron/utils/dates.js';

describe('fmtDate (renderer)', () => {
  it('formats YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(fmtDate('2026-12-25')).toBe('25/12/2026');
  });

  it('formats 31/12', () => {
    expect(fmtDate('2025-12-31')).toBe('31/12/2025');
  });

  it('formats 01/01', () => {
    expect(fmtDate('2025-01-01')).toBe('01/01/2025');
  });

  it('uses Latin digits (no Arabic-Indic)', () => {
    const result = fmtDate('2026-06-15');
    expect(result).toMatch(/^[0-9/]+$/);
  });

  it('returns empty for empty input', () => {
    expect(fmtDate('')).toBe('');
    expect(fmtDate(null)).toBe('');
  });
});

describe('fmtDateTime (renderer)', () => {
  it('formats ISO datetime → DD/MM/YYYY HH:mm', () => {
    // Use a fixed UTC offset to avoid TZ issues - parse the result structurally
    const iso = '2026-12-25T14:30:00.000Z';
    const result = fmtDateTime(iso);
    // Should be DD/MM/YYYY HH:mm
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('uses Latin digits only', () => {
    const result = fmtDateTime('2025-06-15T09:05:00.000Z');
    expect(result).toMatch(/^[0-9/: ]+$/);
  });
});

describe('fmtDate (main process)', () => {
  it('formats YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(fmtDateMain('2026-12-25')).toBe('25/12/2026');
  });

  it('handles ISO datetime by taking date part', () => {
    expect(fmtDateMain('2026-12-25T10:00:00.000Z')).toBe('25/12/2026');
  });

  it('formats 29/02 leap day', () => {
    expect(fmtDateMain('2024-02-29')).toBe('29/02/2024');
  });
});

describe('formatDisplay (main process dates.js)', () => {
  it('formats ISO datetime as DD/MM/YYYY HH:mm', () => {
    const result = formatDisplay('2026-06-15T14:30:00.000Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('uses Latin digits', () => {
    const result = formatDisplay('2025-01-31T08:05:00.000Z');
    expect(result).toMatch(/^[0-9/: ]+$/);
  });
});

describe('today / nowIso', () => {
  it('today() returns YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nowIso() returns valid ISO string', () => {
    const iso = nowIso();
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});

describe('localISODate', () => {
  it('formats a known local date correctly', () => {
    // Construct a local midnight date (not UTC)
    const d = new Date(2026, 10, 12); // Nov 12, 2026 local midnight
    expect(localISODate(d)).toBe('2026-11-12');
  });

  it('without argument returns today in YYYY-MM-DD', () => {
    expect(localISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('never returns UTC date at local midnight UTC+1 offset', () => {
    // Simulate: local date is Nov 13, UTC date is still Nov 12 (00:00 local = 23:00 UTC Nov 12)
    // localISODate with explicit local Date returns the local date
    const localMidnight = new Date(2026, 10, 13, 0, 0, 0); // Nov 13 local
    expect(localISODate(localMidnight)).toBe('2026-11-13');
    // toISOString() on this Date would give a different UTC date depending on TZ
    // but localISODate always uses getFullYear/getMonth/getDate
    const result = localISODate(localMidnight);
    expect(result).toMatch(/^2026-11-/);
  });

  it('handles end-of-year correctly', () => {
    const d = new Date(2025, 11, 31); // Dec 31, 2025 local
    expect(localISODate(d)).toBe('2025-12-31');
  });
});

describe('parseISODate', () => {
  it('parses YYYY-MM-DD as local midnight Date', () => {
    const d = parseISODate('2026-11-12');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);  // 0-indexed
    expect(d.getDate()).toBe(12);
  });

  it('round-trips with localISODate', () => {
    const iso = '2024-02-29';
    expect(localISODate(parseISODate(iso))).toBe(iso);
  });

  it('does NOT create a UTC midnight Date (avoids +1 day on UTC parse)', () => {
    const d = parseISODate('2026-01-01');
    // Local date components should be Jan 1
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
  });
});
