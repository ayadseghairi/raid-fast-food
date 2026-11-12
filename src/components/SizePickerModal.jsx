import React from 'react';
import ar from '../i18n/ar.js';
import { format } from '../utils/money.js';
import Modal from './Modal.jsx';
import styles from './SizePickerModal.module.css';

/**
 * SizePickerModal
 *
 * Opens when a product has sizes. Displays one large button per size
 * showing: size name + FINAL price (already computed by the service layer).
 *
 * Props:
 *   product    – the product row (needs .name, .price, .size_price_mode)
 *   sizes      – array of size option rows { id, label, price } where price is:
 *                  absolute mode → full unit price
 *                  delta mode    → add-on on top of product.price
 *   onPick(size, finalPrice) – called when user taps a size; never called on close
 *   onClose()  – called when user dismisses without picking
 */
export default function SizePickerModal({ product, sizes, onPick, onClose }) {
  if (!product || !sizes) return null;

  /**
   * Compute final price for display.
   * This mirrors services/products.js computeUnitPrice exactly.
   */
  function finalPrice(size) {
    if (product.size_price_mode === 'absolute') return size.price;
    return product.price + size.price;
  }

  return (
    <Modal
      open
      title={`${ar.chooseSizeTitle} – ${product.name}`}
      onClose={onClose}
      size="sm"
    >
      <div className={styles.grid}>
        {sizes.map(size => (
          <button
            key={size.id}
            className={styles.sizeBtn}
            onClick={() => onPick(size, finalPrice(size))}
          >
            <span className={styles.sizeName}>{size.label}</span>
            <span className={styles.sizePrice}>{format(finalPrice(size))} {ar.currency}</span>
          </button>
        ))}
      </div>
      <p className={styles.hint}>{ar.sizeRequired}</p>
    </Modal>
  );
}
