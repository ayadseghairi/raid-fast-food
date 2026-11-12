# فاست فود رائد — Raid Fast Food POS

نظام نقطة بيع مكتبي للمطعم — Offline Windows desktop POS & management system for a single fast-food restaurant.

Built with **Electron 45 + React 19 + SQLite (better-sqlite3)**.  
100 % offline at runtime — no internet, no cloud, no telemetry.

---

## What's new in v1.1.0

| Item | Change |
|---|---|
| أحجام المنتجات | Free-form sizes per product; "سعر كامل" or "زيادة على الأساسي" pricing modes; SizePickerModal; POS card shows "من \<lowest price\>" |
| تصحيح: صورة المنتج | Editing a product no longer wipes its image unless you actively pick a new one or press "حذف الصورة" |
| رواتب العمال | Daily pay entry per worker, period summaries, manage workers (activate/deactivate, never delete) |
| DateInput | Custom DD/MM/YYYY date picker replaces native `<input type="date">` which follows Windows region settings |
| البائع بدلاً من الكاشير | All user-facing text now says "البائع"; internal role key `'cashier'` unchanged |
| الشعار في الـ .exe | Improved logo path resolution (userData → resources/assets → appPath); cached; async PDF write |
| الطباعة | Serialised print queue (no concurrent window clobber); listener cleanup; explicit thermal pageSize in microns; window auto-resizes for 58 mm |
| ملفات السجل | `%APPDATA%\Raid Fast Food\logs\app.log` — rotating (1 MB × 3 files); "فتح مجلد السجلات" in Settings |
| رقم الإصدار | Shown on login screen footer and in Settings → "حول البرنامج" |

---

## Features / الميزات

| | |
|---|---|
| نقطة البيع (POS) | Full POS with categories, products, sizes/extras, cart, order types (dine-in / takeaway / delivery) |
| أحجام حرة | Per-product free-form sizes with absolute or delta pricing; mandatory size picker modal |
| إدارة المنتجات | Products, categories, images, suspend/activate, size pricing mode toggle |
| رواتب العمال | Daily worker pay entry, period summaries, worker management |
| سجل الطلبات | Orders log with modify / cancel + full audit trail |
| الموردون | Suppliers, supplies, purchases, debt tracking |
| المصروفات | Other expenses (electricity, rent, salary, …) |
| إغلاق اليوم | Business-day close with report + auto-backup |
| التقارير | Period reports (day/week/month/custom) + Excel & PDF export |
| النسخ الاحتياطي | Auto-backup on close-day, AES-256-GCM encrypted USB backup, restore |
| الإعدادات | Printer (80/58 mm), restaurant info, change password, open logs folder |

---

## Development (Linux / macOS)

```bash
# Install dependencies (Node 22 required)
npm install

# Start dev mode (Vite HMR + Electron)
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Check version consistency (package.json ↔ CHANGELOG.md)
npm run check:version
```

---

## Build Windows installer

### Option A — On a Windows machine (or GitHub Actions)

```bash
npm ci
npm run dist:win
# Output: release/RaidFastFood-Setup-1.1.0.exe
```

### Option B — GitHub Actions (recommended from Linux)

1. Commit all changes, then run the release flow:

```bash
npm run release:minor   # bumps 1.0.x → 1.1.0, commits + tags v1.1.0
git push origin main --follow-tags
```

2. GitHub Actions runs the **Build Windows Installer** workflow on `windows-latest`.
3. Download the `.exe` from:
   - **Actions → Build Windows Installer → Artifacts** (always available), or
   - **Releases → v1.1.0** (created automatically on tag push).

You can also trigger it manually:  
**GitHub → Actions → Build Windows Installer → Run workflow → Run workflow**

---

## Release flow

```bash
# 1. Commit all work (including CHANGELOG.md)
git add -A && git commit -m "..."

# 2. Bump version, commit package.json, create git tag
npm run release:minor   # or release:patch / release:major

# 3. Push code + tag
git push origin main --follow-tags
```

`npm version` requires a clean working tree. The workflow triggers on tags matching `v*`.

---

## Data locations (Windows)

| Path | Contents |
|---|---|
| `%APPDATA%\Raid Fast Food\raid.db` | SQLite database |
| `%APPDATA%\Raid Fast Food\images\` | Product / supplier images |
| `%APPDATA%\Raid Fast Food\logs\app.log` | Rotating application log (open in Settings) |
| Settings → Backup folder | Auto-backups (last 30, run on day-close) |

---

## Project structure

```
electron/          Main process (IPC handlers, DB, services)
  db/              SQLite connection + migrations (001, 002, 003)
  ipc/             IPC handlers (one file per feature)
  repositories/    SQL queries (one file per entity)
  services/        Business logic (no UI / IPC code)
  utils/           money.js, dates.js, errors.js, logger.js
src/               Renderer (React)
  features/        One folder per screen
  components/      Shared UI (Button, Modal, NumPad, DateInput, SizePickerModal, …)
  i18n/ar.js       All Arabic UI strings (single source of truth)
assets/            Logo (logo.jpg) + icon (icon.ico)
tests/             Vitest unit tests (232 tests)
scripts/           check-version.js
.github/workflows/ GitHub Actions CI/CD
```

---

## Architecture rules (enforced by lint / tests)

- All amounts: **INTEGER minor units** (×100). Single `money.js` helper; no ad-hoc `*100` or `/100`.
- DB changes: **new migration only** — never edit an applied migration.
- All user-facing strings: **`src/i18n/ar.js`** only — never hardcode Arabic in components.
- Date formatting: **`fmtDate` / `fmtDateTime`** from `src/utils/money.js` — `toLocaleDateString` is banned by ESLint.
- CSS colors: only **CSS custom properties** from `tokens.css` — raw hex/rgb outside tokens.css fails the `css_tokens` test.
- Size pricing: **`computeUnitPrice`** in `electron/services/products.js` is the single pricing function for the whole app.

---

## Stack

| | Version |
|---|---|
| Electron | 45 |
| React | 19 |
| better-sqlite3 | 13 |
| Vite | 8 |
| exceljs | 4 |
| Node | 22 |

---

*Made for رائد فاست فود — all data stays on the local machine.*
