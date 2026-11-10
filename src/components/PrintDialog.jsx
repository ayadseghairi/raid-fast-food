import React, { useState, useEffect, useCallback, useRef } from 'react';
import ar from '../i18n/ar.js';
import {
  printListPrinters, printPreviewHtml, printRun, printSavePdf,
  settingsGet, settingsSet,
} from '../api/index.js';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import styles from './PrintDialog.module.css';

// ── Paper width options ────────────────────────────────────────────
const PAPER_OPTS = [
  { value: '80',  label: ar.paper80mm },
  { value: '58',  label: ar.paper58mm },
  { value: '210', label: ar.paperA4   },
];

// ── Copy tabs ─────────────────────────────────────────────────────
const COPY_TABS_NORMAL = [
  { value: 'customer',  label: ar.printTabCustomer },
  { value: 'kitchen',   label: ar.printTabKitchen  },
];
const COPY_TABS_CANCELLATION = [
  { value: 'cancellation', label: ar.printCancellationReceipt },
];

/**
 * Full-featured print dialog with in-app receipt preview.
 *
 * Props:
 *   open           – boolean
 *   orderId        – number
 *   isModified     – boolean
 *   isCancellation – boolean
 *   onDone         – () => void   called after any final action or skip
 */
export default function PrintDialog({
  open,
  orderId,
  isModified     = false,
  isCancellation = false,
  onDone,
}) {
  // ── UI state ───────────────────────────────────────────────────
  const tabs           = isCancellation ? COPY_TABS_CANCELLATION : COPY_TABS_NORMAL;
  const [activeTab,    setActiveTab]    = useState(tabs[0].value);
  const [printers,     setPrinters]     = useState([]);
  const [printer,      setPrinter]      = useState('');
  const [paperWidth,   setPaperWidth]   = useState('80');
  const [showVirtual,  setShowVirtual]  = useState(true);
  const [previewHtml,  setPreviewHtml]  = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState('');
  const [successMsg,   setSuccessMsg]   = useState('');
  const iframeRef = useRef(null);

  // ── Load printers + settings on open ─────────────────────────
  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccessMsg('');

    async function init() {
      const [pRes, sRes] = await Promise.all([
        printListPrinters(),
        settingsGet(),
      ]);
      if (pRes.ok) {
        setPrinters(pRes.data);
        // Pre-select the saved printer
        const saved = sRes.ok ? (sRes.data.printer_name ?? '') : '';
        setPrinter(saved || (pRes.data.find(p => p.isDefault)?.name ?? ''));
      }
      if (sRes.ok) {
        setPaperWidth(sRes.data.paper_width ?? '80');
        setShowVirtual((sRes.data.show_virtual_printers ?? '1') !== '0');
      }
    }
    init();
  }, [open]);

  // ── Load preview HTML whenever tab or paper width changes ─────
  const loadPreview = useCallback(async () => {
    if (!open || !orderId) return;
    setPreviewReady(false);

    // For "both" we show combined (customer + kitchen)
    const copy = activeTab === 'customer' && !isCancellation
      ? 'customer'
      : activeTab === 'kitchen'
        ? 'kitchen'
        : isCancellation ? 'cancellation' : 'customer';

    const res = await printPreviewHtml({
      orderId,
      copy,
      widthMm:    Number(paperWidth),
      isModified,
    });

    if (res.ok) {
      setPreviewHtml(res.data.html);
    } else {
      setError(res.error ?? ar.unknownError);
    }
  }, [open, orderId, activeTab, paperWidth, isModified, isCancellation]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // When iframe loads its content mark it ready
  function handleIframeLoad() {
    setPreviewReady(true);
  }

  // ── Filtered printer list ─────────────────────────────────────
  const visiblePrinters = showVirtual
    ? printers
    : printers.filter(p => !p.isVirtual);

  // ── Actions ───────────────────────────────────────────────────
  async function handlePrint(silent = true) {
    if (!printer) { setError(ar.noPrinterSelected); return; }
    setBusy(true);
    setError('');
    setSuccessMsg('');

    const copy = isCancellation
      ? 'cancellation'
      : activeTab === 'kitchen' ? 'kitchen' : 'both';

    const res = await printRun({
      orderId,
      copy,
      deviceName:     printer,
      widthMm:        Number(paperWidth),
      silent,
      isModified,
      isCancellation,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? ar.printFailed);
      return;
    }
    setSuccessMsg(ar.printSuccess);
    // Persist printer choice + paper width
    await settingsSet({ printer_name: printer, paper_width: paperWidth });
    setTimeout(onDone, 800);
  }

  async function handleSavePdf() {
    setBusy(true);
    setError('');
    setSuccessMsg('');

    const res = await printSavePdf({
      orderId,
      widthMm:        Number(paperWidth),
      isModified,
      isCancellation,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? ar.unknownError);
      return;
    }
    if (res.data?.saved) {
      setSuccessMsg(`${ar.pdfSavedAt} ${res.data.filePath ?? ''}`);
      setTimeout(onDone, 1200);
    } else {
      // User cancelled save dialog – stay open
    }
  }

  async function toggleShowVirtual() {
    const next = !showVirtual;
    setShowVirtual(next);
    await settingsSet({ show_virtual_printers: next ? '1' : '0' });
    // If currently selected printer is virtual and we hide virtuals, deselect
    if (!next && printers.find(p => p.name === printer)?.isVirtual) {
      setPrinter(printers.find(p => !p.isVirtual)?.name ?? '');
    }
  }

  // ── Preview paper width style ─────────────────────────────────
  const previewWidth = paperWidth === '210' ? '210mm' : `${paperWidth}mm`;

  // ── Render ────────────────────────────────────────────────────
  return (
    <Modal
      open={open}
      title={ar.printPreviewTitle}
      onClose={() => !busy && onDone()}
      size="xl"
    >
      <div className={styles.layout}>

        {/* ── Left: preview ──────────────────────────────── */}
        <div className={styles.previewCol}>
          {/* Copy tabs */}
          {!isCancellation && (
            <div className={styles.tabs}>
              {COPY_TABS_NORMAL.map(t => (
                <button
                  key={t.value}
                  className={`${styles.tab} ${activeTab === t.value ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Receipt preview iframe */}
          <div className={styles.previewWrap}>
            {!previewReady && (
              <div className={styles.previewLoading}>{ar.previewLoading}</div>
            )}
            <div
              className={styles.paperStrip}
              style={{ width: previewWidth }}
            >
              <iframe
                ref={iframeRef}
                className={styles.previewFrame}
                title="receipt-preview"
                sandbox="allow-same-origin allow-scripts"
                srcDoc={previewHtml}
                onLoad={handleIframeLoad}
                style={{ width: previewWidth, opacity: previewReady ? 1 : 0 }}
              />
            </div>
          </div>
        </div>

        {/* ── Right: controls ────────────────────────────── */}
        <div className={styles.controlsCol}>

          {/* Printer select */}
          <div className={styles.field}>
            <label className={styles.label}>{ar.printerLabel}</label>
            <div className={styles.printerRow}>
              <select
                className={styles.select}
                value={printer}
                onChange={e => setPrinter(e.target.value)}
                disabled={busy}
              >
                <option value="">{ar.selectPrinter}</option>
                {visiblePrinters.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                    {p.isDefault ? ` ★` : ''}
                    {p.isVirtual  ? ` (${ar.virtualBadge})` : ''}
                  </option>
                ))}
              </select>
              <button
                className={styles.refreshBtn}
                onClick={async () => {
                  const r = await printListPrinters();
                  if (r.ok) setPrinters(r.data);
                }}
                disabled={busy}
                title={ar.search}
              >
                <Icon name="refresh" size={16} />
              </button>
            </div>

            {/* Show virtual toggle */}
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={showVirtual}
                onChange={toggleShowVirtual}
                disabled={busy}
              />
              <span>{ar.showVirtualPrinters}</span>
            </label>
          </div>

          {/* Paper width */}
          <div className={styles.field}>
            <label className={styles.label}>{ar.paperWidthLabel}</label>
            <div className={styles.radioRow}>
              {PAPER_OPTS.map(opt => (
                <label key={opt.value} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="paperWidth"
                    value={opt.value}
                    checked={paperWidth === opt.value}
                    onChange={() => setPaperWidth(opt.value)}
                    disabled={busy}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Error / success */}
          {error      && <p className={styles.error}>{error}</p>}
          {successMsg && <p className={styles.success}>{successMsg}</p>}

          {/* Action buttons */}
          <div className={styles.actions}>
            <Button
              fullWidth
              size="lg"
              onClick={() => handlePrint(true)}
              disabled={busy || !printer}
            >
              <Icon name="print" size={18} /> {ar.printBtn}
            </Button>

            <Button
              fullWidth
              size="lg"
              variant="secondary"
              onClick={() => handlePrint(false)}
              disabled={busy}
            >
              <Icon name="print" size={18} /> {ar.systemPrintDialog}
            </Button>

            <Button
              fullWidth
              size="lg"
              variant="ghost"
              onClick={handleSavePdf}
              disabled={busy}
            >
              <Icon name="download" size={18} /> {ar.saveAsPdf}
            </Button>

            <Button
              fullWidth
              variant="ghost"
              onClick={onDone}
              disabled={busy}
            >
              {ar.cancel}
            </Button>
          </div>

          {busy && <p className={styles.hint}>{ar.loading}</p>}
        </div>
      </div>
    </Modal>
  );
}
