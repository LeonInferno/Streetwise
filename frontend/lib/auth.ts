import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type UserRole = "tenant" | "landlord";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    role: user.user_metadata?.role === "landlord" ? "landlord" : "tenant",
  };
}

// Set by AuthProvider so API functions can trigger the login modal when a
// request comes back 401 (supabase-js auto-refreshes the token in the
// background, so this is only reached once a session is genuinely gone).
let _onAuthError: (() => void) | null = null;
export function setAuthErrorCallback(fn: () => void) {
  _onAuthError = fn;
}
export function triggerAuthError() {
  _onAuthError?.();
}

/** Current access token, or null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getSession();
  return toAuthUser(data.session?.user);
}

export async function signInWithPassword(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  const user = toAuthUser(data.user);
  if (!user) throw new Error("Login failed");
  return user;
}

/**
 * Returns `user: null` when the project has "Confirm email" enabled — Supabase
 * creates the account but withholds a session until the confirmation link is
 * clicked, so there is nothing to log the caller into yet.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  role: UserRole
): Promise<{ user: AuthUser | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } },
  });
  if (error) throw new Error(error.message);
  const user = toAuthUser(data.user);
  return { user: data.session ? user : null, needsEmailConfirmation: !data.session };
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
