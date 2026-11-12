import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  workersList, workersCreate, workersUpdate, workersSetActive,
  workersGetDailyEntry, workersSaveDailyPayments,
  workersSummaryForRange, workersDetailForRange,
} from '../../api/index.js';
import { format, toMinor, fromMinor, fmtDate } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import Modal from '../../components/Modal.jsx';
import FormField from '../../components/FormField.jsx';
import NumPad from '../../components/NumPad.jsx';
import DateInput from '../../components/DateInput.jsx';
import styles from './WorkersPayScreen.module.css';

function todayIso() { return new Date().toISOString().slice(0, 10); }

const TABS = ['daily', 'workers', 'summary'];
const TAB_LABELS = { daily: ar.dailyPayEntry, workers: ar.manageWorkers, summary: ar.workerSummary };

export default function WorkersPayScreen({ role }) {
  const [tab, setTab] = useState('daily');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>{ar.workersPayTitle}</h2>
      </div>
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {tab === 'daily'   && <DailyEntryTab role={role} />}
        {tab === 'workers' && <ManageWorkersTab role={role} />}
        {tab === 'summary' && <SummaryTab />}
      </div>
    </div>
  );
}

// ── Daily entry tab ────────────────────────────────────────────────
function DailyEntryTab() {
  const [date, setDate] = useState(todayIso());
  const [entries, setEntries] = useState([]);  // [{ worker_id, worker_name, amount (minor) }]
  const [numpadFor, setNumpadFor] = useState(null); // worker_id being edited
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!date) return;
    const res = await workersGetDailyEntry(date);
    if (res.ok) {
      setEntries(res.data.map(r => ({ ...r, amount: r.amount })));
    }
  }, [date]);

  useEffect(() => { load(); setMsg(''); }, [load]);

  function setAmount(workerId, amount) {
    setEntries(prev => prev.map(e => e.worker_id === workerId ? { ...e, amount } : e));
  }

  async function handleSave() {
    setBusy(true);
    setMsg('');
    const payments = entries.map(e => ({ worker_id: e.worker_id, amount: e.amount }));
    const res = await workersSaveDailyPayments(date, payments);
    setBusy(false);
    if (res.ok) setMsg(ar.paymentsSaved);
  }

  const total = entries.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className={styles.dailyWrap}>
      <div className={styles.datePicker}>
        <DateInput value={date} onChange={setDate} label={ar.dailyDate} />
      </div>

      {entries.length === 0 && (
        <p className={styles.noWorkers}>{ar.noData}</p>
      )}

      <div className={styles.workerList}>
        {entries.map(e => (
          <div key={e.worker_id} className={styles.workerRow}>
            <span className={styles.workerNameText}>{e.worker_name}</span>
            <button
              className={styles.amountBtn}
              onClick={() => setNumpadFor(e.worker_id)}
            >
              {format(e.amount)} {ar.currency}
            </button>
          </div>
        ))}
      </div>

      <div className={styles.dailyTotalRow}>
        <span>{ar.dailyTotal}</span>
        <span className={styles.dailyTotalAmt}>{format(total)} {ar.currency}</span>
      </div>

      {msg && <p className={styles.successMsg}>{msg}</p>}

      <Button fullWidth onClick={handleSave} disabled={busy || entries.length === 0}>
        {busy ? ar.loading : ar.savePayments}
      </Button>

      {/* NumPad modal for amount entry */}
      {numpadFor !== null && (
        <Modal
          open
          title={ar.workerPayAmount}
          onClose={() => setNumpadFor(null)}
          size="sm"
        >
          <NumPad
            value={String(fromMinor(entries.find(e => e.worker_id === numpadFor)?.amount ?? 0))}
            onChange={v => setAmount(numpadFor, toMinor(v))}
            decimal
          />
          <div style={{ marginTop: 12 }}>
            <Button fullWidth onClick={() => setNumpadFor(null)}>{ar.confirm}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Manage workers tab ─────────────────────────────────────────────
function ManageWorkersTab() {
  const [workers, setWorkers] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [editWorker, setEditWorker] = useState(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await workersList(false);
    if (res.ok) setWorkers(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) { setError(ar.required); return; }
    setBusy(true);
    const res = await workersCreate(newName.trim());
    setBusy(false);
    if (res.ok) { setAddModal(false); setNewName(''); setError(''); load(); }
    else setError(res.error);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editWorker?.name?.trim()) { setError(ar.required); return; }
    setBusy(true);
    const res = await workersUpdate(editWorker.id, editWorker.name);
    setBusy(false);
    if (res.ok) { setEditWorker(null); setError(''); load(); }
    else setError(res.error);
  }

  async function handleToggleActive(worker) {
    await workersSetActive(worker.id, !worker.active);
    load();
  }

  return (
    <div className={styles.workersManage}>
      <div className={styles.workersHeaderRow}>
        <span className={styles.workersCount}>{workers.length} {ar.workerName}</span>
        <Button size="sm" onClick={() => { setAddModal(true); setNewName(''); setError(''); }}>
          + {ar.addWorker}
        </Button>
      </div>

      <div className={styles.workerCards}>
        {workers.map(w => (
          <div key={w.id} className={`${styles.workerCard} ${!w.active ? styles.workerCardInactive : ''}`}>
            <span className={styles.workerCardName}>{w.name}</span>
            <div className={styles.workerCardActions}>
              <button className={styles.wCardBtn} onClick={() => { setEditWorker({ ...w }); setError(''); }}>
                {ar.edit}
              </button>
              <button
                className={`${styles.wCardBtn} ${w.active ? styles.wCardBtnDanger : styles.wCardBtnSuccess}`}
                onClick={() => handleToggleActive(w)}
              >
                {w.active ? ar.deactivateWorker : ar.reactivateWorker}
              </button>
            </div>
          </div>
        ))}
        {workers.length === 0 && <p className={styles.noWorkers}>{ar.noData}</p>}
      </div>

      {/* Add modal */}
      <Modal open={addModal} title={ar.addWorker} onClose={() => setAddModal(false)} size="sm">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label={ar.workerName}>
            <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          </FormField>
          {error && <p style={{ color: 'var(--color-danger)', margin: 0, fontSize: 14 }}>{error}</p>}
          <Button type="submit" disabled={busy}>{ar.save}</Button>
        </form>
      </Modal>

      {/* Edit modal */}
      {editWorker && (
        <Modal open title={ar.editWorker} onClose={() => setEditWorker(null)} size="sm">
          <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FormField label={ar.workerName}>
              <input value={editWorker.name} onChange={e => setEditWorker(w => ({ ...w, name: e.target.value }))} autoFocus />
            </FormField>
            {error && <p style={{ color: 'var(--color-danger)', margin: 0, fontSize: 14 }}>{error}</p>}
            <Button type="submit" disabled={busy}>{ar.save}</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Summary tab ────────────────────────────────────────────────────
function SummaryTab() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  });
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState([]);
  const [detail, setDetail] = useState(null);  // { worker, payments }

  async function load() {
    const res = await workersSummaryForRange(from, to);
    if (res.ok) setSummary(res.data);
  }

  useEffect(() => { if (from && to) load(); }, [from, to]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function showDetail(worker) {
    const res = await workersDetailForRange(worker.id, from, to);
    if (res.ok) setDetail(res.data);
  }

  const totalAll = summary.reduce((s, w) => s + w.total_paid, 0);

  return (
    <div className={styles.summaryWrap}>
      <div className={styles.summaryFilters}>
        <DateInput value={from} onChange={setFrom} label={ar.dateFrom} />
        <DateInput value={to} onChange={setTo} label={ar.dateTo} />
        <Button size="sm" onClick={load}>{ar.search}</Button>
      </div>

      <table className={styles.summaryTable}>
        <thead>
          <tr>
            <th>{ar.workerName}</th>
            <th>{ar.daysPaid}</th>
            <th>{ar.totalPaid}</th>
          </tr>
        </thead>
        <tbody>
          {summary.map(w => (
            <tr key={w.id} className={styles.summaryRow} onClick={() => showDetail(w)}>
              <td>{w.name}</td>
              <td>{w.days_paid}</td>
              <td>{format(w.total_paid)} {ar.currency}</td>
            </tr>
          ))}
          {summary.length > 0 && (
            <tr className={styles.summaryTotalRow}>
              <td colSpan={2}>{ar.total}</td>
              <td>{format(totalAll)} {ar.currency}</td>
            </tr>
          )}
          {summary.length === 0 && (
            <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16 }}>{ar.noData}</td></tr>
          )}
        </tbody>
      </table>

      {detail && (
        <Modal open title={`${ar.workerDayDetail} – ${detail.worker.name}`} onClose={() => setDetail(null)} size="sm">
          <table className={styles.detailTable}>
            <thead>
              <tr><th>{ar.expenseDate}</th><th>{ar.workerPayAmount}</th></tr>
            </thead>
            <tbody>
              {detail.payments.map(p => (
                <tr key={p.date}>
                  <td dir="ltr">{fmtDate(p.date)}</td>
                  <td>{format(p.amount)} {ar.currency}</td>
                </tr>
              ))}
              {detail.payments.length === 0 && (
                <tr><td colSpan={2} style={{ textAlign: 'center', padding: 12 }}>{ar.noData}</td></tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
