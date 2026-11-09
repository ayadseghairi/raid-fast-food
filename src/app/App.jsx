import React, { useState, useEffect } from 'react';
import { SessionProvider, useSession } from './SessionContext.jsx';
import { setupCheck } from '../api/index.js';
import { ToastContainer } from '../components/Toast.jsx';
import styles from './App.module.css';

// Lazy screen imports – keeps bundle split clean
const SetupScreen = React.lazy(() => import('../features/setup/SetupScreen.jsx'));
const LoginScreen = React.lazy(() => import('../features/auth/LoginScreen.jsx'));
const HomeShell = React.lazy(() => import('./HomeShell.jsx'));

function Router() {
  const { session } = useSession();
  const [setupDone, setSetupDone] = useState(null); // null = loading

  useEffect(() => {
    setupCheck().then((res) => {
      setSetupDone(res.ok && res.data?.done);
    });
  }, []);

  if (setupDone === null) {
    return <div className={styles.loading}>…</div>;
  }

  if (!setupDone) {
    return <SetupScreen onComplete={() => setSetupDone(true)} />;
  }

  if (!session.role) {
    return <LoginScreen />;
  }

  return <HomeShell />;
}

export default function App() {
  return (
    <SessionProvider>
      <React.Suspense fallback={<div className={styles.loading}>…</div>}>
        <Router />
      </React.Suspense>
      <ToastContainer />
    </SessionProvider>
  );
}
