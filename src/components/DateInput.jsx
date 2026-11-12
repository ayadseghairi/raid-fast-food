import React, { useState, useRef, useEffect } from 'react';
import styles from './DateInput.module.css';

/**
 * DateInput – masked DD/MM/YYYY text input with small calendar popover.
 * Always uses DD/MM/YYYY format with Latin digits (never MM/DD/YYYY).
 * Replaces native <input type="date"> which follows Windows regional settings.
 *
 * Props:
 *   value      {string}  – YYYY-MM-DD (ISO) or '' for empty
 *   onChange   {fn}      – called with YYYY-MM-DD string when valid, or '' when cleared
 *   label?     {string}
 *   disabled?  {boolean}
 *   min?       {string}  – ISO YYYY-MM-DD
 *   max?       {string}  – ISO YYYY-MM-DD
 */
export default function DateInput({ value, onChange, label, disabled, min, max }) {
  // Internal display string in DD/MM/YYYY format
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => {
    if (value) return Number(value.slice(0, 4));
    return new Date().getFullYear();
  });
  const [calMonth, setCalMonth] = useState(() => {
    if (value) return Number(value.slice(5, 7)) - 1;
    return new Date().getMonth();
  });

  const containerRef = useRef(null);

  // Sync display when value prop changes externally
  useEffect(() => {
    setDisplay(isoToDisplay(value));
    if (value) {
      setCalYear(Number(value.slice(0, 4)));
      setCalMonth(Number(value.slice(5, 7)) - 1);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleTextChange(e) {
    let raw = e.target.value.replace(/[^\d/]/g, '');
    // Auto-insert slashes
    if (raw.length === 2 && display.length === 1) raw += '/';
    if (raw.length === 5 && display.length === 4) raw += '/';
    setDisplay(raw);

    const iso = displayToIso(raw);
    if (iso && isValidDate(iso) && !isOutOfRange(iso, min, max)) {
      onChange(iso);
      setCalYear(Number(iso.slice(0, 4)));
      setCalMonth(Number(iso.slice(5, 7)) - 1);
    } else if (!raw) {
      onChange('');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); e.preventDefault(); }
  }

  function pickDay(d) {
    const iso = toIso(calYear, calMonth + 1, d);
    if (isOutOfRange(iso, min, max)) return;
    onChange(iso);
    setDisplay(isoToDisplay(iso));
    setOpen(false);
  }

  // ── Calendar grid ──────────────────────────────────────────────
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedDay = value ? Number(value.slice(8, 10)) : null;
  const selectedMonthYear = value ? value.slice(0, 7) : null;
  const calMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.container} ref={containerRef}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          value={display}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="DD/MM/YYYY"
          disabled={disabled}
          maxLength={10}
          dir="ltr"
        />
        <button
          type="button"
          className={styles.calBtn}
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          tabIndex={-1}
          aria-label="فتح التقويم"
        >
          📅
        </button>
      </div>

      {open && (
        <div className={styles.popover}>
          {/* Month navigation */}
          <div className={styles.calHeader}>
            <button type="button" className={styles.navBtn} onClick={() => {
              if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
              else setCalMonth(m => m - 1);
            }}>&#8250;</button>
            <span className={styles.calTitle}>
              {MONTH_NAMES_AR[calMonth]} {calYear}
            </span>
            <button type="button" className={styles.navBtn} onClick={() => {
              if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
              else setCalMonth(m => m + 1);
            }}>&#8249;</button>
          </div>

          {/* Day-of-week headers (Sun=أح to Sat=س) */}
          <div className={styles.calGrid}>
            {DAY_NAMES_AR.map(d => (
              <div key={d} className={styles.dayHeader}>{d}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`e-${i}`} />;
              const iso = toIso(calYear, calMonth + 1, d);
              const isSelected = selectedMonthYear === calMonthStr && selectedDay === d;
              const isToday = iso === todayIso;
              const disabled2 = isOutOfRange(iso, min, max);
              return (
                <button
                  key={d}
                  type="button"
                  className={`${styles.day} ${isSelected ? styles.daySelected : ''} ${isToday ? styles.dayToday : ''} ${disabled2 ? styles.dayDisabled : ''}`}
                  onClick={() => !disabled2 && pickDay(d)}
                  disabled={disabled2}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div className={styles.calFooter}>
            <button
              type="button"
              className={styles.todayBtn}
              onClick={() => { const t = new Date().toISOString().slice(0,10); onChange(t); setDisplay(isoToDisplay(t)); setCalYear(Number(t.slice(0,4))); setCalMonth(Number(t.slice(5,7))-1); setOpen(false); }}
            >
              اليوم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

const MONTH_NAMES_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAY_NAMES_AR   = ['أح','إث','ثل','أر','خم','جم','سب'];

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
function isoToDisplay(iso) {
  if (!iso || iso.length < 10) return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** 'DD/MM/YYYY' → 'YYYY-MM-DD' or null */
function displayToIso(display) {
  if (!display || display.length !== 10) return null;
  const parts = display.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** True if the ISO date is a real calendar date. */
function isValidDate(iso) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function isOutOfRange(iso, min, max) {
  if (min && iso < min) return true;
  if (max && iso > max) return true;
  return false;
}

function toIso(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
