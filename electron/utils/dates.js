'use strict';

/**
 * Date/time utilities.
 * All "today" / date-label computations use LOCAL calendar time
 * (the machine's wall-clock date) so the app works correctly for
 * Algeria UTC+1 (and any other timezone) across midnight.
 * @module electron/utils/dates
 */

/**
 * Return the LOCAL date as YYYY-MM-DD (never UTC).
 * Uses getFullYear/getMonth/getDate so midnight local == correct date.
 * @param {Date} [d]
 * @returns {string}
 */
function localISODate(d) {
  const dt = d ?? new Date();
  const y  = dt.getFullYear();
  const m  = String(dt.getMonth() + 1).padStart(2, '0');
  const dy = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/**
 * Parse a YYYY-MM-DD string as a LOCAL midnight Date (not UTC midnight).
 * new Date('YYYY-MM-DD') parses as UTC — this avoids that trap.
 * @param {string} iso  YYYY-MM-DD
 * @returns {Date}
 */
function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Return the current date as YYYY-MM-DD (local time).
 * Replaces the old toISOString().slice(0,10) which returned UTC date.
 * @returns {string}
 */
function today() {
  return localISODate();
}

/**
 * Return the current ISO datetime string (UTC).
 * Timestamps stored in the DB are UTC ISO strings — that is correct.
 * Only DATE LABELS (business_days.date) must use local time.
 * @returns {string}
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Format a datetime string for display using Algerian date format DD/MM/YYYY.
 * Uses English digits.
 * @param {string|number} value – ISO string or Unix timestamp
 * @returns {string}
 */
function formatDisplay(value) {
  if (!value) return '';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins  = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

/**
 * Return the date part of an ISO datetime string.
 * @param {string} iso
 * @returns {string} YYYY-MM-DD
 */
function dateOnly(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/**
 * Format a YYYY-MM-DD or ISO date string as DD/MM/YYYY (English digits).
 * @param {string} iso
 * @returns {string}
 */
function fmtDate(iso) {
  if (!iso) return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

module.exports = { today, nowIso, localISODate, parseISODate, formatDisplay, dateOnly, fmtDate };
