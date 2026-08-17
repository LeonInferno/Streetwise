import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client, authenticated with the project's secret key.
// This app never stores or issues credentials itself — the only thing it
// does is ask Supabase "is this still a valid session" on each request.

let client = null;

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function getClient() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

/**
 * Verifies a bearer token against Supabase's Auth server and returns the
 * Supabase user, or null if the token is missing/invalid/expired.
 *
 * This calls out to Supabase rather than verifying the JWT locally — one
 * network round trip per authenticated request, in exchange for never having
 * to know the signing key or handle its rotation ourselves.
 */
export async function getUserFromToken(token) {
  const { data, error } = await getClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
