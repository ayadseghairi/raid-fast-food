/**
 * Money helpers re-exported for use in the renderer (src/).
 * Source of truth is electron/utils/money.js – keep in sync.
 */

/** @param {number} minor @returns {string} */
export function format(minor) {
  if (minor === null || minor === undefined) return '0.00';
  return (minor / 100).toFixed(2);
}

/** @param {number|string} decimal @returns {number} */
export function toMinor(decimal) {
  if (decimal === null || decimal === undefined || decimal === '') return 0;
  return Math.round(Number(decimal) * 100);
}

/** @param {number} minor @returns {number} */
export function fromMinor(minor) {
  if (minor === null || minor === undefined) return 0;
  return minor / 100;
}

/**
 * Format a YYYY-MM-DD or ISO date string as DD/MM/YYYY (English digits, Algerian style).
 * @param {string} iso
 * @returns {string}
 */
export function fmtDate(iso) {
  if (!iso) return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Format a full ISO datetime string as DD/MM/YYYY HH:MM (English digits).
 * @param {string} iso
 * @returns {string}
 */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const h     = String(d.getHours()).padStart(2, '0');
  const m     = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${h}:${m}`;
}
