import React from 'react';
import styles from './NumPad.module.css';

/**
 * On-screen numeric keypad.
 * @param {object} props
 * @param {string} props.value – current input value (string)
 * @param {Function} props.onChange – called with new string value
 * @param {boolean} [props.decimal] – allow decimal point
 */
export default function NumPad({ value = '', onChange, decimal = true }) {
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
    <div className={styles.pad}>
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
