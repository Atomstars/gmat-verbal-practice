import type { User } from "@supabase/supabase-js";
import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { Store, type StoreData } from "./store";
import { mergeProgress } from "./progress-merge";

export { mergeProgress } from "./progress-merge";

let user: User | null = null;
const listeners = new Set<() => void>();

async function hydrateAuthenticated() {
  if (!user) return;
  const local = Store.get();
  const migrationKey = `gmat_progress_migrated_${user.id}`;
  let migrated = false;
  try { migrated = localStorage.getItem(migrationKey) === "1"; } catch {}
  if (!migrated && Object.keys(local.history).length) {
    try {
      const result = await apiFetch<{ progress: StoreData }>("/api/progress", {
        method: "POST", body: JSON.stringify({ legacy: local }),
      });
      Store.hydrate(mergeProgress(local, result.progress));
      try { localStorage.setItem(migrationKey, "1"); } catch {}
      listeners.forEach((fn) => fn());
      return;
    } catch {
      // Retain the validated local cache and retry on the next boot.
    }
  }
  try {
    const result = await apiFetch<{ progress: StoreData }>("/api/progress");
    Store.hydrate(mergeProgress(local, result.progress));
    listeners.forEach((fn) => fn());
  } catch {}
}

export const Sync = {
  get user() { return user; },
  enabled: () => !!supabase(),
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  async init() {
    const client = supabase();
    if (!client) return;
    const { data } = await client.auth.getSession();
    user = data.session?.user ?? null;
    client.auth.onAuthStateChange((_event, session) => {
      const changed = user?.id !== session?.user?.id;
      user = session?.user ?? null;
      listeners.forEach((fn) => fn());
      if (changed && user) void hydrateAuthenticated();
    });
    listeners.forEach((fn) => fn());
    if (user) await hydrateAuthenticated();
  },
  async pull() { await hydrateAuthenticated(); },
  onLocalChange(_data: StoreData) {
    // Signed-in answer writes are transactional in /api/answers. This is a cache.
    void _data;
  },
  async signInGoogle() {
    const client = supabase();
    if (client) await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  },
  async signInEmail(email: string, password: string) {
    const client = supabase();
    if (!client) return { ok: false, msg: "Cloud sign-in isn't configured on this build." };
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, msg: error.message } : { ok: true, session: data.session };
    } catch { return { ok: false, msg: "Network error — check your connection." }; }
  },
  async signUpEmail(email: string, password: string) {
    const client = supabase();
    if (!client) return { ok: false, msg: "Cloud sign-up isn't configured on this build." };
    try {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) return { ok: false, msg: error.message };
      return data.session ? { ok: true, session: data.session } : { ok: true, session: null, msg: "Account created — check your email to confirm, then sign in." };
    } catch { return { ok: false, msg: "Network error — check your connection." }; }
  },
  async signOut() {
    const client = supabase();
    if (client) try { await client.auth.signOut(); } catch {}
    user = null;
    listeners.forEach((fn) => fn());
  },
};
