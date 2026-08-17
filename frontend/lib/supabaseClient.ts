import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in frontend/.env.local"
  );
}

// Browser client: session (access + refresh token) lives in localStorage and
// supabase-js refreshes it automatically in the background, so the rest of
// the app never has to think about token expiry.
export const supabase = createClient(url, publishableKey);
