import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  shopsList, shopsCreate, shopsUpdate, shopsDelete, shopsPickImage,
  suppliesList, suppliesCreate, suppliesUpdate, suppliesDelete,
  purchasesList, purchasesCreate, purchasesUpdatePaid,
  purchasesUpdate, purchasesDelete,
  purchasesDebtSummary,
} from '../../api/index.js';
import { format, fromMinor, fmtDate } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormField from '../../components/FormField.jsx';
import DateInput from '../../components/DateInput.jsx';
import styles from './SuppliersScreen.module.css';

// ── helpers ────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Main screen ────────────────────────────────────────────────────
export default function SuppliersScreen() {
  const [view,  setView]  = useState('list');  // 'list' | 'shop' | 'debt'
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [loading, setLoading] = useState(true);

  // Shop form modal
  const [shopModal,  setShopModal]  = useState(false);
  const [editingShop, setEditingShop] = useState(null);
  const [shopName,   setShopName]   = useState('');
  const [shopImg,    setShopImg]    = useState(null); // {filePath, previewUrl}
  const [shopBusy,   setShopBusy]   = useState(false);
  const [shopError,  setShopError]  = useState('');
  const [deleteShopTarget, setDeleteShopTarget] = useState(null);

  // Debt summary
  const [debtData, setDebtData] = useState(null);

  const loadShops = useCallback(async () => {
    setLoading(true);
    const res = await shopsList();
    if (res.ok) setShops(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadShops(); }, [loadShops]);

  function openAddShop() {
    setEditingShop(null);
    setShopName('');
    setShopImg(null);
    setShopError('');
    setShopModal(true);
  }

  function openEditShop(shop) {
    setEditingShop(shop);
    setShopName(shop.name);
    setShopImg(shop.image_url ? { previewUrl: shop.image_url, filePath: null } : null);
    setShopError('');
    setShopModal(true);
  }

  async function pickShopImage() {
    const res = await shopsPickImage();
    if (res.ok && !res.data.canceled) {
      setShopImg(res.data);
    }
  }

  async function saveShop() {
    if (!shopName.trim()) { setShopError(ar.required); return; }
    setShopBusy(true);
    const payload = { name: shopName, imagePath: shopImg?.filePath ?? undefined };
    const res = editingShop
      ? await shopsUpdate(editingShop.id, payload)
      : await shopsCreate(payload);
    setShopBusy(false);
    if (res.ok) {
      setShopModal(false);
      loadShops();
    } else {
      setShopError(res.error ?? ar.unknownError);
    }
  }

  async function confirmDeleteShop() {
    if (!deleteShopTarget) return;
    const target = deleteShopTarget;
    setDeleteShopTarget(null);
    const res = await shopsDelete(target.id);
    if (!res.ok) {
      // Show error briefly — use shopError field
      setShopError(res.error ?? ar.unknownError);
      return;
    }
    if (selectedShop?.id === target.id) { setSelectedShop(null); setView('list'); }
    loadShops();
  }

  async function openDebt() {
    setView('debt');
    const res = await purchasesDebtSummary();
    if (res.ok) setDebtData(res.data);
  }

  if (loading) return <div className={styles.loading}>{ar.loading}</div>;

  return (
    <div className={styles.page}>
      {/* ── Sidebar: shop list ────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>{ar.suppliers}</h2>
          <button className={styles.iconBtn} onClick={openAddShop}>
            <Icon name="plus" size={18} />
          </button>
        </div>

        <button
          className={`${styles.shopItem} ${view === 'debt' ? styles.shopActive : ''}`}
          onClick={openDebt}
        >
          <Icon name="money" size={18} />
          <span>{ar.debtSummary}</span>
        </button>

        {shops.map(shop => (
          <div
            key={shop.id}
            className={`${styles.shopItem} ${selectedShop?.id === shop.id && view === 'shop' ? styles.shopActive : ''}`}
            onClick={() => { setSelectedShop(shop); setView('shop'); }}
          >
            {shop.image_url
              ? <img src={shop.image_url} alt={shop.name} className={styles.shopThumb} />
              : <Icon name="store" size={18} />
            }
            <span className={styles.shopName}>{shop.name}</span>
            <div className={styles.shopActions}>
              <button className={styles.iconBtn} onClick={e => { e.stopPropagation(); openEditShop(shop); }}>
                <Icon name="edit" size={14} />
              </button>
              <button className={`${styles.iconBtn} ${styles.danger}`} onClick={e => { e.stopPropagation(); setDeleteShopTarget(shop); }}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </aside>

      {/* ── Main panel ────────────────────────────────── */}
      <div className={styles.main}>
        {view === 'list' && (
          <div className={styles.empty}>
            <Icon name="store" size={48} className={styles.emptyIcon} />
            <p>{ar.noData}</p>
          </div>
        )}
        {view === 'shop' && selectedShop && (
          <ShopPanel
            shop={selectedShop}
            onShopChange={() => loadShops()}
          />
        )}
        {view === 'debt' && debtData && (
          <DebtPanel data={debtData} />
        )}
      </div>

      {/* ── Shop modal ────────────────────────────────── */}
      <Modal
        open={shopModal}
        title={editingShop ? ar.editShop : ar.addShop}
        onClose={() => setShopModal(false)}
        size="sm"
      >
        <div className={styles.shopForm}>
          <FormField label={ar.shopName}>
            <input
              className={styles.input}
              value={shopName}
              onChange={e => setShopName(e.target.value)}
            />
          </FormField>
          <FormField label={ar.shopImage}>
            <div className={styles.imageRow}>
              {shopImg?.previewUrl && (
                <img src={shopImg.previewUrl} alt="" className={styles.imagePreview} />
              )}
              <Button variant="ghost" onClick={pickShopImage}>
                <Icon name="camera" size={16} /> {ar.chooseImage}
              </Button>
            </div>
          </FormField>
          {shopError && <p className={styles.error}>{shopError}</p>}
          <Button fullWidth onClick={saveShop} disabled={shopBusy}>
            {shopBusy ? ar.loading : ar.save}
          </Button>
        </div>
      </Modal>

      {/* ── Delete shop confirm ──────────────────────── */}
      <ConfirmDialog
        open={!!deleteShopTarget}
        message={ar.confirmDeleteShop}
        confirmVariant="danger"
        confirmLabel={ar.delete}
        onConfirm={confirmDeleteShop}
        onCancel={() => setDeleteShopTarget(null)}
      />
    </div>
  );
}

// ── ShopPanel – supplies + purchases ────────────────────────────────
function ShopPanel({ shop }) {
  const [tab,       setTab]       = useState('supplies'); // 'supplies' | 'purchases'
  const [supplies,  setSupplies]  = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Supply modal
  const [supplyModal,  setSupplyModal]  = useState(false);
  const [editSupply,   setEditSupply]   = useState(null);
  const [supplyName,   setSupplyName]   = useState('');
  const [supplyPrice,  setSupplyPrice]  = useState('0');
  const [supplyBusy,   setSupplyBusy]   = useState(false);
  const [supplyError,  setSupplyError]  = useState('');
  const [deleteSTarget,setDeleteSTarget]= useState(null);

  // Purchase modal (create + edit)
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [editPurchase,  setEditPurchase]  = useState(null); // null = new, object = edit
  const [pDate,  setPDate]  = useState(today());
  const [pItems, setPItems] = useState([{ name: '', qty: 1, unit_price: '' }]);
  const [pPaid,  setPPaid]  = useState('0');
  const [pBusy,  setPBusy]  = useState(false);
  const [pError, setPError] = useState('');

  // Delete purchase confirm
  const [deletePTarget, setDeletePTarget] = useState(null);

  // Update paid modal
  const [editPaidTarget, setEditPaidTarget] = useState(null);
  const [editPaidValue,  setEditPaidValue]  = useState('0');

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, pRes] = await Promise.all([
      suppliesList(shop.id),
      purchasesList(shop.id),
    ]);
    if (sRes.ok) setSupplies(sRes.data);
    if (pRes.ok) setPurchases(pRes.data);
    setLoading(false);
  }, [shop.id]);

  useEffect(() => { load(); }, [load]);

  // ── Save supply ──────────────────────────────────────────────
  async function saveSupply() {
    if (!supplyName.trim()) { setSupplyError(ar.required); return; }
    setSupplyBusy(true);
    const payload = {
      shop_id: shop.id,
      name: supplyName,
      approx_price: Number(supplyPrice),
    };
    const res = editSupply
      ? await suppliesUpdate(editSupply.id, payload)
      : await suppliesCreate(payload);
    setSupplyBusy(false);
    if (res.ok) { setSupplyModal(false); load(); }
    else setSupplyError(res.error ?? ar.unknownError);
  }

  // ── Open purchase modal (new or edit) ───────────────────────
  function openNewPurchase() {
    setEditPurchase(null);
    resetPurchaseForm();
    setPurchaseModal(true);
  }

  function openEditPurchaseModal(p) {
    setEditPurchase(p);
    setPDate(p.date);
    setPItems(
      (p.items ?? []).map(i => ({
        name: i.name,
        qty: i.qty,
        unit_price: fromMinor(i.unit_price).toString(),
        supply_id: i.supply_id ?? null,
      }))
    );
    setPPaid(fromMinor(p.paid).toString());
    setPError('');
    setPurchaseModal(true);
  }

  // ── Save purchase (create or update) ─────────────────────────
  async function savePurchase() {
    setPError('');
    const validItems = pItems.filter(i => i.name.trim() && Number(i.qty) > 0 && Number(i.unit_price) > 0);
    if (validItems.length === 0) { setPError(ar.purchaseItems + ': ' + ar.required); return; }
    setPBusy(true);
    const payload = {
      date: pDate,
      paid: Number(pPaid),
      items: validItems.map(i => ({
        name: i.name,
        qty: Number(i.qty),
        unit_price: Number(i.unit_price),
        supply_id: i.supply_id ?? null,
      })),
    };
    const res = editPurchase
      ? await purchasesUpdate(editPurchase.id, payload)
      : await purchasesCreate({ shop_id: shop.id, ...payload });
    setPBusy(false);
    if (res.ok) { setPurchaseModal(false); resetPurchaseForm(); load(); }
    else setPError(res.error ?? ar.unknownError);
  }

  function resetPurchaseForm() {
    setEditPurchase(null);
    setPDate(today());
    setPItems([{ name: '', qty: 1, unit_price: '' }]);
    setPPaid('0');
    setPError('');
  }

  // ── Delete purchase ──────────────────────────────────────────
  async function confirmDeletePurchase() {
    if (!deletePTarget) return;
    await purchasesDelete(deletePTarget.id);
    setDeletePTarget(null);
    load();
  }

  // ── Update paid ──────────────────────────────────────────────
  async function saveUpdatedPaid() {
    if (!editPaidTarget) return;
    await purchasesUpdatePaid(editPaidTarget.id, Number(editPaidValue));
    setEditPaidTarget(null);
    load();
  }

  const purchaseItem_add = () =>
    setPItems(prev => [...prev, { name: '', qty: 1, unit_price: '' }]);
  const purchaseItem_remove = idx =>
    setPItems(prev => prev.filter((_, i) => i !== idx));
  const purchaseItem_set = (idx, field, val) =>
    setPItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  if (loading) return <div className={styles.loading}>{ar.loading}</div>;

  return (
    <div className={styles.shopPanel}>
      <h3 className={styles.shopPanelTitle}>{shop.name}</h3>

      {/* Tabs */}
      <div className={styles.tabs}>
        {[['supplies', ar.supplyName], ['purchases', ar.shopPurchasesList]].map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Supplies tab ─────────────────────────── */}
      {tab === 'supplies' && (
        <div>
          <div className={styles.panelToolbar}>
            <Button size="sm" onClick={() => { setEditSupply(null); setSupplyName(''); setSupplyPrice('0'); setSupplyError(''); setSupplyModal(true); }}>
              <Icon name="plus" size={14} /> {ar.addSupply}
            </Button>
          </div>
          <div className={styles.supplyList}>
            {supplies.length === 0 && <p className={styles.emptyText}>{ar.noData}</p>}
            {supplies.map(s => (
              <div key={s.id} className={styles.supplyRow}>
                <span className={styles.supplyRowName}>{s.name}</span>
                <span className={styles.supplyRowPrice}>{format(s.approx_price)} {ar.currency}</span>
                <button className={styles.iconBtn} onClick={() => { setEditSupply(s); setSupplyName(s.name); setSupplyPrice(fromMinor(s.approx_price).toString()); setSupplyError(''); setSupplyModal(true); }}>
                  <Icon name="edit" size={14} />
                </button>
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => setDeleteSTarget(s)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Purchases tab ────────────────────────── */}
      {tab === 'purchases' && (
        <div>
          <div className={styles.panelToolbar}>
            <Button size="sm" onClick={openNewPurchase}>
              <Icon name="plus" size={14} /> {ar.addPurchase}
            </Button>
          </div>
          <div className={styles.purchaseList}>
            {purchases.length === 0 && <p className={styles.emptyText}>{ar.noData}</p>}
            {purchases.map(p => (
              <div key={p.id} className={styles.purchaseCard}>
                <div className={styles.purchaseCardHead}>
                  <span className={styles.purchaseDate}>{fmtDate(p.date)}</span>
                  <span className={styles.purchaseTotal}>{format(p.total)} {ar.currency}</span>
                  <div className={styles.purchaseCardActions}>
                    <button
                      className={styles.iconBtn}
                      title={ar.editPurchase}
                      onClick={() => openEditPurchaseModal(p)}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      className={`${styles.iconBtn} ${styles.danger}`}
                      title={ar.deletePurchase}
                      onClick={() => setDeletePTarget(p)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className={styles.purchaseCardFoot}>
                  <span className={styles.purchasePaid}>{ar.purchasePaid}: {format(p.paid)}</span>
                  <span className={p.remaining > 0 ? styles.purchaseDebt : styles.purchaseClear}>
                    {ar.purchaseRemaining}: {format(p.remaining)}
                  </span>
                  <button
                    className={styles.iconBtn}
                    title={ar.updatePaid}
                    onClick={() => { setEditPaidTarget(p); setEditPaidValue(fromMinor(p.paid).toString()); }}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                </div>
                {/* Purchase items */}
                {p.items?.map((item, idx) => (
                  <div key={idx} className={styles.purchaseItem}>
                    <span>{item.qty}×</span>
                    <span>{item.name}</span>
                    <span>{format(item.line_total)} {ar.currency}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Supply modal ─────────────────────────── */}
      <Modal open={supplyModal} title={editSupply ? ar.editSupply : ar.addSupply} onClose={() => setSupplyModal(false)} size="sm">
        <div className={styles.shopForm}>
          <FormField label={ar.supplyName}>
            <input className={styles.input} value={supplyName} onChange={e => setSupplyName(e.target.value)} />
          </FormField>
          <FormField label={ar.supplyPrice}>
            <input className={styles.input} type="number" min="0" step="0.01" value={supplyPrice} onChange={e => setSupplyPrice(e.target.value)} dir="ltr" />
          </FormField>
          {supplyError && <p className={styles.error}>{supplyError}</p>}
          <Button fullWidth onClick={saveSupply} disabled={supplyBusy}>{supplyBusy ? ar.loading : ar.save}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteSTarget}
        message={ar.confirmDeleteSupply}
        confirmVariant="danger"
        confirmLabel={ar.delete}
        onConfirm={async () => { await suppliesDelete(deleteSTarget.id); setDeleteSTarget(null); load(); }}
        onCancel={() => setDeleteSTarget(null)}
      />

      {/* ── Delete purchase confirm ──────────────── */}
      <ConfirmDialog
        open={!!deletePTarget}
        message={ar.confirmDeletePurchase}
        confirmVariant="danger"
        confirmLabel={ar.delete}
        onConfirm={confirmDeletePurchase}
        onCancel={() => setDeletePTarget(null)}
      />

      {/* ── Purchase modal (create / edit) ───────── */}
      <Modal open={purchaseModal} title={editPurchase ? ar.editPurchase : ar.addPurchase} onClose={() => setPurchaseModal(false)} size="md">
        <div className={styles.purchaseForm}>
          <FormField label={ar.purchaseDate}>
            <DateInput value={pDate} onChange={setPDate} />
          </FormField>

          <div className={styles.pItemsHeader}>
            <span>{ar.purchaseItems}</span>
            <Button size="sm" variant="ghost" onClick={purchaseItem_add}>
              <Icon name="plus" size={13} /> {ar.addItem}
            </Button>
          </div>
          {pItems.map((item, idx) => (
            <div key={idx} className={styles.pItemRow}>
              <select
                className={styles.pItemSelect}
                value={item.supply_id ?? ''}
                onChange={e => {
                  const s = supplies.find(s => String(s.id) === e.target.value);
                  purchaseItem_set(idx, 'supply_id', s?.id ?? null);
                  if (s) purchaseItem_set(idx, 'name', s.name);
                }}
              >
                <option value="">— {ar.itemName} —</option>
                {supplies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                className={styles.pItemInput}
                placeholder={ar.itemName}
                value={item.name}
                onChange={e => purchaseItem_set(idx, 'name', e.target.value)}
              />
              <input
                className={styles.pItemInput}
                type="number" min="0.1" step="0.1"
                placeholder={ar.qty}
                value={item.qty}
                onChange={e => purchaseItem_set(idx, 'qty', e.target.value)}
                dir="ltr"
                style={{ width: 60 }}
              />
              <input
                className={styles.pItemInput}
                type="number" min="0" step="1"
                placeholder={ar.unitPrice}
                value={item.unit_price}
                onChange={e => purchaseItem_set(idx, 'unit_price', e.target.value)}
                dir="ltr"
                style={{ width: 80 }}
              />
              {pItems.length > 1 && (
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => purchaseItem_remove(idx)}>
                  <Icon name="trash" size={13} />
                </button>
              )}
            </div>
          ))}

          <FormField label={ar.purchasePaid}>
            <input className={styles.input} type="number" min="0" step="1" value={pPaid} onChange={e => setPPaid(e.target.value)} dir="ltr" />
          </FormField>

          {pError && <p className={styles.error}>{pError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" fullWidth onClick={() => setPurchaseModal(false)}>{ar.cancel}</Button>
            <Button fullWidth onClick={savePurchase} disabled={pBusy}>{pBusy ? ar.loading : ar.save}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Update paid modal ────────────────────── */}
      <Modal
        open={!!editPaidTarget}
        title={ar.updatePaid}
        onClose={() => setEditPaidTarget(null)}
        size="sm"
      >
        {editPaidTarget && (
          <div className={styles.shopForm}>
            <p className={styles.paidInfo}>
              {ar.purchaseTotal}: <strong>{format(editPaidTarget.total)} {ar.currency}</strong>
            </p>
            <FormField label={ar.purchasePaid}>
              <input
                className={styles.input}
                type="number" min="0" step="1"
                value={editPaidValue}
                onChange={e => setEditPaidValue(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <Button fullWidth onClick={saveUpdatedPaid}>{ar.save}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── DebtPanel ─────────────────────────────────────────────────────
function DebtPanel({ data }) {
  const { shops, totalDebt } = data;
  return (
    <div className={styles.debtPanel}>
      <h3 className={styles.shopPanelTitle}>{ar.debtSummary}</h3>
      <div className={styles.debtTotal}>
        <span>{ar.totalDebt}</span>
        <span className={styles.debtTotalAmt}>{format(totalDebt)} {ar.currency}</span>
      </div>
      {shops.length === 0 && <p className={styles.emptyText}>{ar.noDebt}</p>}
      {shops.map(s => s.debt > 0 && (
        <div key={s.id} className={styles.debtRow}>
          <span>{s.name}</span>
          <span className={styles.debtAmt}>{format(s.debt)} {ar.currency}</span>
        </div>
      ))}
    </div>
  );
}
