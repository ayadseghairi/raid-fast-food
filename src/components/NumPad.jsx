import React, { useEffect, useRef } from 'react';
import styles from './NumPad.module.css';

/**
 * On-screen numeric keypad.
 * Also listens to keyboard events when focused so the user can type with
 * the physical keyboard in addition to clicking the on-screen buttons.
 *
 * @param {object} props
 * @param {string} props.value – current input value (string)
 * @param {Function} props.onChange – called with new string value
 * @param {boolean} [props.decimal] – allow decimal point
 */
export default function NumPad({ value = '', onChange, decimal = true }) {
  const padRef = useRef(null);

  // ── Keyboard support ────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e) {
      // Only handle if no text input is currently focused
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        press(e.key);
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        press('.');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('⌫');
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        press('C');
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }); // re-run every render so `press` closure uses fresh `value`

  const press = (key) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === 'C') {
      onChange('');
      return;
    }
    if (key === '.' && !decimal) return;
    if (key === '.' && value.includes('.')) return;
    if (value === '0' && key !== '.') {
      onChange(key);
      return;
    }
    // Max 8 digits + 2 decimal places
    const [intPart, decPart] = (value + key).split('.');
    if (intPart.length > 8) return;
    if (decPart && decPart.length > 2) return;
    onChange(value + key);
  };

  const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', decimal ? '.' : '⌫', '⌫'];

  return (
    <div className={styles.pad} ref={padRef}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={`${styles.key} ${key === 'C' ? styles.clear : ''} ${key === '⌫' ? styles.backspace : ''}`}
          onClick={() => press(key)}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
