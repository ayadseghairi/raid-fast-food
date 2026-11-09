import React, { useEffect, useState } from 'react';
import styles from './Toast.module.css';

let _setToasts = null;

/**
 * Call this from anywhere to show a toast.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type]
 * @param {number} [duration] ms
 */
export function showToast(message, type = 'info', duration = 3500) {
  if (_setToasts) {
    const id = Date.now();
    _setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      _setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }
}

/** Mount this once at the app root. */
export function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;

  useEffect(() => () => { _setToasts = null; }, []);

  return (
    <div className={styles.container} dir="rtl">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Inline toast for local usage: <Toast message type onClose /> */
export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`${styles.toast} ${styles[type]}`} onClick={onClose}>
      {message}
    </div>
  );
}
