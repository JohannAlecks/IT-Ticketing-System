import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';
import { clearProtectedCache } from '../query/protectedCache';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const previousIdentity = useRef(null);
  const sessionGeneration = useRef(0);
  const restoreController = useRef(null);

  const clearSession = useCallback(() => {
    sessionGeneration.current += 1;
    restoreController.current?.abort();
    restoreController.current = null;
    localStorage.removeItem('token');
    previousIdentity.current = null;
    void clearProtectedCache(queryClient);
    setUser(null);
    setIsLoading(false);
  }, [queryClient]);

  const setAuthenticatedUser = useCallback(async (nextUser) => {
    const nextIdentity = nextUser?.id ? {
      id: nextUser.id,
      role: String(nextUser.role || '').toUpperCase(),
    } : null;
    if (previousIdentity.current && (
      previousIdentity.current.id !== nextIdentity?.id ||
      previousIdentity.current.role !== nextIdentity?.role
    )) {
      await clearProtectedCache(queryClient);
    }
    previousIdentity.current = nextIdentity;
    setUser(nextUser);
  }, [queryClient]);

  // On mount: if a token exists, validate it against /auth/me to restore
  // the session. This is what gives us "persistent authentication state"
  // across page refreshes.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const generation = sessionGeneration.current;
    restoreController.current = controller;
    let active = true;
    authApi
      .me(controller.signal)
      .then((restoredUser) => {
        if (active && generation === sessionGeneration.current && localStorage.getItem('token') === token) {
          return setAuthenticatedUser(restoredUser);
        }
        return undefined;
      })
      .catch(() => {
        if (active && generation === sessionGeneration.current && !controller.signal.aborted) {
          clearSession();
        }
      })
      .finally(() => {
        if (active && generation === sessionGeneration.current) setIsLoading(false);
        if (restoreController.current === controller) restoreController.current = null;
      });

    return () => {
      active = false;
      controller.abort();
      if (restoreController.current === controller) restoreController.current = null;
    };
  }, [clearSession]);

  // Any 401 from the API (expired/invalid token) forces a clean logout
  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [clearSession]);

  const login = useCallback(async (credentials) => {
    sessionGeneration.current += 1;
    restoreController.current?.abort();
    restoreController.current = null;
    const { user: loggedInUser, token } = await authApi.login(credentials);
    localStorage.setItem('token', token);
    await setAuthenticatedUser(loggedInUser);
    return loggedInUser;
  }, [setAuthenticatedUser]);

  // Registration no longer authenticates the user — the backend creates an
  // UNVERIFIED account and sends a verification email, returning no token.
  // The caller (RegisterPage) is responsible for routing to the
  // check-your-email screen; this just forwards the backend's response.
  const register = useCallback(async (payload) => {
    return authApi.register(payload);
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);
  const updateUser = useCallback((nextUser) => setAuthenticatedUser(nextUser), [setAuthenticatedUser]);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    role: user?.role ?? null,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
