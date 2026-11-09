import React from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import ar from '../i18n/ar.js';
import styles from './ConfirmDialog.module.css';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.message
 * @param {Function} props.onConfirm
 * @param {Function} props.onCancel
 * @param {string} [props.confirmLabel]
 * @param {string} [props.confirmVariant]
 */
export default function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  confirmLabel = ar.confirm,
  confirmVariant = 'primary',
}) {
  return (
    <Modal open={open} title={ar.confirm} onClose={onCancel} size="sm">
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          {ar.cancel}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
