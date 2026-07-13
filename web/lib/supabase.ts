import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Public by design — Row-Level-Security protects each user's row (same values
   as the vanilla app). Blank these out to run 100% local. */
const URL = "https://bfaaczlxfafsxjnqqvoc.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmYWFjemx4ZmFmc3hqbnFxdm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTI4NjgsImV4cCI6MjA5NzI2ODg2OH0.QTzwq_FLSKJ_EUUGf2SsWGRAcIOKWiOUndljS9huc_c";

let sb: SupabaseClient | null = null;
let attemptsSb: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !URL || !ANON) return null;
  return (sb ??= createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
}

/** Separate anon-auth client for per-attempt telemetry (own storage key). */
export function attemptsClient(): SupabaseClient | null {
  if (typeof window === "undefined" || !URL || !ANON) return null;
  return (attemptsSb ??= createClient(URL, ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "gmat_attempts_auth",
      detectSessionInUrl: false,
    },
  }));
}
