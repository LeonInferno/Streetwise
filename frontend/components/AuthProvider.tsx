"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Header } from "./Header";
import { LoginModal } from "./LoginModal";
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  clearTokens,
  getAccessToken,
  setAuthErrorCallback,
  storeTokens,
  type AuthUser,
  type UserRole,
} from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  openLogin: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  openLogin: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  // On mount: restore session from localStorage
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiMe(token)
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  // Register the callback so API functions can trigger the login modal
  useEffect(() => {
    setAuthErrorCallback(() => {
      setUser(null);
      setShowLogin(true);
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const pair = await apiLogin(username, password);
    storeTokens(pair);
    setUser(pair.user);
  }, []);

  const register = useCallback(
    async (username: string, password: string, role: UserRole) => {
      const pair = await apiRegister(username, password, role);
      storeTokens(pair);
      setUser(pair.user);
    },
    []
  );

  const logout = useCallback(async () => {
    const token = getAccessToken();
    if (token) await apiLogout(token);
    clearTokens();
    setUser(null);
  }, []);

  const openLogin = useCallback(() => setShowLogin(true), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, openLogin }}>
      <Header />
      {children}
      {showLogin && !user && (
        <LoginModal
          onLogin={login}
          onRegister={register}
          onSuccess={() => setShowLogin(false)}
        />
      )}
    </AuthContext.Provider>
  );
}
