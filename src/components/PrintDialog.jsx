import React, { useState } from 'react';
import ar from '../i18n/ar.js';
import { printReceipt, printSaveAsPdf } from '../api/index.js';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import styles from './PrintDialog.module.css';

/**
 * Reusable print-choice dialog used after every order action.
 *
 * Props:
 *   open           – boolean
 *   orderId        – number
 *   isModified     – boolean (show "طلب معدّل" stamp)
 *   isCancellation – boolean (show cancellation receipt only)
 *   onDone         – callback after any choice (including skip)
 */
export default function PrintDialog({
  open,
  orderId,
  isModified = false,
  isCancellation = false,
  onDone,
}) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  async function choose(copies) {
    if (copies === 'none') { onDone(); return; }
    setBusy(true);
    setError('');
    const res = await printReceipt({ orderId, copies, isModified, isCancellation });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? ar.printError);
      return;
    }
    onDone();
  }

  async function savePdf() {
    setBusy(true);
    setError('');
    const res = await printSaveAsPdf({ orderId, isModified, isCancellation });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? ar.unknownError);
      return;
    }
    // saved: false means user cancelled the save dialog – that's fine
    onDone();
  }

  return (
    <Modal
      open={open}
      title={ar.printDialogTitle}
      onClose={() => !busy && onDone()}
      size="sm"
    >
      <div className={styles.opts}>
        {isCancellation ? (
          /* ── Cancellation: only one print option ── */
          <Button fullWidth size="lg" onClick={() => choose('customer')} disabled={busy}>
            <Icon name="print" size={18} /> {ar.printCancellationReceipt}
          </Button>
        ) : (
          /* ── Normal / modified: all options ── */
          <>
            <Button fullWidth size="lg" onClick={() => choose('both')} disabled={busy}>
              <Icon name="print" size={18} /> {ar.printBoth}
            </Button>
            <Button fullWidth size="lg" variant="secondary" onClick={() => choose('customer')} disabled={busy}>
              <Icon name="receipt" size={18} /> {ar.printCustomer}
            </Button>
            <Button fullWidth size="lg" variant="secondary" onClick={() => choose('kitchen')} disabled={busy}>
              <Icon name="kitchen" size={18} /> {ar.printKitchen}
            </Button>
          </>
        )}

        {/* PDF save – always available */}
        <Button fullWidth size="lg" variant="ghost" onClick={savePdf} disabled={busy}>
          <Icon name="download" size={18} /> {ar.saveAsPdf}
        </Button>

        <Button fullWidth variant="ghost" onClick={() => choose('none')} disabled={busy}>
          {ar.printNothing}
        </Button>

        {error && <p className={styles.error}>{error}</p>}
        {busy  && <p className={styles.hint}>{ar.loading}</p>}
      </div>
    </Modal>
  );
}
