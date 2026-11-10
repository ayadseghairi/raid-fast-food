import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  expensesList, expensesCreate, expensesUpdate, expensesDelete,
} from '../../api/index.js';
import { format, fromMinor, fmtDate } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormField from '../../components/FormField.jsx';
import styles from './ExpensesScreen.module.css';

const CATEGORY_LABELS = {
  electricity: ar.expenseCategoryElectricity,
  rent:        ar.expenseCategoryRent,
  salary:      ar.expenseCategorySalary,
  maintenance: ar.expenseCategoryMaintenance,
  other:       ar.expenseCategoryOther,
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);

function today() { return new Date().toISOString().slice(0, 10); }

export default function ExpensesScreen() {
  const [expenses,  setExpenses]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Form modal
  const [modal,      setModal]      = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [fName,      setFName]      = useState('');
  const [fAmount,    setFAmount]    = useState('');
  const [fDate,      setFDate]      = useState(today());
  const [fCategory,  setFCategory]  = useState('other');
  const [fBusy,      setFBusy]      = useState(false);
  const [fError,     setFError]     = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Filters
  const [filterCat,  setFilterCat]  = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const filters = {};
    if (filterCat)  filters.category = filterCat;
    if (filterFrom) filters.dateFrom = filterFrom;
    if (filterTo)   filters.dateTo   = filterTo;
    const res = await expensesList(filters);
    if (res.ok) setExpenses(res.data);
    setLoading(false);
  }, [filterCat, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setFName(''); setFAmount(''); setFDate(today()); setFCategory('other'); setFError('');
    setModal(true);
  }

  function openEdit(exp) {
    setEditing(exp);
    setFName(exp.name);
    setFAmount(fromMinor(exp.amount).toString());
    setFDate(exp.date);
    setFCategory(exp.category);
    setFError('');
    setModal(true);
  }

  async function save() {
    if (!fName.trim())  { setFError(ar.required); return; }
    if (!fAmount || isNaN(Number(fAmount)) || Number(fAmount) <= 0) { setFError(ar.required); return; }
    setFBusy(true);
    const payload = { name: fName.trim(), amount: fAmount, date: fDate, category: fCategory };
    const res = editing
      ? await expensesUpdate(editing.id, payload)
      : await expensesCreate(payload);
    setFBusy(false);
    if (res.ok) { setModal(false); load(); }
    else setFError(res.error ?? ar.unknownError);
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>{ar.expenses}</h2>
        <Button size="sm" onClick={openAdd}>
          <Icon name="plus" size={16} /> {ar.addExpense}
        </Button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">{ar.expenseCategory}: {ar.select}</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <input
          className={styles.filterInput}
          type="date"
          value={filterFrom}
          onChange={e => setFilterFrom(e.target.value)}
          dir="ltr"
          title={ar.dateFrom}
        />
        <input
          className={styles.filterInput}
          type="date"
          value={filterTo}
          onChange={e => setFilterTo(e.target.value)}
          dir="ltr"
          title={ar.dateTo}
        />
        <Button size="sm" variant="ghost" onClick={() => { setFilterCat(''); setFilterFrom(''); setFilterTo(''); }}>
          <Icon name="close" size={14} /> {ar.clear}
        </Button>
      </div>

      {/* Total bar */}
      {expenses.length > 0 && (
        <div className={styles.totalBar}>
          <span>{ar.totalExpenses}</span>
          <span className={styles.totalAmt}>{format(totalAmount)} {ar.currency}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className={styles.loading}>{ar.loading}</div>
      ) : expenses.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="money" size={40} className={styles.emptyIcon} />
          <p>{ar.noData}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {expenses.map(exp => (
            <div key={exp.id} className={styles.row}>
              <div className={styles.rowLeft}>
                <span className={`${styles.catBadge} ${styles[`cat_${exp.category}`]}`}>
                  {CATEGORY_LABELS[exp.category] ?? exp.category}
                </span>
                <span className={styles.rowName}>{exp.name}</span>
                <span className={styles.rowDate}>{fmtDate(exp.date)}</span>
              </div>
              <div className={styles.rowRight}>
                <span className={styles.rowAmount}>{format(exp.amount)} {ar.currency}</span>
                <button className={styles.iconBtn} onClick={() => openEdit(exp)}>
                  <Icon name="edit" size={14} />
                </button>
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => setDeleteTarget(exp)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      <Modal
        open={modal}
        title={editing ? ar.editExpense : ar.addExpense}
        onClose={() => setModal(false)}
        size="sm"
      >
        <div className={styles.form}>
          <FormField label={ar.expenseName}>
            <input className={styles.input} value={fName} onChange={e => setFName(e.target.value)} />
          </FormField>
          <FormField label={ar.expenseAmount}>
            <input className={styles.input} type="number" min="0" step="1" value={fAmount} onChange={e => setFAmount(e.target.value)} dir="ltr" />
          </FormField>
          <FormField label={ar.expenseDate}>
            <input className={styles.input} type="date" value={fDate} onChange={e => setFDate(e.target.value)} dir="ltr" />
          </FormField>
          <FormField label={ar.expenseCategory}>
            <select className={styles.select} value={fCategory} onChange={e => setFCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </FormField>
          {fError && <p className={styles.error}>{fError}</p>}
          <Button fullWidth onClick={save} disabled={fBusy}>
            {fBusy ? ar.loading : ar.save}
          </Button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        message={`${ar.delete}: ${deleteTarget?.name}`}
        confirmVariant="danger"
        confirmLabel={ar.delete}
        onConfirm={async () => { await expensesDelete(deleteTarget.id); setDeleteTarget(null); load(); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
