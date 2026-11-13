import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  dayGetOpen,
  dayClose,
  dayReport,
  dayListClosed,
} from '../../api/index.js';
import { format, fmtDate } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Icon from '../../components/Icon.jsx';
import styles from './CloseDayScreen.module.css';

// ── Small helper ────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  return fmtDate(iso);
}
function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ── Stat card ───────────────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div className={`${styles.stat} ${accent ? styles.statAccent : ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

// ── Day report panel ────────────────────────────────────────────────
function DayReportPanel({ report }) {
  if (!report) return null;
  const { day, receiptCount, totalSales, totalExpenses, net, byType } = report;
  return (
    <div className={styles.reportPanel}>
      <div className={styles.reportMeta}>
        <span><Icon name="calendar" size={14} /> {formatDate(day.date)}</span>
        {day.closed_at && (
          <span><Icon name="time" size={14} /> {formatTime(day.closed_at)}</span>
        )}
      </div>
      <div className={styles.statsGrid}>
        <StatCard label={ar.receiptCount}    value={receiptCount} />
        <StatCard label={ar.totalSales}      value={`${format(totalSales)} ${ar.currency}`} accent />
        <StatCard label={ar.totalExpenses}   value={`${format(totalExpenses)} ${ar.currency}`} />
        <StatCard label={ar.netTotal}        value={`${format(net)} ${ar.currency}`} accent />
      </div>
      <div className={styles.byType}>
        <h4 className={styles.byTypeTitle}>{ar.salesByType}</h4>
        <div className={styles.byTypeRow}>
          <span>{ar.dineInSales}</span>
          <span>{format(byType.dine_in ?? 0)} {ar.currency}</span>
        </div>
        {/* Show legacy takeaway row only when old orders exist */}
        {(byType.takeaway ?? 0) > 0 && (
          <div className={styles.byTypeRow}>
            <span>{ar.takeawaySales}</span>
            <span>{format(byType.takeaway)} {ar.currency}</span>
          </div>
        )}
        <div className={styles.byTypeRow}>
          <span>{ar.deliverySales}</span>
          <span>{format(byType.delivery ?? 0)} {ar.currency}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ─────────────────────────────────────────────────────
export default function CloseDayScreen() {
  const [openDay,     setOpenDay]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');
  const [report,      setReport]      = useState(null);     // just-closed report
  const [closedDays,  setClosedDays]  = useState([]);
  const [expandDay,   setExpandDay]   = useState(null);     // expanded history row
  const [histReport,  setHistReport]  = useState({});       // dayId → report

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [dayRes, histRes] = await Promise.all([
      dayGetOpen(),
      dayListClosed(),
    ]);
    if (dayRes.ok)  setOpenDay(dayRes.data);
    if (histRes.ok) setClosedDays(histRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Close the day ──────────────────────────────────────────────
  async function handleClose() {
    setConfirmOpen(false);
    setBusy(true);
    setError('');
    const res = await dayClose();
    setBusy(false);
    if (res.ok) {
      setReport(res.data);
      setOpenDay(null);
      // Refresh history list
      const histRes = await dayListClosed();
      if (histRes.ok) setClosedDays(histRes.data);
    } else {
      setError(res.error ?? ar.unknownError);
    }
  }

  // ── Expand a history row and load its report ───────────────────
  async function toggleHistory(day) {
    if (expandDay === day.id) { setExpandDay(null); return; }
    setExpandDay(day.id);
    if (histReport[day.id]) return;       // already loaded
    const res = await dayReport(day.id);
    if (res.ok) setHistReport(prev => ({ ...prev, [day.id]: res.data }));
  }

  if (loading) return <div className={styles.loading}>{ar.loading}</div>;

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{ar.closeDayTitle}</h2>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* ── Just-closed report ─────────────────────────────── */}
      {report && (
        <div className={styles.successBanner}>
          <Icon name="success" size={18} /> {ar.closeDaySuccess}
          <DayReportPanel report={report} />
        </div>
      )}

      {/* ── Current open day ───────────────────────────────── */}
      {!report && (
        <div className={styles.currentDay}>
          {openDay ? (
            <>
              <div className={styles.currentDayInfo}>
                <Icon name="calendar" size={20} className={styles.calIcon} />
                <div>
                  <div className={styles.currentDayLabel}>{ar.dayDate}</div>
                  <div className={styles.currentDayDate}>{formatDate(openDay.date)}</div>
                </div>
              </div>
              <Button
                size="lg"
                fullWidth
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
              >
                <Icon name="closeDay" size={20} />
                {busy ? ar.loading : ar.closeDayBtn}
              </Button>
            </>
          ) : (
            <div className={styles.noOpenDay}>
              <Icon name="calendar" size={32} className={styles.calIcon} />
              <p>{ar.noOpenDay}</p>
            </div>
          )}
        </div>
      )}

      {/* ── History list ───────────────────────────────────── */}
      {closedDays.length > 0 && (
        <div className={styles.history}>
          <h3 className={styles.historyTitle}>{ar.previousDays}</h3>
          {closedDays.map(day => (
            <div key={day.id} className={styles.histRow}>
              <div
                className={styles.histRowHeader}
                onClick={() => toggleHistory(day)}
              >
                <span className={styles.histDate}>{formatDate(day.date)}</span>
                <span className={styles.histMeta}>
                  <Icon name="receipt" size={13} /> {day.receipt_count}
                  &nbsp;|&nbsp;
                  {format(day.total_sales)} {ar.currency}
                </span>
                <Icon
                  name={expandDay === day.id ? 'chevronUp' : 'chevronDown'}
                  size={14}
                />
              </div>
              {expandDay === day.id && histReport[day.id] && (
                <div className={styles.histDetail}>
                  <DayReportPanel report={histReport[day.id]} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Confirm dialog ─────────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        message={ar.closeDayConfirm}
        confirmLabel={ar.closeDayBtn}
        onConfirm={handleClose}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
