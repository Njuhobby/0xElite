'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import {
  API_BASE,
  TOKEN_KEY,
  authFetch,
  clearToken,
  getToken,
  setToken,
} from '@/lib/api';

interface AuthClaims {
  address: string;
  roles: string[];
  exp: number;
}

interface AuthState {
  token: string | null;
  user: AuthClaims | null;
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

function decodeJwt(token: string): AuthClaims | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      address: String(payload.sub).toLowerCase(),
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();

  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthClaims | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginInFlight = useRef(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = getToken();
    if (!stored) return;
    const decoded = decodeJwt(stored);
    if (!decoded || decoded.exp * 1000 < Date.now()) {
      clearToken();
      return;
    }
    setTokenState(stored);
    setUser(decoded);
  }, []);

  // Pick up rotations driven by sliding-window header
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.token) {
        const decoded = decodeJwt(detail.token);
        if (decoded) {
          setTokenState(detail.token);
          setUser(decoded);
        }
      }
    };
    const expiredHandler = () => {
      setTokenState(null);
      setUser(null);
    };
    window.addEventListener('auth:rotated', handler);
    window.addEventListener('auth:expired', expiredHandler);
    return () => {
      window.removeEventListener('auth:rotated', handler);
      window.removeEventListener('auth:expired', expiredHandler);
    };
  }, []);

  const login = useCallback(async () => {
    if (!address) throw new Error('Wallet not connected');
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setIsLoggingIn(true);
    setError(null);
    try {
      const nonceRes = await fetch(`${API_BASE}/api/auth/nonce?address=${address}`);
      if (!nonceRes.ok) throw new Error('Could not get nonce');
      const { nonce } = await nonceRes.json();

      const siwe = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to 0xElite',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
      const message = siwe.prepareMessage();
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Login failed');
      }
      const { token: newToken } = await res.json();
      setToken(newToken);
      const decoded = decodeJwt(newToken);
      setTokenState(newToken);
      setUser(decoded);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsLoggingIn(false);
      loginInFlight.current = false;
    }
  }, [address, chainId, signMessageAsync]);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const refreshRoles = useCallback(async () => {
    const res = await authFetch('/api/auth/refresh', { method: 'POST' });
    if (!res.ok) return;
    const { token: newToken } = await res.json();
    setToken(newToken);
    const decoded = decodeJwt(newToken);
    setTokenState(newToken);
    setUser(decoded);
  }, []);

  // Auto-login when wallet connects and we have no valid token for this address
  useEffect(() => {
    if (!isConnected || !address) return;
    const lower = address.toLowerCase();
    if (token && user && user.address === lower && user.exp * 1000 > Date.now()) return;
    login().catch(() => {
      /* user may have rejected the signature; surfaced via `error` */
    });
  }, [isConnected, address, token, user, login]);

  // Drop stale token when wallet account switches
  useEffect(() => {
    if (!user) return;
    if (address && user.address !== address.toLowerCase()) {
      logout();
    } else if (!address) {
      logout();
    }
  }, [address, user, logout]);

  // Keep multiple tabs in sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return;
      if (!e.newValue) {
        setTokenState(null);
        setUser(null);
        return;
      }
      const decoded = decodeJwt(e.newValue);
      if (decoded) {
        setTokenState(e.newValue);
        setUser(decoded);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <Ctx.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user && user.exp * 1000 > Date.now(),
        isLoggingIn,
        error,
        login,
        logout,
        refreshRoles,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
