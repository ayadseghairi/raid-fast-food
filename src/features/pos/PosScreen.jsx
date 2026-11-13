import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import {
  categoriesList, productsList,
  ordersCreate, dayGetCurrent,
  customerLookup,
  settingsGet,
  optionsList,
} from '../../api/index.js';
import { format, toMinor, fromMinor } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import NumPad from '../../components/NumPad.jsx';
import FormField from '../../components/FormField.jsx';
import PrintDialog from '../../components/PrintDialog.jsx';
import SizePickerModal from '../../components/SizePickerModal.jsx';
import CategoryTabs from '../../components/CategoryTabs.jsx';
import styles from './PosScreen.module.css';

// ── Order types (takeaway removed from new orders) ────────────────
const ORDER_TYPES = [
  { key: 'dine_in',  label: ar.dineIn   },
  { key: 'delivery', label: ar.delivery },
];

/**
 * Compute final unit price (mirrors electron/services/products.js computeUnitPrice).
 * @param {number} basePrice - product.price in minor units
 * @param {string} sizePriceMode - 'absolute'|'delta'
 * @param {number} sizePrice - size option price in minor units
 * @returns {number}
 */
function computeUnitPrice(basePrice, sizePriceMode, sizePrice) {
  if (sizePriceMode === 'absolute') return sizePrice;
  return basePrice + sizePrice;
}

