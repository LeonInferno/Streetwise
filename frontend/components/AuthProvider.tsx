"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Header } from "./Header";
import { LoginModal } from "./LoginModal";
import { supabase } from "@/lib/supabaseClient";
import {
  getCurrentUser,
  setAuthErrorCallback,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  type AuthUser,
  type UserRole,
} from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: UserRole) => Promise<{ needsEmailConfirmation: boolean }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  openLogin: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => ({ needsEmailConfirmation: false }),
  loginWithGoogle: async () => {},
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

  // On mount: restore any existing session, then keep `user` in sync with
  // every subsequent auth event (login, logout, token refresh, and the
  // redirect back from Google OAuth all land here).
  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .finally(() => setIsLoading(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(
        session?.user
          ? { id: session.user.id, email: session.user.email ?? "", role: session.user.user_metadata?.role === "landlord" ? "landlord" : "tenant" }
          : null
      );
      setIsLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Register the callback so API functions can trigger the login modal
  useEffect(() => {
    setAuthErrorCallback(() => setShowLogin(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await signInWithPassword(email, password));
  }, []);

  const register = useCallback(async (email: string, password: string, role: UserRole) => {
    const { user: newUser, needsEmailConfirmation } = await signUpWithPassword(email, password, role);
    if (newUser) setUser(newUser);
    return { needsEmailConfirmation };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  const openLogin = useCallback(() => setShowLogin(true), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, loginWithGoogle, logout, openLogin }}>
      <Header />
      {children}
      {showLogin && !user && (
        <LoginModal
          onLogin={login}
          onRegister={register}
          onGoogleLogin={loginWithGoogle}
          onSuccess={() => setShowLogin(false)}
        />
      )}
    </AuthContext.Provider>
  );
}
