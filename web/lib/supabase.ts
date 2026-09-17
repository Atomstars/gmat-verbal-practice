import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Public by design — Row-Level-Security protects each user's row (same values
   as the vanilla app). Blank these out to run 100% local. */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let sb: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !URL || !ANON) return null;
  return (sb ??= createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
}