export default function PosScreen() {
  // ── State ──────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);                    // [{...product, qty, options, note, cartId, sizeName, finalUnitPrice}]
  const [orderType, setOrderType] = useState('dine_in');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [defaultFee, setDefaultFee] = useState(0);        // minor units from settings
  const [deliveryForm, setDeliveryForm] = useState({ name: '', phone: '', address: '' });
  const [customer, setCustomer] = useState(null);          // found repeat customer

  // Modals
  const [customizeItem, setCustomizeItem] = useState(null); // cart item being customized
  const [sizePicker, setSizePicker] = useState(null);       // { product, sizes, onPick }
  const [feeModal, setFeeModal] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [printModal, setPrintModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null); // order saved, awaiting print choice
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // ── Load data ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      categoriesList(),
      dayGetCurrent(),
      settingsGet(),
    ]).then(([catRes, _dayRes, setRes]) => {
      if (catRes.ok && catRes.data.length > 0) {
        setCategories(catRes.data);
        setActiveCat(catRes.data[0].id);
      }
      if (setRes.ok) {
        const fee = setRes.data.delivery_fee_default;
        if (fee) {
          setDefaultFee(Number(fee));
          setDeliveryFee(fromMinor(Number(fee)).toString());
        }
      }
    });
  }, []);

  const loadProducts = useCallback(async () => {
    if (!activeCat) return;
    const res = await productsList(activeCat);
    if (res.ok) setProducts(res.data.filter(p => p.active));
  }, [activeCat]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Reset delivery fee when switching to delivery
  useEffect(() => {
    if (orderType === 'delivery') {
      setDeliveryFee(fromMinor(defaultFee).toString());
    } else {
      setDeliveryFee('0');
    }
  }, [orderType, defaultFee]);

  // ── Cart helpers ───────────────────────────────────────────────
  const cartTotal = cart.reduce((s, item) => {
    const optExtra = item.options.reduce((os, o) => os + o.price, 0);
    return s + (item.finalUnitPrice + optExtra) * item.qty;
  }, 0);
  const feeMinor = toMinor(deliveryFee);
  const grandTotal = cartTotal + feeMinor;

  /**
   * Add a product to the cart.
   * If the product has sizes, open the SizePickerModal first.
   * If no size is chosen (modal closed), nothing is added.
   */
  async function addToCart(product) {
    // Load options to check for sizes
    const res = await optionsList(product.id);
    if (!res.ok) return;
    const allOptions = res.data;
    const sizes = allOptions.filter(o => o.type === 'size');

    if (sizes.length > 0) {
      // Must pick a size before adding
      setSizePicker({
        product,
        sizes,
        onPick: (size, finalPrice) => {
          setSizePicker(null);
          doAddToCart(product, size, finalPrice, allOptions.filter(o => o.type === 'extra'));
        },
      });
    } else {
      // No sizes – add directly
      doAddToCart(product, null, product.price, []);
    }
  }

  function doAddToCart(product, size, finalUnitPrice, _availableExtras) {
    setCart(prev => {
      // Increment qty only if no size, no options, no note
      if (!size) {
        const existing = prev.findIndex(
          i => i.product_id === product.id && !i.sizeName && i.options.length === 0 && !i.note,
        );
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], qty: updated[existing].qty + 1 };
          return updated;
        }
      }
      return [...prev, {
        cartId: Date.now() + Math.random(),
        product_id: product.id,
        product_name: product.name,
        price: product.price,            // base price (minor units)
        finalUnitPrice,                  // computed final price (minor units)
        size_price_mode: product.size_price_mode ?? 'absolute',
        sizeName: size?.label ?? null,
        sizeOptionId: size?.id ?? null,
        sizeOptionPrice: size?.price ?? null,
        qty: 1,
        options: [],
        note: '',
        image_url: product.image_url,
      }];
    });
  }

  function removeFromCart(cartId) {
    setCart(prev => prev.filter(i => i.cartId !== cartId));
  }

  function changeQty(cartId, delta) {
    setCart(prev => prev.map(i => {
      if (i.cartId !== cartId) return i;
      const newQty = i.qty + delta;
      return newQty < 1 ? null : { ...i, qty: newQty };
    }).filter(Boolean));
  }

  function clearCart() {
    setCart([]);
    setDeliveryForm({ name: '', phone: '', address: '' });
    setCustomer(null);
    setError('');
  }

  // ── Customer lookup on phone change ───────────────────────────
  async function handlePhoneChange(phone) {
    setDeliveryForm(f => ({ ...f, phone }));
    if (phone.length >= 9) {
      const res = await customerLookup(phone);
      if (res.ok && res.data) {
        setCustomer(res.data);
        setDeliveryForm({ name: res.data.name, phone, address: res.data.address ?? '' });
      } else {
        setCustomer(null);
      }
    }
  }

  // ── Complete order ─────────────────────────────────────────────
  async function submitOrder() {
    if (cart.length === 0) { setError(ar.cartEmpty); return; }
    if (orderType === 'delivery' && !deliveryForm.phone.trim()) {
      setError('رقم الهاتف مطلوب للتوصيل');
      return;
    }

    setBusy(true);
    setError('');

    const items = cart.map(item => {
      // Build options array: size option (as snapshot) + extras
      const sizeOpt = item.sizeName
        ? [{ id: item.sizeOptionId, label: item.sizeName, price: item.sizeOptionPrice ?? 0, type: 'size' }]
        : [];
      const extraOpts = item.options.filter(o => o.type !== 'size');
      return {
        product_id: item.product_id,
        product_name: item.product_name + (item.sizeName ? ` — ${item.sizeName}` : ''),
        unit_price: item.finalUnitPrice,   // FINAL price at time of sale
        qty: item.qty,
        options: [...sizeOpt, ...extraOpts],
        note: item.note,
      };
    });

    const res = await ordersCreate({
      order_type: orderType,
      items,
      delivery_fee: feeMinor,
      delivery_name: deliveryForm.name,
      delivery_phone: deliveryForm.phone,
      delivery_addr: deliveryForm.address,
    });

    setBusy(false);
    if (res.ok) {
      setCompleteModal(false);
      setLastOrder(res.data);
      setPrintModal(true);
    } else {
      setError(res.error ?? ar.unknownError);
    }
  }

  // ── Print dialog done ──────────────────────────────────────────
  function handlePrintDone() {
    setPrintModal(false);
    setLastOrder(null);
    clearCart();
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={styles.pos}>
      {/* ── Left: Product browser ──────────────────────────────── */}
      <div className={styles.browser}>
        {/* Category tabs – scrollable, arrow buttons, edge fades */}
        <CategoryTabs
          categories={categories}
          activeId={activeCat}
          onChange={setActiveCat}
        />

        {/* Product grid */}
        <div className={styles.prodGrid}>
          {products.map(p => (
            <ProductTile
              key={p.id}
              product={p}
              onClick={addToCart}
              computeUnitPrice={computeUnitPrice}
            />
          ))}
          {products.length === 0 && (
            <p className={styles.emptyHint}>{ar.noData}</p>
          )}
        </div>
      </div>

      {/* ── Right: Cart ─────────────────────────────────────────── */}
      <div className={styles.cartPanel}>
        {/* Order type selector */}
        <div className={styles.typeRow}>
          {ORDER_TYPES.map(t => (
            <button
              key={t.key}
              className={`${styles.typeBtn} ${orderType === t.key ? styles.typeBtnActive : ''}`}
              onClick={() => setOrderType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Delivery form */}
        {orderType === 'delivery' && (
          <div className={styles.deliveryForm}>
            <input
              className={styles.deliveryInput}
              placeholder={ar.customerPhone}
              value={deliveryForm.phone}
              onChange={e => handlePhoneChange(e.target.value)}
              dir="ltr"
            />
            <input
              className={styles.deliveryInput}
              placeholder={ar.customerName}
              value={deliveryForm.name}
              onChange={e => setDeliveryForm(f => ({ ...f, name: e.target.value }))}
            />
            <input
              className={styles.deliveryInput}
              placeholder={ar.customerAddress}
              value={deliveryForm.address}
              onChange={e => setDeliveryForm(f => ({ ...f, address: e.target.value }))}
            />
            {customer && (
              <p className={styles.repeatCustomer}>
                <Icon name="user" size={13} /> {ar.existingCustomer}: {customer.name}
              </p>
            )}
          </div>
        )}

        {/* Cart items */}
        <div className={styles.cartItems}>
          {cart.length === 0 ? (
            <div className={styles.cartEmpty}>
              <Icon name="cart" size={36} className={styles.cartEmptyIcon} />
              <span>{ar.cartEmpty}</span>
            </div>
          ) : cart.map(item => (
            <CartRow
              key={item.cartId}
              item={item}
              onQtyChange={(delta) => changeQty(item.cartId, delta)}
              onRemove={() => removeFromCart(item.cartId)}
              onCustomize={() => setCustomizeItem(item)}
              onChangeSize={async () => {
                // Reopen size picker for this item
                const res = await optionsList(item.product_id);
                if (!res.ok) return;
                const sizes = res.data.filter(o => o.type === 'size');
                if (!sizes.length) return;
                // Get fresh product data from current products list
                const prod = products.find(p => p.id === item.product_id);
                if (!prod) return;
                setSizePicker({
                  product: prod,
                  sizes,
                  onPick: (size, finalPrice) => {
                    setSizePicker(null);
                    setCart(prev => prev.map(i =>
                      i.cartId === item.cartId
                        ? { ...i, sizeName: size.label, sizeOptionId: size.id, sizeOptionPrice: size.price, finalUnitPrice: finalPrice }
                        : i,
                    ));
                  },
                });
              }}
            />
          ))}
        </div>

        {/* Totals */}
        <div className={styles.totalsArea}>
          {orderType === 'delivery' && (
            <div className={styles.totalRow}>
              <span>{ar.deliveryFee}</span>
              <button className={styles.feeValue} onClick={() => setFeeModal(true)}>
                {format(feeMinor)} {ar.currency}
              </button>
            </div>
          )}
          <div className={`${styles.totalRow} ${styles.grandTotalRow}`}>
            <span>{ar.grandTotal}</span>
            <span className={styles.grandTotalValue}>{format(grandTotal)} {ar.currency}</span>
          </div>
        </div>

        {/* Actions */}
        {error && <p className={styles.posError}>{error}</p>}
        <div className={styles.cartActions}>
          <button className={styles.clearBtn} onClick={clearCart} disabled={cart.length === 0}>
            <Icon name="trash" size={16} />
          </button>
          <Button
            fullWidth
            size="lg"
            onClick={() => { setError(''); setCompleteModal(true); }}
            disabled={cart.length === 0}
          >
            <Icon name="check" size={18} />
            {ar.completeOrder}
          </Button>
        </div>
      </div>

      {/* ── Size picker modal ────────────────────────────────────── */}
      {sizePicker && (
        <SizePickerModal
          product={sizePicker.product}
          sizes={sizePicker.sizes}
          onPick={sizePicker.onPick}
          onClose={() => setSizePicker(null)}
        />
      )}

      {/* ── Delivery fee numpad modal ───────────────────────────── */}
      <Modal open={feeModal} title={ar.deliveryFee} onClose={() => setFeeModal(false)} size="sm">
        <NumPad value={deliveryFee} onChange={setDeliveryFee} decimal />
        <div style={{ marginTop: 12 }}>
          <Button fullWidth onClick={() => setFeeModal(false)}>{ar.confirm}</Button>
        </div>
      </Modal>

      {/* ── Customize item modal ────────────────────────────────── */}
      {customizeItem && (
        <CustomizeModal
          item={customizeItem}
          onClose={() => setCustomizeItem(null)}
          onSave={(updated) => {
            setCart(prev => prev.map(i => i.cartId === updated.cartId ? updated : i));
            setCustomizeItem(null);
          }}
        />
      )}

      {/* ── Complete order confirmation modal ───────────────────── */}
      <Modal
        open={completeModal}
        title={ar.completeOrder}
        onClose={() => !busy && setCompleteModal(false)}
        size="sm"
      >
        <div className={styles.completeSummary}>
          <div className={styles.completeTotalRow}>
            <span>{ar.grandTotal}</span>
            <span className={styles.completeTotalAmt}>{format(grandTotal)} {ar.currency}</span>
          </div>
        </div>
        {error && <p className={styles.posError} style={{ padding: '4px 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button variant="ghost" fullWidth onClick={() => setCompleteModal(false)} disabled={busy}>
            {ar.cancel}
          </Button>
          <Button variant="primary" fullWidth onClick={submitOrder} disabled={busy}>
            {busy ? ar.loading : ar.confirm}
          </Button>
        </div>
      </Modal>

      {/* ── Print dialog ────────────────────────────────────────── */}
      <PrintDialog
        open={printModal}
        orderId={lastOrder?.order?.id ?? lastOrder?.id}
        onDone={handlePrintDone}
      />
    </div>
  );
}

// ── ProductTile ────────────────────────────────────────────────────
/**
 * Lazy-loads options to show "من <price>" for sized products.
 */
function ProductTile({ product, onClick, computeUnitPrice: computeFn }) {
  const [displayInfo, setDisplayInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    optionsList(product.id).then(res => {
      if (cancelled || !res.ok) return;
      const sizes = res.data.filter(o => o.type === 'size');
      if (sizes.length > 0) {
        const prices = sizes.map(s => computeFn(product.price, product.size_price_mode ?? 'absolute', s.price));
        setDisplayInfo({ hasSizes: true, lowestPrice: Math.min(...prices) });
      } else {
        setDisplayInfo({ hasSizes: false });
      }
    });
    return () => { cancelled = true; };
  }, [product.id, product.price, product.size_price_mode, computeFn]);

  const priceDisplay = displayInfo?.hasSizes
    ? `${ar.fromPrice} ${format(displayInfo.lowestPrice)} ${ar.currency}`
    : `${format(product.price)} ${ar.currency}`;

  return (
    <button key={product.id} className={styles.prodTile} onClick={() => onClick(product)}>
      <div className={styles.tileImg}>
        {product.image_url
          ? <img src={product.image_url} alt={product.name} />
          : <Icon name="image" size={28} className={styles.tileNoImg} />
        }
      </div>
      <div className={styles.tileBody}>
        <span className={styles.tileName}>{product.name}</span>
        <span className={styles.tilePrice}>{priceDisplay}</span>
      </div>
    </button>
  );
}

// ── CartRow ────────────────────────────────────────────────────────
function CartRow({ item, onQtyChange, onRemove, onCustomize, onChangeSize }) {
  const optExtra = item.options.filter(o => o.type !== 'size').reduce((s, o) => s + o.price, 0);
  const lineTotal = (item.finalUnitPrice + optExtra) * item.qty;

  return (
    <div className={styles.cartRow}>
      <div className={styles.cartRowMain}>
        <span className={styles.cartItemName}>
          {item.product_name}
          {item.sizeName && <span className={styles.cartItemSize}> — {item.sizeName}</span>}
        </span>
        {item.options.filter(o => o.type !== 'size').length > 0 && (
          <span className={styles.cartItemOpts}>
            {item.options.filter(o => o.type !== 'size').map(o => o.label).join('، ')}
          </span>
        )}
        {item.note && <span className={styles.cartItemNote}>{item.note}</span>}
        {item.sizeName && (
          <button className={styles.changeSizeBtn} onClick={onChangeSize}>
            {ar.changeSize}
          </button>
        )}
      </div>
      <div className={styles.cartRowControls}>
        <button className={styles.qtyBtn} onClick={() => onQtyChange(-1)}><Icon name="minus" size={13} /></button>
        <span className={styles.qtyValue}>{item.qty}</span>
        <button className={styles.qtyBtn} onClick={() => onQtyChange(1)}><Icon name="plus" size={13} /></button>
        <span className={styles.cartLineTotal}>{format(lineTotal)}</span>
        <button className={styles.cartCustomizeBtn} onClick={onCustomize}><Icon name="options" size={14} /></button>
        <button className={styles.cartRemoveBtn} onClick={onRemove}><Icon name="trash" size={14} /></button>
      </div>
    </div>
  );
}

// ── CustomizeModal (extras only – sizes already picked) ────────────
function CustomizeModal({ item, onClose, onSave }) {
  const [options, setOptions] = useState(item.options ?? []);
  const [note, setNote] = useState(item.note ?? '');
  const [allOptions, setAllOptions] = useState([]);

  useEffect(() => {
    optionsList(item.product_id).then(res => {
      if (res.ok) setAllOptions(res.data);
    });
  }, [item.product_id]);

  function toggleOption(opt) {
    setOptions(prev => {
      const exists = prev.find(o => o.id === opt.id);
      if (exists) return prev.filter(o => o.id !== opt.id);
      return [...prev, { id: opt.id, label: opt.label, price: opt.price, type: opt.type }];
    });
  }

  // Only show extras in the customize modal (size is managed via SizePickerModal)
  const extras = allOptions.filter(o => o.type === 'extra');

  return (
    <Modal open title={`${ar.customize} – ${item.product_name}`} onClose={onClose} size="sm">
      <div className={styles.customizeWrap}>
        {extras.length > 0 && (
          <div className={styles.optGroup}>
            <p className={styles.optGroupTitle}>{ar.extras}</p>
            <div className={styles.optChips}>
              {extras.map(o => (
                <button
                  key={o.id}
                  className={`${styles.optChip} ${options.find(x => x.id === o.id) ? styles.optChipActive : ''}`}
                  onClick={() => toggleOption(o)}
                >
                  {o.label}
                  {o.price > 0 && <span className={styles.optChipPrice}>+{format(o.price)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <FormField label={ar.note}>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={ar.notePlaceholder}
          />
        </FormField>
        <Button fullWidth onClick={() => onSave({ ...item, options, note })}>{ar.confirm}</Button>
      </div>
    </Modal>
  );
}
