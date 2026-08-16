const TOKEN_KEY = "sw.accessToken";
const REFRESH_KEY = "sw.refreshToken";

export const AUTH_BASE = "http://localhost:3001";

export type UserRole = "tenant" | "landlord";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// Set by AuthProvider so API functions can trigger the login modal.
let _onAuthError: (() => void) | null = null;
export function setAuthErrorCallback(fn: () => void) {
  _onAuthError = fn;
}
export function triggerAuthError() {
  _onAuthError?.();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function storeTokens(pair: Pick<TokenPair, "accessToken" | "refreshToken">) {
  localStorage.setItem(TOKEN_KEY, pair.accessToken);
  localStorage.setItem(REFRESH_KEY, pair.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function authPost(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function apiLogin(username: string, password: string): Promise<TokenPair> {
  const res = await authPost("/api/auth/login", { username, password });
  const data = await res.json();
  if (!res.ok) throw new Error(data.details ?? data.error ?? "Login failed");
  return data;
}

export async function apiRegister(
  username: string,
  password: string,
  role: UserRole
): Promise<TokenPair> {
  const res = await authPost("/api/auth/register", { username, password, role });
  const data = await res.json();
  if (!res.ok) throw new Error(data.details ?? data.error ?? "Registration failed");
  return data;
}

export async function apiRefresh(refreshToken: string): Promise<TokenPair> {
  const res = await authPost("/api/auth/refresh", { refreshToken });
  if (!res.ok) throw new Error("Session expired");
  return res.json();
}

export async function apiLogout(accessToken: string): Promise<void> {
  await authPost("/api/auth/logout", {}, accessToken).catch(() => {});
}

export async function apiMe(accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${AUTH_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Not authenticated");
  const data = await res.json();
  return data.user;
}

// Attempts one token refresh, stores the new pair, returns the new access token.
// Returns null and clears tokens if the refresh fails.
export async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const pair = await apiRefresh(rt);
    storeTokens(pair);
    return pair.accessToken;
  } catch {
    clearTokens();
    triggerAuthError();
    return null;
  }
}
