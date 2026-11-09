import React, { useEffect, useRef } from 'react';
import styles from './Modal.module.css';
import ar from '../i18n/ar.js';
import Icon from './Icon.jsx';

/**
 * Accessible modal dialog.
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {Function} props.onClose
 * @param {React.ReactNode} props.children
 * @param {string} [props.size] - 'sm' | 'md' | 'lg'
 */
export default function Modal({ open, title, onClose, children, size = 'md' }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdrop} role="dialog" aria-modal="true">
      <div
        className={`${styles.dialog} ${styles[size]}`}
        ref={dialogRef}
        tabIndex={-1}
        dir="rtl"
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label={ar.close}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
