import React, { useState } from 'react';
import ar from '../../i18n/ar.js';
import logoUrl from '../../assets/logo.jpg';
import { setupComplete } from '../../api/index.js';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';
import NumPad from '../../components/NumPad.jsx';
import Modal from '../../components/Modal.jsx';
import styles from './SetupScreen.module.css';

const STEPS = ['restaurant', 'delivery', 'password'];

export default function SetupScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    restaurantName: '',
    phone: '',
    thankYou: 'شكراً لزيارتكم',
    deliveryFee: '0',
    ownerPassword: '',
    ownerPasswordConfirm: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [numpadTarget, setNumpadTarget] = useState(null); // 'deliveryFee'

  const set = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // ── Validation per step ──────────────────────────────────────
  function validateStep(s) {
    const errs = {};
    if (s === 0) {
      if (!form.restaurantName.trim()) errs.restaurantName = ar.required;
      if (!form.phone.trim()) errs.phone = ar.required;
    }
    if (s === 2) {
      if (!form.ownerPassword || form.ownerPassword.length < 4)
        errs.ownerPassword = 'كلمة المرور يجب أن تكون 4 أحرف على الأقل';
      if (form.ownerPassword !== form.ownerPasswordConfirm)
        errs.ownerPasswordConfirm = ar.passwordMismatch;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  }

  async function submit() {
    if (!validateStep(2)) return;
    setLoading(true);
    const res = await setupComplete({
      restaurantName: form.restaurantName.trim(),
      phone: form.phone.trim(),
      thankYou: form.thankYou.trim(),
      deliveryFee: form.deliveryFee,
      ownerPassword: form.ownerPassword,
    });
    setLoading(false);
    if (res.ok) {
      onComplete();
    } else {
      setErrors({ submit: res.error });
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <img src={logoUrl} alt={ar.appName} className={styles.logo} />
          <h1 className={styles.appName}>{ar.appName}</h1>
        </div>

        <h2 className={styles.title}>{ar.setupTitle}</h2>
        <p className={styles.subtitle}>{ar.setupSubtitle}</p>

        {/* Step indicator */}
        <div className={styles.steps}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`${styles.dot} ${i <= step ? styles.dotActive : ''}`}
            />
          ))}
        </div>

        {/* ── Step 0: Restaurant info ────────────────────── */}
        {step === 0 && (
          <div className={styles.form}>
            <FormField label={ar.restaurantName} error={errors.restaurantName} required>
              <input
                value={form.restaurantName}
                onChange={(e) => set('restaurantName', e.target.value)}
                placeholder="مثال: فاست فود رائد"
              />
            </FormField>
            <FormField label={ar.restaurantPhone} error={errors.phone} required>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="05xxxxxxxx"
                dir="ltr"
              />
            </FormField>
            <FormField label={ar.thankYouMessage}>
              <input
                value={form.thankYou}
                onChange={(e) => set('thankYou', e.target.value)}
              />
            </FormField>
            <Button fullWidth onClick={next}>{ar.save} ←</Button>
          </div>
        )}

        {/* ── Step 1: Delivery fee ───────────────────────── */}
        {step === 1 && (
          <div className={styles.form}>
            <FormField label={ar.defaultDeliveryFee}>
              <input
                value={form.deliveryFee}
                readOnly
                onClick={() => setNumpadTarget('deliveryFee')}
                className={styles.numInput}
                placeholder="0.00"
              />
            </FormField>
            <NumPad
              value={form.deliveryFee}
              onChange={(v) => set('deliveryFee', v)}
              decimal
            />
            <div className={styles.row}>
              <Button variant="ghost" onClick={() => setStep(0)}>{ar.back}</Button>
              <Button onClick={next}>{ar.save} ←</Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Owner password ─────────────────────── */}
        {step === 2 && (
          <div className={styles.form}>
            <FormField label={ar.ownerPassword} error={errors.ownerPassword} required>
              <input
                type="password"
                value={form.ownerPassword}
                onChange={(e) => set('ownerPassword', e.target.value)}
                placeholder={ar.passwordPlaceholder}
              />
            </FormField>
            <FormField label={ar.ownerPasswordConfirm} error={errors.ownerPasswordConfirm} required>
              <input
                type="password"
                value={form.ownerPasswordConfirm}
                onChange={(e) => set('ownerPasswordConfirm', e.target.value)}
                placeholder={ar.passwordPlaceholder}
              />
            </FormField>
            {errors.submit && <p className={styles.submitError}>{errors.submit}</p>}
            <div className={styles.row}>
              <Button variant="ghost" onClick={() => setStep(1)}>{ar.back}</Button>
              <Button onClick={submit} disabled={loading}>
                {loading ? ar.loading : ar.startApp}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* NumPad modal (unused after step 1 restructure, kept for reuse) */}
      <Modal
        open={numpadTarget !== null}
        title={ar.defaultDeliveryFee}
        onClose={() => setNumpadTarget(null)}
        size="sm"
      >
        <NumPad
          value={form[numpadTarget] ?? ''}
          onChange={(v) => set(numpadTarget, v)}
          decimal
        />
        <div style={{ marginTop: 16 }}>
          <Button fullWidth onClick={() => setNumpadTarget(null)}>{ar.confirm}</Button>
        </div>
      </Modal>
    </div>
  );
}
