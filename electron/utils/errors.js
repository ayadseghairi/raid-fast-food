/**
 * Application error helpers.
 * Never expose raw stack traces to users; map them to friendly Arabic messages.
 * @module electron/utils/errors
 */

/** Sentinel class so IPC handlers can detect our own errors. */
export class AppError extends Error {
  /**
   * @param {string} message – Arabic user-visible message
   * @param {string} [code]  – machine-readable code
   */
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/**
 * Wrap an unknown thrown value into a safe {ok:false, error} result object.
 * The `error` field is always a user-facing Arabic string.
 * @param {unknown} err
 * @returns {{ ok: false, error: string }}
 */
export function toErrorResult(err) {
  if (err instanceof AppError) {
    return { ok: false, error: err.message };
  }
  // Log technical detail server-side only; return generic message to renderer.
  console.error('[AppError]', err);
  return { ok: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' };
}
