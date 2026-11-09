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
