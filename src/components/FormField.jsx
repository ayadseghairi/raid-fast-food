import React from 'react';
import styles from './FormField.module.css';

/**
 * Labelled form field wrapper used across all forms.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.required]
 */
export default function FormField({ label, error, children, required = false }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      {children}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
