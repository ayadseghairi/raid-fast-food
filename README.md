# فاست فود رائد — Raid Fast Food POS

نظام نقطة بيع مكتبي للمطعم — Offline Windows desktop POS & management system for a single fast-food restaurant.

Built with **Electron 45 + React 19 + SQLite (better-sqlite3)**.  
100 % offline at runtime — no internet, no cloud, no telemetry.

---

## Features / الميزات

| | |
|---|---|
| نقطة البيع (POS) | Full POS with categories, products, sizes/extras, cart, order types (dine-in / takeaway / delivery) |
| إدارة المنتجات | Products, categories, images, suspend/activate |
| سجل الطلبات | Orders log with modify / cancel + full audit trail |
| الموردون | Suppliers, supplies, purchases, debt tracking |
| المصروفات | Other expenses (electricity, rent, salary, …) |
| إغلاق اليوم | Business-day close with report + auto-backup |
| التقارير | Period reports (day/week/month/custom) + Excel & PDF export |
| النسخ الاحتياطي | Auto-backup on close-day, AES-256-GCM encrypted USB backup, restore |
| الإعدادات | Printer (80/58 mm), restaurant info, change password |

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
```

---

## Build Windows installer

### Option A — On a Windows machine (or GitHub Actions)

```bash
npm ci
npm run dist:win
# Output: release/RaidFastFood-Setup-1.0.0.exe
```

### Option B — GitHub Actions (recommended from Linux)

1. Push your code and a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

2. GitHub Actions runs the **Build Windows Installer** workflow on `windows-latest`.
3. Download the `.exe` from:
   - **Actions → Build Windows Installer → Artifacts** (always available), or
   - **Releases → v1.0.0** (created automatically on tag push).

You can also trigger it manually:  
**GitHub → Actions → Build Windows Installer → Run workflow → Run workflow**

---

## Database location (Windows)

The SQLite database is stored in the Windows user-data directory:

```
%APPDATA%\Raid Fast Food\raid.db
```

Automatic backups are written to the folder you choose in **Settings → Backup**.  
The auto-backup runs every time you close the business day and keeps the last **30** copies.

---

## Project structure

```
electron/          Main process (IPC handlers, DB, services)
  db/              SQLite connection + migrations
  ipc/             IPC handlers (one file per feature)
  repositories/    SQL queries (one file per entity)
  services/        Business logic (no UI / IPC code)
  utils/           money.js, dates.js, errors.js
src/               Renderer (React)
  features/        One folder per screen
  components/      Shared UI (Button, Modal, NumPad, …)
  i18n/ar.js       All Arabic UI strings (single source of truth)
assets/            Logo + icon
tests/             Vitest unit tests (115 tests)
.github/workflows/ GitHub Actions CI/CD
```

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
