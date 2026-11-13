import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  ordersList, dayGetCurrent,
  ordersModify, ordersCancel,
} from '../../api/index.js';
import { format, toMinor, fromMinor } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import NumPad from '../../components/NumPad.jsx';
import PrintDialog from '../../components/PrintDialog.jsx';
import styles from './OrdersScreen.module.css';

const STATUS_LABEL = {
  normal:    ar.statusNormal,
  modified:  ar.statusModified,
  cancelled: ar.statusCancelled,
};

// takeaway: use legacy label so old orders still display correctly
const TYPE_LABEL = {
  dine_in:  ar.dineIn,
  takeaway: ar.takeawayLegacy,
  delivery: ar.delivery,
};

// ── OrdersScreen ───────────────────────────────────────────────────
export default function OrdersScreen() {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);

  // Modify modal state
  const [modifyOrder,   setModifyOrder]   = useState(null); // order being modified
  const [modifyCart,    setModifyCart]    = useState([]);   // editable cart items
  const [modifyFee,     setModifyFee]     = useState('0');
  const [modifyFeeModal,setModifyFeeModal]= useState(false);
  const [modifyBusy,    setModifyBusy]    = useState(false);
  const [modifyError,   setModifyError]   = useState('');

  // Cancel confirmation
  const [cancelTarget,  setCancelTarget]  = useState(null);
  const [cancelBusy,    setCancelBusy]    = useState(false);

  // Print after action
  const [printModal,  setPrintModal]  = useState(false);
  const [printTarget, setPrintTarget] = useState(null); // { orderId, isModified, isCancellation }

  // ── Load ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const dayRes = await dayGetCurrent();
    if (dayRes.ok) {
      const res = await ordersList(dayRes.data.id);
      if (res.ok) setOrders(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Open modify modal ─────────────────────────────────────────
  function openModify(order) {
    setModifyOrder(order);
    // Clone items into editable cart
    setModifyCart(
      (order.items ?? []).map(item => ({
        ...item,
        _key: item.id,
        options: item.options ?? [],
      })),
    );
    setModifyFee(fromMinor(order.delivery_fee ?? 0).toString());
    setModifyError('');
  }

  // ── Modify cart helpers ───────────────────────────────────────
  function modifyChangeQty(key, delta) {
    setModifyCart(prev => prev.map(i => {
      if (i._key !== key) return i;
      const newQty = i.qty + delta;
      if (newQty < 1) return null;
      const optExtra = (i.options ?? []).reduce((s, o) => s + (o.price ?? 0), 0);
      return { ...i, qty: newQty, line_total: (i.unit_price + optExtra) * newQty };
    }).filter(Boolean));
  }

  function modifyRemove(key) {
    setModifyCart(prev => prev.filter(i => i._key !== key));
  }

  // ── Submit modify ─────────────────────────────────────────────
  async function submitModify() {
    if (modifyCart.length === 0) { setModifyError(ar.cartEmpty); return; }
    setModifyBusy(true);
    setModifyError('');

    const items = modifyCart.map(i => ({
      product_id:   i.product_id,
      product_name: i.product_name,
      unit_price:   i.unit_price,
      qty:          i.qty,
      options:      i.options,
      note:         i.note,
    }));

    const res = await ordersModify(modifyOrder.id, {
      items,
      delivery_fee: toMinor(modifyFee),
    });

    setModifyBusy(false);
    if (res.ok) {
      setModifyOrder(null);
      await load();
      // Offer to print modified receipt
      setPrintTarget({ orderId: res.data.order.id, isModified: true });
      setPrintModal(true);
    } else {
      setModifyError(res.error ?? ar.unknownError);
    }
  }

  // ── Submit cancel ─────────────────────────────────────────────
  async function submitCancel() {
    setCancelBusy(true);
    const res = await ordersCancel(cancelTarget.id);
    setCancelBusy(false);
    setCancelTarget(null);
    if (res.ok) {
      await load();
      setPrintTarget({ orderId: res.data.order.id, isCancellation: true });
      setPrintModal(true);
    }
  }

  // ── Print dialog done ─────────────────────────────────────────
  function handlePrintDone() {
    setPrintModal(false);
    setPrintTarget(null);
  }

  // ── Derived totals for modify cart ────────────────────────────
  const modifyItemsTotal = modifyCart.reduce((s, i) => s + i.line_total, 0);
  const modifyFeeMinor   = toMinor(modifyFee);
  const modifyGrandTotal = modifyItemsTotal + modifyFeeMinor;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>{ar.ordersLog}</h2>
        <button className={styles.refreshBtn} onClick={load}>
          <Icon name="refresh" size={18} />
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>{ar.loading}</div>
      ) : orders.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="receipt" size={48} className={styles.emptyIcon} />
          <p>{ar.noData}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {[...orders].reverse().map(order => (
            <div key={order.id} className={`${styles.row} ${styles[order.status]}`}>
              {/* ── Row header ──────────────────────────────── */}
              <div
                className={styles.rowMain}
                onClick={() => setExpanded(expanded === order.id ? null : order.id)}
              >
                <div className={styles.rowLeft}>
                  <span className={styles.receiptNum}>#{order.number}</span>
                  <span className={`${styles.statusBadge} ${styles[`badge_${order.status}`]}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                  <span className={styles.typeBadge}>{TYPE_LABEL[order.order_type]}</span>
                </div>
                <div className={styles.rowRight}>
                  <span className={styles.total}>{format(order.total)} {ar.currency}</span>
                  <Icon name={expanded === order.id ? 'chevronUp' : 'chevronDown'} size={16} />
                </div>
              </div>

              {/* ── Expanded detail ──────────────────────────── */}
              {expanded === order.id && (
                <div className={styles.detail}>
                  {order.items?.map((item, idx) => (
                    <div key={idx} className={styles.detailItem}>
                      <span className={styles.detailQty}>{item.qty}×</span>
                      <span className={styles.detailName}>{item.product_name}</span>
                      {item.options?.length > 0 && (
                        <span className={styles.detailOpts}>
                          ({item.options.map(o => o.label).join('، ')})
                        </span>
                      )}
                      {item.note && (
                        <span className={styles.detailNote}>{item.note}</span>
                      )}
                      <span className={styles.detailPrice}>{format(item.line_total)}</span>
                    </div>
                  ))}
                  {order.order_type === 'delivery' && order.delivery_fee > 0 && (
                    <div className={styles.detailItem}>
                      <span className={styles.detailQty}></span>
                      <span className={styles.detailName}>{ar.deliveryFee}</span>
                      <span className={styles.detailPrice}>{format(order.delivery_fee)}</span>
                    </div>
                  )}
                  {order.delivery_name && (
                    <p className={styles.detailMeta}>
                      <Icon name="user" size={12} /> {order.delivery_name} – {order.delivery_phone}
                    </p>
                  )}

                  {/* ── Actions ──────────────────────────────── */}
                  {order.status !== 'cancelled' && (
                    <div className={styles.rowActions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openModify(order)}
                      >
                        <Icon name="edit" size={14} /> {ar.modifyOrder}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setCancelTarget(order)}
                      >
                        <Icon name="close" size={14} /> {ar.cancelOrder}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setPrintTarget({ orderId: order.id }); setPrintModal(true); }}
                      >
                        <Icon name="print" size={14} /> {ar.printCustomer}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modify order modal ──────────────────────────────────── */}
      <Modal
        open={!!modifyOrder}
        title={`${ar.modifyOrderTitle} #${modifyOrder?.number ?? ''}`}
        onClose={() => setModifyOrder(null)}
        size="md"
      >
        {modifyOrder && (
          <div className={styles.modifyWrap}>
            {/* Cart items */}
            <div className={styles.modifyList}>
              {modifyCart.map(item => {
                const optExtra = (item.options ?? []).reduce((s, o) => s + (o.price ?? 0), 0);
                const lineTotal = (item.unit_price + optExtra) * item.qty;
                return (
                  <div key={item._key} className={styles.modifyItem}>
                    <div className={styles.modifyItemName}>{item.product_name}</div>
                    {item.options?.length > 0 && (
                      <div className={styles.modifyItemOpts}>
                        {item.options.map(o => o.label).join('، ')}
                      </div>
                    )}
                    <div className={styles.modifyItemControls}>
                      <button
                        className={styles.qtyBtn}
                        onClick={() => modifyChangeQty(item._key, -1)}
                      >
                        <Icon name="minus" size={13} />
                      </button>
                      <span className={styles.qtyVal}>{item.qty}</span>
                      <button
                        className={styles.qtyBtn}
                        onClick={() => modifyChangeQty(item._key, 1)}
                      >
                        <Icon name="plus" size={13} />
                      </button>
                      <span className={styles.modifyLineTotal}>{format(lineTotal)}</span>
                      <button
                        className={styles.removeBtn}
                        onClick={() => modifyRemove(item._key)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Delivery fee (if applicable) */}
            {modifyOrder.order_type === 'delivery' && (
              <div className={styles.modifyFeeRow}>
                <span>{ar.deliveryFee}</span>
                <button
                  className={styles.feeBtn}
                  onClick={() => setModifyFeeModal(true)}
                >
                  {modifyFee} {ar.currency}
                </button>
              </div>
            )}

            {/* Grand total */}
            <div className={styles.modifyTotal}>
              <span>{ar.grandTotal}</span>
              <span className={styles.modifyTotalAmt}>{format(modifyGrandTotal)} {ar.currency}</span>
            </div>

            {modifyError && <p className={styles.modifyError}>{modifyError}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="ghost" fullWidth onClick={() => setModifyOrder(null)}>
                {ar.cancel}
              </Button>
              <Button variant="primary" fullWidth onClick={submitModify} disabled={modifyBusy}>
                {modifyBusy ? ar.loading : ar.save}
              </Button>
            </div>
          </div>
        )}

        {/* Nested fee numpad */}
        <Modal
          open={modifyFeeModal}
          title={ar.deliveryFee}
          onClose={() => setModifyFeeModal(false)}
          size="sm"
        >
          <NumPad value={modifyFee} onChange={setModifyFee} decimal />
          <div style={{ marginTop: 12 }}>
            <Button fullWidth onClick={() => setModifyFeeModal(false)}>{ar.confirm}</Button>
          </div>
        </Modal>
      </Modal>

      {/* ── Cancel confirmation ─────────────────────────────────── */}
      <ConfirmDialog
        open={!!cancelTarget}
        message={ar.confirmCancelOrder}
        confirmLabel={cancelBusy ? ar.loading : ar.cancelOrder}
        confirmVariant="danger"
        onConfirm={submitCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* ── Print dialog ─────────────────────────────────────────── */}
      <PrintDialog
        open={printModal}
        orderId={printTarget?.orderId}
        isModified={printTarget?.isModified ?? false}
        isCancellation={printTarget?.isCancellation ?? false}
        onDone={handlePrintDone}
      />
    </div>
  );
}
