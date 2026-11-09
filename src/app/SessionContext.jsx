import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Session context – tracks who is logged in.
 * role: null | 'cashier' | 'owner'
 */
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ role: null, user: null });

  const login = useCallback((role, user = {}) => {
    setSession({ role, user });
  }, []);

  const logout = useCallback(() => {
    setSession({ role: null, user: null });
  }, []);

  return (
    <SessionContext.Provider value={{ session, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

/** @returns {{ session: {role: string|null, user: object}, login: Function, logout: Function }} */
export function useSession() {
  return useContext(SessionContext);
}
