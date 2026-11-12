'use strict';

/**
 * Simple rotating file logger for Windows debugging.
 *
 * - Log file: userData/logs/app.log
 * - Rotates at ~1 MB, keeps 3 files (app.log, app.log.1, app.log.2)
 * - No external dependencies
 *
 * @module electron/utils/logger
 */

const fs   = require('node:fs');
const path = require('node:path');

const MAX_SIZE_BYTES = 1024 * 1024; // 1 MB
const MAX_FILES      = 3;

let _logDir  = null;
let _logPath = null;

/**
 * Initialize the logger. Must be called after app.getPath('userData') is available.
 * @param {string} userData – absolute path to Electron userData folder
 */
function init(userData) {
  _logDir  = path.join(userData, 'logs');
  _logPath = path.join(_logDir, 'app.log');
  try { fs.mkdirSync(_logDir, { recursive: true }); } catch { /* already exists */ }
}

/**
 * Write a line to the log. Rotates if the file exceeds MAX_SIZE_BYTES.
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 * @param {unknown} [extra]
 */
function log(level, message, extra) {
  if (!_logPath) return; // not initialized (e.g. in tests)

  try {
    rotate();
    const ts   = new Date().toISOString();
    const tag  = level.toUpperCase().padEnd(5);
    let line   = `[${ts}] [${tag}] ${message}`;
    if (extra !== undefined) {
      const extraStr = extra instanceof Error
        ? `${extra.message}\n${extra.stack ?? ''}`
        : JSON.stringify(extra);
      line += ' | ' + extraStr;
    }
    fs.appendFileSync(_logPath, line + '\n', 'utf8');
  } catch { /* never let logging crash the app */ }
}

function rotate() {
  try {
    const stat = fs.statSync(_logPath);
    if (stat.size < MAX_SIZE_BYTES) return;
  } catch { return; } // file doesn't exist yet

  // Rotate: app.log.2 ← app.log.1 ← app.log
  for (let i = MAX_FILES - 1; i >= 1; i--) {
    const older = `${_logPath}.${i}`;
    const newer = i === 1 ? _logPath : `${_logPath}.${i - 1}`;
    if (fs.existsSync(newer)) {
      try { fs.renameSync(newer, older); } catch { /* ignore */ }
    }
  }
}

const info  = (msg, extra) => log('info',  msg, extra);
const warn  = (msg, extra) => log('warn',  msg, extra);
const error = (msg, extra) => log('error', msg, extra);

/** Return the logs directory path (for "open folder" button). */
function getLogDir() { return _logDir; }

module.exports = { init, info, warn, error, getLogDir };
