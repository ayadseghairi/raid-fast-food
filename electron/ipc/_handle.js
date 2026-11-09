'use strict';

const { ipcMain } = require('electron');
const { toErrorResult } = require('../utils/errors.js');

/**
 * Thin IPC handler wrapper.
 * Calls the given handler and guarantees {ok, data|error} shape back to the renderer.
 * @param {string} channel
 * @param {(payload: object) => Promise<any>|any} handler
 */
function handle(channel, handler) {
  ipcMain.handle(channel, async (_event, payload = {}) => {
    try {
      const data = await handler(payload);
      return { ok: true, data };
    } catch (err) {
      return toErrorResult(err);
    }
  });
}

module.exports = { handle };
