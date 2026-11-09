/**
 * Date/time utilities.
 * @module electron/utils/dates
 */

/**
 * Return the current date as YYYY-MM-DD.
 * @returns {string}
 */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return the current ISO datetime string (UTC).
 * @returns {string}
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Format a datetime string for display (Arabic locale, local time).
 * @param {string|number} value – ISO string or Unix timestamp
 * @returns {string}
 */
export function formatDisplay(value) {
  if (!value) return '';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Return the date part of an ISO datetime string.
 * @param {string} iso
 * @returns {string} YYYY-MM-DD
 */
export function dateOnly(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}
