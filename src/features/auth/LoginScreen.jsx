import React, { useState } from 'react';
import ar from '../../i18n/ar.js';
import { authLogin } from '../../api/index.js';
import { useSession } from '../../app/SessionContext.jsx';
import Button from '../../components/Button.jsx';
import styles from './LoginScreen.module.css';
import logoUrl from '../../assets/logo.jpg';

export default function LoginScreen() {
  const { login } = useSession();
  const [view, setView] = useState('main'); // 'main' | 'ownerPassword'
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCashier() {
    setLoading(true);
    const res = await authLogin('cashier', '');
    setLoading(false);
    if (res.ok) {
      login('cashier', {});
    } else {
      setError(res.error);
    }
  }

  async function handleOwnerSubmit(e) {
    e.preventDefault();
    if (!password) {
      setError(ar.required);
      return;
    }
    setLoading(true);
    const res = await authLogin('owner', password);
    setLoading(false);
    if (res.ok) {
      login('owner', {});
    } else {
      setError(res.error);
      setPassword('');
    }
  }

  function showOwnerForm() {
    setView('ownerPassword');
    setError('');
    setPassword('');
  }

  function backToMain() {
    setView('main');
    setError('');
    setPassword('');
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <img src={logoUrl} alt={ar.appName} className={styles.logo} />
          <h1 className={styles.appName}>{ar.appName}</h1>
        </div>

        {view === 'main' ? (
          <>
            <h2 className={styles.title}>{ar.loginTitle}</h2>
            <div className={styles.buttons}>
              <Button
                fullWidth
                size="lg"
                onClick={showOwnerForm}
                disabled={loading}
              >
                {ar.loginOwner}
              </Button>
              <Button
                fullWidth
                size="lg"
                variant="ghost"
                onClick={handleCashier}
                disabled={loading}
              >
                {ar.loginCashier}
              </Button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </>
        ) : (
          <form className={styles.ownerForm} onSubmit={handleOwnerSubmit}>
            <h2 className={styles.title}>{ar.loginOwner}</h2>
            <div className={styles.passwordField}>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder={ar.passwordPlaceholder}
                autoFocus
                className={styles.passwordInput}
              />
            </div>
            {/* On-screen keyboard for touch: simple alpha not needed – use native keyboard */}
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formButtons}>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={backToMain}
                disabled={loading}
              >
                {ar.back}
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={loading || !password}
              >
                {loading ? ar.loading : ar.loginButton}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
