import React, { useState, useEffect } from 'react';
import { useSession } from './SessionContext.jsx';
import ar from '../i18n/ar.js';
import styles from './HomeShell.module.css';
import logoUrl from '../assets/logo.jpg';
import Icon from '../components/Icon.jsx';
import { dayCheckReminders } from '../api/index.js';

// Feature screens (lazy-loaded per route)
const PosScreen       = React.lazy(() => import('../features/pos/PosScreen.jsx'));
const OrdersScreen    = React.lazy(() => import('../features/orders/OrdersScreen.jsx'));
const ProductsScreen  = React.lazy(() => import('../features/products/ProductsScreen.jsx'));
const SuppliersScreen = React.lazy(() => import('../features/suppliers/SuppliersScreen.jsx'));
const ExpensesScreen  = React.lazy(() => import('../features/expenses/ExpensesScreen.jsx'));
const ReportsScreen   = React.lazy(() => import('../features/reports/ReportsScreen.jsx'));
const SettingsScreen  = React.lazy(() => import('../features/settings/SettingsScreen.jsx'));
const CloseDayScreen  = React.lazy(() => import('../features/day-close/CloseDayScreen.jsx'));

/** Menu items available to each role */
const MENU = {
  cashier: ['pos', 'orders'],
  owner:   ['pos', 'orders', 'products', 'suppliers', 'expenses', 'reports', 'settings', 'closeDay'],
};

const SCREEN_MAP = {
  pos:       PosScreen,
  orders:    OrdersScreen,
  products:  ProductsScreen,
  suppliers: SuppliersScreen,
  expenses:  ExpensesScreen,
  reports:   ReportsScreen,
  settings:  SettingsScreen,
  closeDay:  CloseDayScreen,
};

const NAV_LABELS = {
  pos:       ar.pos,
  orders:    ar.orders,
  products:  ar.products,
  suppliers: ar.suppliers,
  expenses:  ar.expenses,
  reports:   ar.reports,
  settings:  ar.settingsTitle,
  closeDay:  ar.closeDay,
};

export default function HomeShell() {
  const { session, logout } = useSession();
  const [activeRoute,    setActiveRoute]    = useState('pos');
  const [reminder,       setReminder]       = useState(false);  // morning reminder
  const [unclosedCount,  setUnclosedCount]  = useState(0);      // notification badge
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // ── Load reminder state on mount ──────────────────────────────
  useEffect(() => {
    if (session.role !== 'owner') return;
    dayCheckReminders().then(res => {
      if (res.ok) {
        setReminder(res.data.showReminder && !reminderDismissed);
        setUnclosedCount(res.data.unclosedCount);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.role]);

  const menu = MENU[session.role] ?? [];
  const ActiveScreen = SCREEN_MAP[activeRoute] ?? PosScreen;

  function navigate(key) {
    setActiveRoute(key);
    // Re-check reminders when opening close-day
    if (key === 'closeDay' && session.role === 'owner') {
      dayCheckReminders().then(res => {
        if (res.ok) setUnclosedCount(res.data.unclosedCount);
      });
    }
  }

  return (
    <div className={styles.shell} dir="rtl">
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoArea}>
          <img src={logoUrl} alt={ar.appName} className={styles.logo} />
          <span className={styles.appName}>{ar.appName}</span>
        </div>
        <nav className={styles.nav}>
          {menu.map((key) => (
            <button
              key={key}
              className={`${styles.navItem} ${activeRoute === key ? styles.active : ''}`}
              onClick={() => navigate(key)}
            >
              <Icon name={key} size={18} className={styles.navIcon} />
              <span>{NAV_LABELS[key] ?? key}</span>
              {/* Badge on closeDay nav item */}
              {key === 'closeDay' && unclosedCount > 0 && (
                <span className={styles.badge}>{unclosedCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.roleLabel}>
            <Icon name="user" size={14} />
            {session.role === 'owner' ? ar.loginOwner : ar.loginCashier}
          </span>
          <button className={styles.logoutBtn} onClick={logout}>
            <Icon name="logout" size={16} />
            {ar.logout}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        {/* Morning reminder banner */}
        {reminder && !reminderDismissed && (
          <div className={styles.reminderBanner}>
            <Icon name="info" size={16} />
            <span>{ar.dayNotClosedReminder}</span>
            <button
              className={styles.reminderBtn}
              onClick={() => { setReminderDismissed(true); setReminder(false); navigate('closeDay'); }}
            >
              {ar.closeDayBtn}
            </button>
            <button
              className={styles.reminderDismiss}
              onClick={() => { setReminderDismissed(true); setReminder(false); }}
            >
              {ar.reminderDismiss}
            </button>
          </div>
        )}

        <React.Suspense fallback={<div className={styles.loading}>{ar.loading}</div>}>
          <ActiveScreen />
        </React.Suspense>
      </main>
    </div>
  );
}
