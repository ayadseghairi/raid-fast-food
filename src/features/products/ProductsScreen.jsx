import React, { useState, useEffect, useCallback } from 'react';
import ar from '../../i18n/ar.js';
import Icon from '../../components/Icon.jsx';
import {
  categoriesList, categoriesCreate, categoriesUpdate, categoriesDelete,
  productsList, productsCreate, productsUpdate, productsDelete, productsSetActive,
  productsPickImage,
  optionsList, optionsCreate, optionsUpdate, optionsDelete,
} from '../../api/index.js';
import { format } from '../../utils/money.js';
import Button from '../../components/Button.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormField from '../../components/FormField.jsx';
import NumPad from '../../components/NumPad.jsx';
import styles from './ProductsScreen.module.css';

export default function ProductsScreen() {
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [catModal, setCatModal] = useState(null);    // null | {mode:'add'} | {mode:'edit', row}
  const [prodModal, setProdModal] = useState(null);  // null | {mode:'add'} | {mode:'edit', row}
  const [optModal, setOptModal] = useState(null);    // null | product row
  const [delCat, setDelCat] = useState(null);
  const [delProd, setDelProd] = useState(null);

  // ── Load categories ────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    const res = await categoriesList();
    if (res.ok) {
      setCategories(res.data);
      if (!activeCat && res.data.length > 0) setActiveCat(res.data[0].id);
    }
  }, [activeCat]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCategories(); }, []); // intentionally run once on mount

  // ── Load products when active category changes ─────────────────
  const loadProducts = useCallback(async () => {
    if (!activeCat) { setProducts([]); return; }
    setLoading(true);
    const res = await productsList(activeCat);
    setLoading(false);
    if (res.ok) setProducts(res.data);
  }, [activeCat]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Category actions ───────────────────────────────────────────
  async function handleDeleteCategory() {
    const res = await categoriesDelete(delCat.id);
    setDelCat(null);
    if (res.ok) {
      const remaining = categories.filter(c => c.id !== delCat.id);
      setCategories(remaining);
      setActiveCat(remaining[0]?.id ?? null);
    }
  }

  // ── Product actions ────────────────────────────────────────────
  async function handleToggleActive(prod) {
    await productsSetActive(prod.id, !prod.active);
    loadProducts();
  }

  async function handleDeleteProduct() {
    await productsDelete(delProd.id);
    setDelProd(null);
    loadProducts();
  }

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h2 className={styles.title}>{ar.products}</h2>
        <Button onClick={() => setProdModal({ mode: 'add' })} size="sm" disabled={!activeCat}>
          + {ar.addProduct}
        </Button>
      </div>

      {/* ── Category tabs ─────────────────────────────────────── */}
      <div className={styles.tabsRow}>
        <div className={styles.tabs}>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`${styles.tab} ${activeCat === cat.id ? styles.tabActive : ''}`}
              onClick={() => setActiveCat(cat.id)}
              onDoubleClick={() => setCatModal({ mode: 'edit', row: cat })}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className={styles.catActions}>
          <Button size="sm" variant="ghost" onClick={() => setCatModal({ mode: 'add' })}>
            + {ar.addCategory}
          </Button>
          {activeCat && (
            <>
              <Button size="sm" variant="ghost"
                onClick={() => setCatModal({ mode: 'edit', row: categories.find(c => c.id === activeCat) })}>
                {ar.edit}
              </Button>
              <Button size="sm" variant="danger"
                onClick={() => setDelCat(categories.find(c => c.id === activeCat))}>
                {ar.delete}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Product grid ──────────────────────────────────────── */}
      {loading ? (
        <div className={styles.empty}>{ar.loading}</div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <p>{ar.noData}</p>
          {activeCat && (
            <Button onClick={() => setProdModal({ mode: 'add' })}>+ {ar.addProduct}</Button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map(prod => (
            <ProductCard
              key={prod.id}
              product={prod}
              onEdit={() => setProdModal({ mode: 'edit', row: prod })}
              onToggle={() => handleToggleActive(prod)}
              onDelete={() => setDelProd(prod)}
              onOptions={() => setOptModal(prod)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────── */}
      {catModal && (
        <CategoryModal
          mode={catModal.mode}
          initial={catModal.row}
          onClose={() => setCatModal(null)}
          onSave={async (name) => {
            let res;
            if (catModal.mode === 'add') {
              res = await categoriesCreate({ name });
            } else {
              res = await categoriesUpdate(catModal.row.id, { name });
            }
            if (res.ok) { setCatModal(null); loadCategories(); }
            return res;
          }}
        />
      )}

      {prodModal && (
        <ProductModal
          mode={prodModal.mode}
          initial={prodModal.row}
          categoryId={activeCat}
          categories={categories}
          onClose={() => setProdModal(null)}
          onSave={async (data) => {
            let res;
            if (prodModal.mode === 'add') {
              res = await productsCreate(data);
            } else {
              res = await productsUpdate(prodModal.row.id, data);
            }
            if (res.ok) { setProdModal(null); loadProducts(); }
            return res;
          }}
        />
      )}

      {optModal && (
        <OptionsModal
          product={optModal}
          onClose={() => setOptModal(null)}
        />
      )}

      <ConfirmDialog
        open={!!delCat}
        message={ar.confirmDeleteCategory}
        confirmLabel={ar.delete}
        confirmVariant="danger"
        onConfirm={handleDeleteCategory}
        onCancel={() => setDelCat(null)}
      />
      <ConfirmDialog
        open={!!delProd}
        message={ar.confirmDeleteProduct}
        confirmLabel={ar.delete}
        confirmVariant="danger"
        onConfirm={handleDeleteProduct}
        onCancel={() => setDelProd(null)}
      />
    </div>
  );
}

// ── ProductCard ────────────────────────────────────────────────────
function ProductCard({ product, onEdit, onToggle, onDelete, onOptions }) {
  return (
    <div className={`${styles.card} ${!product.active ? styles.cardSuspended : ''}`}>
      <div className={styles.cardImg}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} />
        ) : (
          <span className={styles.noImg}><Icon name="image" size={36} /></span>
        )}
        {!product.active && <div className={styles.suspendedBadge}>{ar.productSuspended}</div>}
      </div>
      <div className={styles.cardBody}>
        <p className={styles.cardName}>{product.name}</p>
        <p className={styles.cardPrice}>{format(product.price)} {ar.currency}</p>
      </div>
      <div className={styles.cardActions}>
        <button className={styles.iconBtn} onClick={onEdit} title={ar.edit}><Icon name="edit" size={17} /></button>
        <button className={styles.iconBtn} onClick={onOptions} title="خيارات"><Icon name="options" size={17} /></button>
        <button className={styles.iconBtn} onClick={onToggle} title={product.active ? ar.suspendProduct : ar.activateProduct}>
          {product.active ? <Icon name="pause" size={17} /> : <Icon name="play" size={17} />}
        </button>
        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete} title={ar.delete}><Icon name="trash" size={17} /></button>
      </div>
    </div>
  );
}

// ── CategoryModal ──────────────────────────────────────────────────
function CategoryModal({ mode, initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setError(ar.required); return; }
    setBusy(true);
    const res = await onSave(name.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <Modal
      open
      title={mode === 'add' ? ar.addCategory : ar.editCategory}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={submit} className={styles.modalForm}>
        <FormField label={ar.categoryName} error={error} required>
          <input
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
          />
        </FormField>
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" onClick={onClose}>{ar.cancel}</Button>
          <Button type="submit" disabled={busy}>{ar.save}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── ProductModal ───────────────────────────────────────────────────
function ProductModal({ mode, initial, categoryId, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    category_id: initial?.category_id ?? categoryId ?? '',
    price: initial ? String(initial.price / 100) : '0',
    imagePath: null,
  });
  const [previewUrl, setPreviewUrl] = useState(initial?.image_url ?? null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: undefined })); };

  async function pickImage() {
    const res = await productsPickImage();
    if (res.ok && !res.data.canceled) {
      set('imagePath', res.data.filePath);
      // Use the data: URI from main — file:// is blocked by CSP in dev
      setPreviewUrl(res.data.previewUrl);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = ar.required;
    if (!form.category_id) errs.category_id = ar.required;
    if (Number(form.price) < 0) errs.price = 'السعر لا يمكن أن يكون سالباً';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    const res = await onSave({
      name: form.name.trim(),
      category_id: Number(form.category_id),
      price: form.price,
      imagePath: form.imagePath,
    });
    setBusy(false);
    if (!res.ok) setErrors({ submit: res.error });
  }

  return (
    <Modal
      open
      title={mode === 'add' ? ar.addProduct : ar.editProduct}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={submit} className={styles.modalForm}>
        {/* Image picker */}
        <div className={styles.imagePicker} onClick={pickImage}>
          {previewUrl ? (
            <img src={previewUrl} alt="preview" className={styles.imagePreview} />
          ) : (
            <div className={styles.imagePlaceholder}>
              <Icon name="camera" size={32} />
              <span>{ar.chooseImage}</span>
            </div>
          )}
        </div>

        <FormField label={ar.productName} error={errors.name} required>
          <input value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
        </FormField>

        <FormField label={ar.productCategory} error={errors.category_id} required>
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">{ar.select}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>

        <FormField label={`${ar.productPrice} (${ar.currency})`} error={errors.price} required>
          <input
            value={form.price}
            readOnly
            onClick={() => setShowNumpad(true)}
            className={styles.numInput}
          />
        </FormField>

        {showNumpad && (
          <div className={styles.numpadWrap}>
            <NumPad value={form.price} onChange={v => set('price', v)} decimal />
            <Button size="sm" fullWidth onClick={() => setShowNumpad(false)}>{ar.confirm}</Button>
          </div>
        )}

        {errors.submit && <p className={styles.submitError}>{errors.submit}</p>}

        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" onClick={onClose}>{ar.cancel}</Button>
          <Button type="submit" disabled={busy}>{ar.save}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── OptionsModal ───────────────────────────────────────────────────
function OptionsModal({ product, onClose }) {
  const [options, setOptions] = useState([]);
  const [form, setForm] = useState({ type: 'size', label: '', price: '0' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = useCallback(async () => {
    const res = await optionsList(product.id);
    if (res.ok) setOptions(res.data);
  }, [product.id]);

  useEffect(() => { load(); }, [load]);

  async function addOption(e) {
    e.preventDefault();
    const errs = {};
    if (!form.label.trim()) errs.label = ar.required;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res = await optionsCreate({
      product_id: product.id,
      type: form.type,
      label: form.label.trim(),
      price: form.price,
    });
    setBusy(false);
    if (res.ok) { setForm({ type: 'size', label: '', price: '0' }); load(); }
    else setErrors({ submit: res.error });
  }

  async function saveEdit(id) {
    await optionsUpdate(id, { label: editForm.label, price: editForm.price });
    setEditingId(null);
    load();
  }

  async function removeOption(id) {
    await optionsDelete(id);
    load();
  }

  const sizes = options.filter(o => o.type === 'size');
  const extras = options.filter(o => o.type === 'extra');

  return (
    <Modal open title={`${ar.customize} – ${product.name}`} onClose={onClose} size="md">
      <div className={styles.optionsWrap}>
        {/* Sizes */}
        <section>
          <h4 className={styles.optSection}>{ar.sizes}</h4>
          <OptionList
            items={sizes}
            editingId={editingId}
            editForm={editForm}
            onEdit={(o) => { setEditingId(o.id); setEditForm({ label: o.label, price: String(o.price / 100) }); }}
            onSave={saveEdit}
            onCancel={() => setEditingId(null)}
            onEditForm={setEditForm}
            onDelete={removeOption}
          />
        </section>
        {/* Extras */}
        <section>
          <h4 className={styles.optSection}>{ar.extras}</h4>
          <OptionList
            items={extras}
            editingId={editingId}
            editForm={editForm}
            onEdit={(o) => { setEditingId(o.id); setEditForm({ label: o.label, price: String(o.price / 100) }); }}
            onSave={saveEdit}
            onCancel={() => setEditingId(null)}
            onEditForm={setEditForm}
            onDelete={removeOption}
          />
        </section>

        {/* Add option form */}
        <form onSubmit={addOption} className={styles.addOptForm}>
          <h4 className={styles.optSection}>{ar.add}</h4>
          <div className={styles.addOptRow}>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={styles.addOptType}>
              <option value="size">{ar.sizeLabel}</option>
              <option value="extra">{ar.extraLabel}</option>
            </select>
            <input
              className={styles.addOptLabel}
              placeholder={ar.sizeLabel + ' / ' + ar.extraLabel}
              value={form.label}
              onChange={e => { setForm(f => ({ ...f, label: e.target.value })); setErrors({}); }}
            />
            <input
              className={styles.addOptPrice}
              placeholder="0.00"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              dir="ltr"
            />
            <Button type="submit" size="sm" disabled={busy}>{ar.add}</Button>
          </div>
          {errors.label && <p className={styles.submitError}>{errors.label}</p>}
          {errors.submit && <p className={styles.submitError}>{errors.submit}</p>}
        </form>
      </div>
    </Modal>
  );
}

function OptionList({ items, editingId, editForm, onEdit, onSave, onCancel, onEditForm, onDelete }) {
  if (!items.length) return <p className={styles.noOpts}>{ar.noData}</p>;
  return (
    <ul className={styles.optList}>
      {items.map(o => (
        <li key={o.id} className={styles.optItem}>
          {editingId === o.id ? (
            <>
              <input className={styles.optEditInput} value={editForm.label}
                onChange={e => onEditForm(f => ({ ...f, label: e.target.value }))} />
              <input className={styles.optEditPrice} value={editForm.price} dir="ltr"
                onChange={e => onEditForm(f => ({ ...f, price: e.target.value }))} />
              <Button size="sm" onClick={() => onSave(o.id)}>{ar.save}</Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>{ar.cancel}</Button>
            </>
          ) : (
            <>
              <span className={styles.optLabel}>{o.label}</span>
              <span className={styles.optPrice}>+{format(o.price)} {ar.currency}</span>
              <button className={styles.iconBtn} onClick={() => onEdit(o)} title={ar.edit}><Icon name="edit" size={16} /></button>
              <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => onDelete(o.id)} title={ar.delete}><Icon name="trash" size={16} /></button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
