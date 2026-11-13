/**
 * Thin wrappers around window.api (the preload-exposed IPC bridge).
 * This is the ONLY place in the renderer that touches window.api.
 * @module src/api/index
 */

/** @returns {Promise<{ok: boolean, data?: any, error?: string}>} */
const call = (channel, payload) => window.api.invoke(channel, payload);

// ── App ─────────────────────────────────────────────────────────
export const appGetVersion = () => call('app:getVersion', {});

// ── Auth ────────────────────────────────────────────────────────
export const authLogin = (role, password) => call('auth:login', { role, password });
export const authLogout = () => call('auth:logout', {});
export const authChangePassword = (currentPassword, newPassword) =>
  call('auth:changePassword', { currentPassword, newPassword });

// ── Setup ───────────────────────────────────────────────────────
export const setupCheck = () => call('setup:check', {});
export const setupComplete = (data) => call('setup:complete', data);

// ── Settings ────────────────────────────────────────────────────
export const settingsGet = () => call('settings:get', {});
export const settingsSet = (data) => call('settings:set', data);
export const settingsOpenLogsFolder = () => call('settings:openLogsFolder', {});

// ── Categories ──────────────────────────────────────────────────
export const categoriesList = () => call('categories:list', {});
export const categoriesCreate = (data) => call('categories:create', data);
export const categoriesUpdate = (id, data) => call('categories:update', { id, ...data });
export const categoriesDelete = (id) => call('categories:delete', { id });

// ── Products ────────────────────────────────────────────────────
export const productsList = (categoryId) => call('products:list', { categoryId });
export const productsCreate = (data) => call('products:create', data);
export const productsUpdate = (id, data) => call('products:update', { id, ...data });
export const productsDelete = (id) => call('products:delete', { id });
export const productsSetActive = (id, active) => call('products:setActive', { id, active });
export const productsPickImage = () => call('products:pickImage', {});
export const productsComputeUnitPrice = (basePrice, sizePriceMode, sizePrice) =>
  call('products:computeUnitPrice', { basePrice, sizePriceMode, sizePrice });

// ── Product options (sizes/extras) ──────────────────────────────
export const optionsList = (productId) => call('options:list', { productId });
export const optionsCreate = (data) => call('options:create', data);
export const optionsUpdate = (id, data) => call('options:update', { id, ...data });
export const optionsDelete = (id) => call('options:delete', { id });

// ── Customers ───────────────────────────────────────────────────
export const customerLookup = (phone) => call('customers:lookup', { phone });
export const customerCreate = (data) => call('customers:create', data);

// ── Orders ──────────────────────────────────────────────────────
export const ordersCreate = (data) => call('orders:create', data);
export const ordersList = (dayId) => call('orders:list', { dayId });
export const ordersGet = (id) => call('orders:get', { id });
export const ordersModify = (id, data) => call('orders:modify', { id, ...data });
export const ordersCancel = (id) => call('orders:cancel', { id });
export const ordersAuditLog = (orderId) => call('orders:auditLog', { orderId });

// ── Business day ────────────────────────────────────────────────
export const dayGetCurrent     = () => call('day:getCurrent', {});
export const dayGetOpen        = () => call('day:getOpen', {});

export const dayClose          = () => call('day:close', {});
export const dayList           = () => call('day:list', {});
export const dayReport         = (dayId) => call('day:report', { dayId });
export const dayCheckReminders = () => call('day:checkReminders', {});
export const dayListClosed     = () => call('day:listClosed', {});

// ── Shops (suppliers) ────────────────────────────────────────────
export const shopsList        = () => call('shops:list', {});
export const shopsCreate      = (data) => call('shops:create', data);
export const shopsUpdate      = (id, data) => call('shops:update', { id, ...data });
export const shopsDelete      = (id) => call('shops:delete', { id });
export const shopsPickImage   = () => call('shops:pickImage', {});

// ── Supplies ────────────────────────────────────────────────────
export const suppliesList   = (shopId) => call('supplies:list', { shopId });
export const suppliesCreate = (data) => call('supplies:create', data);
export const suppliesUpdate = (id, data) => call('supplies:update', { id, ...data });
export const suppliesDelete = (id) => call('supplies:delete', { id });

// ── Purchases ───────────────────────────────────────────────────
export const purchasesList       = (shopId) => call('purchases:list', { shopId });
export const purchasesCreate     = (data) => call('purchases:create', data);
export const purchasesUpdatePaid = (id, paid) => call('purchases:updatePaid', { id, paid });
export const purchasesUpdate     = (id, data) => call('purchases:update', { id, ...data });
export const purchasesDelete     = (id) => call('purchases:delete', { id });
export const purchasesDebtSummary = () => call('purchases:debtSummary', {});

// ── Expenses ────────────────────────────────────────────────────
export const expensesList = (filters) => call('expenses:list', filters);
export const expensesCreate = (data) => call('expenses:create', data);
export const expensesUpdate = (id, data) => call('expenses:update', { id, ...data });
export const expensesDelete = (id) => call('expenses:delete', { id });

// ── Reports ─────────────────────────────────────────────────────
export const reportsGet = (params) => call('reports:get', params);
export const reportsExportExcel = (params) => call('reports:exportExcel', params);
export const reportsExportPdf = (params) => call('reports:exportPdf', params);

// ── Printing ────────────────────────────────────────────────────
export const printGetPrinters  = () => call('print:getPrinters', {});
export const printReceipt      = (data) => call('print:receipt', data);
export const printSaveAsPdf    = (data) => call('print:saveAsPdf', data);
// New printing API
export const printListPrinters = () => call('print:listPrinters', {});
export const printPreviewHtml  = (data) => call('print:previewHtml', data);
export const printRun          = (data) => call('print:run', data);
export const printSavePdf      = (data) => call('print:savePdf', data);
export const printTestPrint    = (data) => call('print:testPrint', data ?? {});

// ── Backup ──────────────────────────────────────────────────────
export const backupNow = (ownerPassword, destPath) =>
  call('backup:now', { ownerPassword, destPath });
export const backupRestore = (filePath, ownerPassword) =>
  call('backup:restore', { filePath, ownerPassword });
export const backupChooseFolder = () => call('backup:chooseFolder', {});
export const backupList = () => call('backup:list', {});

// ── Workers (رواتب العمال) ────────────────────────────────────────
export const workersList = (activeOnly = false) => call('workers:list', { activeOnly });
export const workersCreate = (name) => call('workers:create', { name });
export const workersUpdate = (id, name) => call('workers:update', { id, name });
export const workersSetActive = (id, active) => call('workers:setActive', { id, active });
export const workersGetDailyEntry = (date) => call('workers:getDailyEntry', { date });
export const workersSaveDailyPayments = (date, payments) => call('workers:saveDailyPayments', { date, payments });
export const workersSummaryForRange = (from, to) => call('workers:summaryForRange', { from, to });
export const workersDetailForRange = (workerId, from, to) => call('workers:detailForRange', { workerId, from, to });
export const workersTotalPayForRange = (from, to) => call('workers:totalPayForRange', { from, to });

// ── Danger zone ──────────────────────────────────────────────────
export const dataClearTransactions = (password) =>
  call('data:clearTransactions', { password });
export const dataClearAll = (password) =>
  call('data:clearAll', { password });
