'use strict';

/**
 * Date/time utilities.
 * @module electron/utils/dates
 */

/**
 * Return the current date as YYYY-MM-DD.
 * @returns {string}
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return the current ISO datetime string (UTC).
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

module.exports = { today, nowIso, formatDisplay, dateOnly, fmtDate };
