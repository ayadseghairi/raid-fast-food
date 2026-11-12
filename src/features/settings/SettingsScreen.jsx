import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  settingsGet,
  settingsSet,
  settingsOpenLogsFolder,
  printGetPrinters,
  printTestPrint,
  authChangePassword,
  backupChooseFolder,
  backupNow,
  backupRestore,
  backupList,
  dataClearTransactions,
  dataClearAll,
} from '../../api/index.js';
import { toMinor, fromMinor } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';
import NumPad from '../../components/NumPad.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Icon from '../../components/Icon.jsx';
import styles from './SettingsScreen.module.css';

// ── Section wrapper ─────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export default function SettingsScreen() {
  // ── State ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState({ type: '', text: '' });

  // Restaurant info
  const [restName,  setRestName]  = useState('');
  const [restPhone, setRestPhone] = useState('');
  const [thankYou,  setThankYou]  = useState('');
  const [feeValue,  setFeeValue]  = useState('0');
  const [feeModal,  setFeeModal]  = useState(false);

  // Printer
  const [printers,     setPrinters]     = useState([]);
  const [printerName,  setPrinterName]  = useState('');
  const [paperWidth,   setPaperWidth]   = useState('80');
  const [loadingPrint,   setLoadingPrint]   = useState(false);
  const [testPrinting,   setTestPrinting]   = useState(false);

  // Change password
  const [pwModal,   setPwModal]   = useState(false);
  const [curPw,     setCurPw]     = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError,   setPwError]   = useState('');
  const [pwBusy,    setPwBusy]    = useState(false);

  // Backup
  const [backupFolder,    setBackupFolder]    = useState('');
  const [backupBusy,      setBackupBusy]      = useState(false);
  const [restoreBusy,     setRestoreBusy]     = useState(false);
  const [confirmRestore,  setConfirmRestore]  = useState(false);
  const [restoreFile,     setRestoreFile]     = useState(null);  // {path, isEncrypted}
  const [restorePwModal,  setRestorePwModal]  = useState(false);
  const [restorePw,       setRestorePw]       = useState('');
  const [restorePwError,  setRestorePwError]  = useState('');
  const [encPwModal,      setEncPwModal]      = useState(false);
  const [encPw,           setEncPw]           = useState('');
  const [encPwError,      setEncPwError]      = useState('');
  const [backupFiles,     setBackupFiles]     = useState([]);

  // Danger zone
  const [dangerModal,  setDangerModal]  = useState(false);
  const [dangerType,   setDangerType]   = useState('');   // 'transactions' | 'all'
  const [dangerPw,     setDangerPw]     = useState('');
  const [dangerBusy,   setDangerBusy]   = useState(false);
  const [dangerError,  setDangerError]  = useState('');

  // ── Load settings ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const res = await settingsGet();
    if (res.ok) {
      const d = res.data;
      setRestName(d.restaurant_name ?? '');
      setRestPhone(d.restaurant_phone ?? '');
      setThankYou(d.thank_you_message ?? ar.thankYouDefault);
      setFeeValue(fromMinor(Number(d.delivery_fee_default ?? 0)).toString());
      setPrinterName(d.printer_name ?? '');
      setPaperWidth(d.paper_width ?? '80');
      setBackupFolder(d.backup_folder ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load backup file list when folder changes
  useEffect(() => {
    if (!backupFolder) { setBackupFiles([]); return; }
    backupList().then(r => { if (r.ok) setBackupFiles(r.data ?? []); });
  }, [backupFolder]);

  // ── Flash message helpers ──────────────────────────────────────
  const flash = (text, type = 'success') => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 3500);
  };

  // ── Load printers list ─────────────────────────────────────────
  async function loadPrinters() {
    setLoadingPrint(true);
    const res = await printGetPrinters();
    if (res.ok) setPrinters(res.data);
    setLoadingPrint(false);
  }

  // ── Save restaurant settings ───────────────────────────────────
  async function saveRestaurant() {
    setSaving(true);
    const res = await settingsSet({
      restaurant_name:      restName.trim(),
      restaurant_phone:     restPhone.trim(),
      thank_you_message:    thankYou.trim(),
      delivery_fee_default: toMinor(feeValue),
    });
    setSaving(false);
    res.ok ? flash(ar.success) : flash(res.error ?? ar.unknownError, 'error');
  }

  // ── Save printer settings ──────────────────────────────────────
  async function savePrinter() {
    setSaving(true);
    const res = await settingsSet({
      printer_name: printerName,
      paper_width:  paperWidth,
    });
    setSaving(false);
    res.ok ? flash(ar.printerSaved) : flash(res.error ?? ar.unknownError, 'error');
  }

  // ── Change password ────────────────────────────────────────────
  async function changePassword() {
    setPwError('');
    if (!curPw.trim())      { setPwError(ar.required); return; }
    if (!newPw.trim())      { setPwError(ar.required); return; }
    if (newPw !== confirmPw){ setPwError(ar.passwordMismatch); return; }
    setPwBusy(true);
    const res = await authChangePassword(curPw, newPw);
    setPwBusy(false);
    if (res.ok) {
      setPwModal(false);
      setCurPw(''); setNewPw(''); setConfirmPw('');
      flash(ar.passwordChanged);
    } else {
      setPwError(res.error ?? ar.unknownError);
    }
  }

  // ── Backup: choose auto-backup folder ─────────────────────────
  async function chooseBackupFolder() {
    const res = await backupChooseFolder();
    if (!res.ok || !res.data?.path) return;
    const folder = res.data.path;
    setBackupFolder(folder);
    await settingsSet({ backup_folder: folder });
    flash(ar.success);
    const listRes = await backupList();
    if (listRes.ok) setBackupFiles(listRes.data ?? []);
  }

  // ── Backup: encrypted USB backup ──────────────────────────────
  function startEncryptedBackup() {
    setEncPw('');
    setEncPwError('');
    setEncPwModal(true);
  }

  async function doEncryptedBackup() {
    if (!encPw.trim()) { setEncPwError(ar.required); return; }
    setEncPwError('');
    setBackupBusy(true);
    setEncPwModal(false);
    const res = await backupNow(encPw);
    setBackupBusy(false);
    setEncPw('');
    if (!res.ok) return flash(res.error ?? ar.backupError, 'error');
    if (!res.data.saved) return;
    flash(ar.backupSuccess);
  }

  // ── Backup: restore ───────────────────────────────────────────
  // Two-step restore: pick file first (open dialog in main), then ask for password
  async function pickRestoreFile() {
    // We call backup:restore with filePath=null to open the dialog in main process
    // For encrypted files the service needs a password — handled in the IPC:
    // if password is missing it throws AppError, which becomes { ok:false, error }
    setRestoreBusy(true);
    const res = await backupRestore(null, null);
    setRestoreBusy(false);

    if (!res.ok) {
      // If it's the "needs password" error, prompt for it
      if (res.error && res.error.includes('كلمة مرور')) {
        setRestoreFile({ path: null });
        setRestorePw('');
        setRestorePwError('');
        setRestorePwModal(true);
      } else if (res.error) {
        flash(res.error, 'error');
      }
      // If done:false it was just a cancel — no error
      return;
    }
    // done:true — app will quit, no UI update needed
  }

  async function doRestoreWithPassword() {
    if (!restorePw.trim()) { setRestorePwError(ar.required); return; }
    setRestorePwError('');
    setRestorePwModal(false);
    setRestoreBusy(true);
    const res = await backupRestore(null, restorePw);
    setRestoreBusy(false);
    setRestorePw('');
    if (!res.ok) return flash(res.error ?? ar.unknownError, 'error');
    flash(ar.restoreSuccess);
  }

  // ── Danger zone ───────────────────────────────────────────────
  function openDanger(type) {
    setDangerType(type);
    setDangerPw('');
    setDangerError('');
    setDangerModal(true);
  }

  async function executeDanger() {
    if (!dangerPw.trim()) { setDangerError(ar.required); return; }
    setDangerError('');
    setDangerBusy(true);
    const fn = dangerType === 'all' ? dataClearAll : dataClearTransactions;
    const res = await fn(dangerPw);
    setDangerBusy(false);
    if (!res.ok) { setDangerError(res.error ?? ar.unknownError); return; }
    setDangerModal(false);
    flash(ar.success);
    load();
  }

  async function restoreFromAutoBackup(filePath) {
    setConfirmRestore(false);
    setRestoreBusy(true);
    const res = await backupRestore(filePath, null);
    setRestoreBusy(false);
    if (!res.ok) flash(res.error ?? ar.unknownError, 'error');
    // on success app quits
  }

  if (loading) return <div className={styles.loading}>{ar.loading}</div>;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>{ar.settingsTitle}</h2>

      {msg.text && (
        <div className={`${styles.banner} ${styles[msg.type]}`}>{msg.text}</div>
      )}

      {/* ── Restaurant info ───────────────────────────────────── */}
      <Section title={ar.restaurantSettings}>
        <div className={styles.formGrid}>
          <FormField label={ar.restaurantName}>
            <input
              className={styles.input}
              value={restName}
              onChange={e => setRestName(e.target.value)}
            />
          </FormField>
          <FormField label={ar.restaurantPhone}>
            <input
              className={styles.input}
              value={restPhone}
              onChange={e => setRestPhone(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label={ar.thankYouMessage}>
            <input
              className={styles.input}
              value={thankYou}
              onChange={e => setThankYou(e.target.value)}
            />
          </FormField>
          <FormField label={ar.defaultDeliveryFee}>
            <button className={styles.feeBtn} onClick={() => setFeeModal(true)}>
              {feeValue} {ar.currency}
            </button>
          </FormField>
        </div>
        <div className={styles.actions}>
          <Button onClick={saveRestaurant} disabled={saving}>
            <Icon name="check" size={16} /> {ar.save}
          </Button>
        </div>
      </Section>

      {/* ── Printer settings ─────────────────────────────────── */}
      <Section title={ar.printerSettings}>
        <div className={styles.formGrid}>
          <FormField label={ar.printerName}>
            <div className={styles.printerRow}>
              <select
                className={styles.select}
                value={printerName}
                onChange={e => setPrinterName(e.target.value)}
              >
                <option value="">{ar.selectPrinter}</option>
                {printers.map(p => {
                  const name = typeof p === 'string' ? p : p.name;
                  const desc = typeof p === 'object' && p.description ? ` – ${p.description}` : '';
                  return <option key={name} value={name}>{name}{desc}</option>;
                })}
              </select>
              <Button variant="ghost" onClick={loadPrinters} disabled={loadingPrint}>
                <Icon name="refresh" size={16} />
              </Button>
            </div>
          </FormField>
          <FormField label={ar.paperWidth}>
            <div className={styles.radioRow}>
              {[['80', ar.paper80mm], ['58', ar.paper58mm]].map(([val, label]) => (
                <label key={val} className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="paperWidth"
                    value={val}
                    checked={paperWidth === val}
                    onChange={() => setPaperWidth(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </FormField>
        </div>
        <div className={styles.actions}>
          <Button onClick={savePrinter} disabled={saving}>
            <Icon name="check" size={16} /> {ar.save}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              setTestPrinting(true);
              const res = await printTestPrint({ deviceName: printerName || undefined });
              setTestPrinting(false);
              if (!res.ok) flash(res.error ?? ar.testPrintFailed, 'error');
              else         flash(ar.testPrintSuccess, 'success');
            }}
            disabled={testPrinting}
          >
            <Icon name="print" size={16} /> {ar.testPrint}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              setTestPrinting(true);
              const res = await printTestPrint({ savePdf: true });
              setTestPrinting(false);
              if (!res.ok)          flash(res.error ?? ar.unknownError, 'error');
              else if (res.data?.saved) flash(ar.pdfSaved, 'success');
            }}
            disabled={testPrinting}
          >
            {ar.testPrintSavePdf}
          </Button>
        </div>
      </Section>

      {/* ── Backup settings ───────────────────────────────────── */}
      <Section title={ar.backupSettings}>
        <p className={styles.hint}>{ar.autoBackupHint}</p>

        <FormField label={ar.backupFolder}>
          <div className={styles.folderRow}>
            <span className={styles.folderPath}>{backupFolder || '—'}</span>
            <Button variant="ghost" onClick={chooseBackupFolder}>
              <Icon name="folder" size={16} /> {ar.chooseFolder}
            </Button>
          </div>
        </FormField>

        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={startEncryptedBackup}
            disabled={backupBusy}
          >
            <Icon name="download" size={16} /> {ar.backupNow}
          </Button>
          <Button
            variant="secondary"
            onClick={pickRestoreFile}
            disabled={restoreBusy}
          >
            <Icon name="upload" size={16} /> {ar.restoreFromFile}
          </Button>
        </div>

        <p className={styles.hint}>{ar.backupEncryptedHint}</p>

        {/* List of auto backup files */}
        {backupFiles.length > 0 && (
          <div className={styles.backupList}>
            <p className={styles.backupListTitle}>{ar.existingBackups}</p>
            {backupFiles.map(f => (
              <div key={f.path} className={styles.backupItem}>
                <span className={styles.backupName}>{f.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRestoreFile(f);
                    setConfirmRestore(true);
                  }}
                >
                  <Icon name="restore" size={14} /> {ar.restoreBackup}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Security ─────────────────────────────────────────── */}
      <Section title={ar.changePassword}>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setPwModal(true)}>
            <Icon name="key" size={16} /> {ar.changePassword}
          </Button>
        </div>
      </Section>

      {/* ── About / version ─────────────────────────────────── */}
      <Section title="حول البرنامج">
        <div className={styles.aboutRow}>
          <span>{ar.appName}</span>
          <span className={styles.aboutVersion}>v1.1.0</span>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={async () => { await settingsOpenLogsFolder(); }}>
            {ar.openLogsFolder}
          </Button>
        </div>
      </Section>

      {/* ── Danger zone ──────────────────────────────────────── */}
      <section className={styles.dangerSection}>
        <h3 className={styles.dangerTitle}>{ar.dangerZone}</h3>
        <p className={styles.dangerHint}>{ar.dangerZoneHint}</p>
        <div className={styles.dangerActions}>
          <div className={styles.dangerCard}>
            <div className={styles.dangerCardText}>
              <span className={styles.dangerCardTitle}>{ar.clearTransactions}</span>
              <span className={styles.dangerCardDesc}>{ar.clearTransactionsDesc}</span>
            </div>
            <Button variant="danger" onClick={() => openDanger('transactions')}>
              {ar.clearTransactions}
            </Button>
          </div>
          <div className={styles.dangerCard}>
            <div className={styles.dangerCardText}>
              <span className={styles.dangerCardTitle}>{ar.clearAll}</span>
              <span className={styles.dangerCardDesc}>{ar.clearAllDesc}</span>
            </div>
            <Button variant="danger" onClick={() => openDanger('all')}>
              {ar.clearAll}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Delivery fee numpad ───────────────────────────────── */}
      <Modal open={feeModal} title={ar.defaultDeliveryFee} onClose={() => setFeeModal(false)} size="sm">
        <NumPad value={feeValue} onChange={setFeeValue} decimal />
        <div style={{ marginTop: 12 }}>
          <Button fullWidth onClick={() => setFeeModal(false)}>{ar.confirm}</Button>
        </div>
      </Modal>

      {/* ── Change password modal ─────────────────────────────── */}
      <Modal open={pwModal} title={ar.changePassword} onClose={() => { setPwModal(false); setPwError(''); }} size="sm">
        <div className={styles.pwForm}>
          <FormField label={ar.currentPassword}>
            <input
              type="password"
              className={styles.input}
              value={curPw}
              onChange={e => setCurPw(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <FormField label={ar.newPassword}>
            <input
              type="password"
              className={styles.input}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          <FormField label={ar.ownerPasswordConfirm}>
            <input
              type="password"
              className={styles.input}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          {pwError && <p className={styles.error}>{pwError}</p>}
          <Button fullWidth onClick={changePassword} disabled={pwBusy}>
            {pwBusy ? ar.loading : ar.save}
          </Button>
        </div>
      </Modal>

      {/* ── Encrypted backup password modal ──────────────────── */}
      <Modal
        open={encPwModal}
        title={ar.backupNow}
        onClose={() => { setEncPwModal(false); setEncPw(''); setEncPwError(''); }}
        size="sm"
      >
        <div className={styles.pwForm}>
          <p className={styles.hint}>{ar.backupEncryptedHint}</p>
          <FormField label={ar.backupPasswordPrompt}>
            <input
              type="password"
              className={styles.input}
              value={encPw}
              onChange={e => setEncPw(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          {encPwError && <p className={styles.error}>{encPwError}</p>}
          <Button fullWidth onClick={doEncryptedBackup}>{ar.confirm}</Button>
        </div>
      </Modal>

      {/* ── Restore password modal (for encrypted .raidbak files) */}
      <Modal
        open={restorePwModal}
        title={ar.restoreBackup}
        onClose={() => { setRestorePwModal(false); setRestorePw(''); setRestorePwError(''); }}
        size="sm"
      >
        <div className={styles.pwForm}>
          <FormField label={ar.ownerPassword}>
            <input
              type="password"
              className={styles.input}
              value={restorePw}
              onChange={e => setRestorePw(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          {restorePwError && <p className={styles.error}>{restorePwError}</p>}
          <Button fullWidth onClick={doRestoreWithPassword}>{ar.confirm}</Button>
        </div>
      </Modal>

      {/* ── Confirm restore dialog ────────────────────────────── */}
      <ConfirmDialog
        open={confirmRestore}
        message={ar.restoreConfirm}
        onConfirm={() => restoreFile && restoreFromAutoBackup(restoreFile.path)}
        onCancel={() => setConfirmRestore(false)}
      />

      {/* ── Danger zone confirm modal ─────────────────────────── */}
      <Modal
        open={dangerModal}
        title={dangerType === 'all' ? ar.clearAll : ar.clearTransactions}
        onClose={() => !dangerBusy && setDangerModal(false)}
        size="sm"
      >
        <div className={styles.pwForm}>
          <p className={styles.dangerWarning}>
            {dangerType === 'all' ? ar.clearAllConfirm : ar.clearTransactionsConfirm}
          </p>
          <FormField label={ar.dangerPasswordPrompt}>
            <input
              type="password"
              className={styles.input}
              value={dangerPw}
              onChange={e => setDangerPw(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          {dangerError && <p className={styles.error}>{dangerError}</p>}
          <Button variant="danger" fullWidth onClick={executeDanger} disabled={dangerBusy}>
            {dangerBusy ? ar.loading : ar.confirm}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
