/**
 * Money helper – all amounts stored as INTEGER minor units (×100).
 * Use these everywhere; never do float arithmetic on money.
 *
 * @module electron/utils/money
 */

/**
 * Convert a decimal number (e.g. 12.50) to integer minor units (1250).
 * Accepts strings too.
 * @param {number|string} decimal
 * @returns {number} integer minor units
 */
export function toMinor(decimal) {
  if (decimal === null || decimal === undefined || decimal === '') return 0;
  // Round to avoid float drift: 12.505 → 1251 not 1250
  return Math.round(Number(decimal) * 100);
}

/**
 * Convert integer minor units (1250) to a decimal number (12.5).
 * @param {number} minor
 * @returns {number}
 */
export function fromMinor(minor) {
  if (minor === null || minor === undefined) return 0;
  return minor / 100;
}

/**
 * Format integer minor units as a display string with 2 decimal places.
 * e.g. 25050 → "250.50"
 * @param {number} minor
 * @returns {string}
 */
export function format(minor) {
  if (minor === null || minor === undefined) return '0.00';
  return (minor / 100).toFixed(2);
}
