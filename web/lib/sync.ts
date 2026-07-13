import type { User } from "@supabase/supabase-js";
import { attemptsClient, supabase } from "./supabase";
import { Store, type StoreData } from "./store";
import type { Question } from "./types";

const TABLE = "progress";

/* Pure merge of two progress blobs — keeps the most progress from each (ported
   verbatim from the vanilla app's mergeProgress). */
export function mergeProgress(local: StoreData | null, remote: StoreData | null): StoreData {
  const blank: StoreData = {
    version: 1,
    history: {},
    daily: { date: null, level: "Easy", streak: 0, lastPct: null, recent: [] },
    adaptive: { level: "Easy" },
  };
  const L = { ...blank, ...(local ?? {}) },
    R = { ...blank, ...(remote ?? {}) };
  const lh = L.history ?? {},
    rh = R.history ?? {};
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const hist: Record<string, any> = {};
  for (const id of new Set([...Object.keys(lh), ...Object.keys(rh)])) {
    const a: any = lh[id],
      b: any = rh[id];
    if (!a) { hist[id] = b; continue; }
    if (!b) { hist[id] = a; continue; }
    const newer = (b.lastSeen || 0) > (a.lastSeen || 0) ? b : a;
    hist[id] = {
      ...a, ...b,
      type: newer.type || a.type || b.type,
      subtype: newer.subtype ?? a.subtype ?? b.subtype,
      difficulty: newer.difficulty ?? a.difficulty ?? b.difficulty,
      attempts: Math.max(a.attempts || 0, b.attempts || 0),
      correct: Math.max(a.correct || 0, b.correct || 0),
      lastSeen: Math.max(a.lastSeen || 0, b.lastSeen || 0),
      lastResult: newer.lastResult,
    };
  }
  const lastActive = (o: StoreData) =>
    Object.values(o.history ?? {}).reduce((m, h: any) => Math.max(m, h.lastSeen || 0), 0);
  const lAct = lastActive(L), rAct = lastActive(R);
  const ld = L.daily ?? blank.daily, rd = R.daily ?? blank.daily;
  const base = (ld.date ?? "").localeCompare(rd.date ?? "") >= 0 ? ld : rd;
  const other = base === ld ? rd : ld;
  return {
    version: 1,
    history: hist,
    daily: {
      date: base.date, level: base.level, lastPct: base.lastPct,
      streak: Math.max(ld.streak || 0, rd.streak || 0),
      recent: [...new Set([...(base.recent ?? []), ...(other.recent ?? [])])].slice(0, 6),
    },
    adaptive: { level: ((rAct > lAct ? R.adaptive : L.adaptive) ?? blank.adaptive).level || "Easy" },
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

let user: User | null = null;
let pushT: ReturnType<typeof setTimeout> | null = null;
let lastPushed = "";
const listeners = new Set<() => void>();

export const Sync = {
  get user() { return user; },
  enabled: () => !!supabase(),
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  async init() {
    const c = supabase();
    if (!c) return;
    try {
      const { data: { session } } = await c.auth.getSession();
      user = session?.user ?? null;
      c.auth.onAuthStateChange((_e, sess) => {
        const prev = user;
        user = sess?.user ?? null;
        listeners.forEach((f) => f());
        if (user && (!prev || prev.id !== user.id)) void Sync.pull();
      });
    } catch {}
    listeners.forEach((f) => f());
    if (user) void Sync.pull();
  },

  async pull() {
    const c = supabase();
    if (!c || !user) return;
    try {
      const { data, error } = await c.from(TABLE).select("data").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      const merged = mergeProgress(Store.get(), (data?.data as StoreData) ?? null);
      Store.hydrate(merged);
      lastPushed = JSON.stringify(merged);
      listeners.forEach((f) => f());
      await Sync.upsert(merged);
    } catch {}
  },

  async upsert(obj: StoreData) {
    const c = supabase();
    if (!c || !user) return;
    const { error } = await c.from(TABLE).upsert({
      user_id: user.id, data: obj, updated_at: new Date().toISOString(),
    });
    if (!error) lastPushed = JSON.stringify(obj);
  },

  /** Debounced push after any local Store write (registered in store.ts). */
  onLocalChange(data: StoreData) {
    if (!supabase() || !user) return;
    if (pushT) clearTimeout(pushT);
    pushT = setTimeout(async () => {
      try {
        const c = supabase()!;
        const { data: row } = await c.from(TABLE).select("data").eq("user_id", user!.id).maybeSingle();
        const merged = mergeProgress(data, (row?.data as StoreData) ?? null);
        if (JSON.stringify(merged) === lastPushed) return;
        await Sync.upsert(merged);
      } catch {}
    }, 1500);
  },

  async signInGoogle() {
    const c = supabase();
    if (!c) return;
    await c.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
  },

  async signInEmail(email: string, password: string) {
    const c = supabase();
    if (!c) return { ok: false, msg: "Cloud sign-in isn't configured on this build." };
    try {
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, msg: error.message };
      return { ok: true, session: data.session };
    } catch { return { ok: false, msg: "Network error — check your connection." }; }
  },

  async signUpEmail(email: string, password: string) {
    const c = supabase();
    if (!c) return { ok: false, msg: "Cloud sign-up isn't configured on this build." };
    try {
      const { data, error } = await c.auth.signUp({ email, password });
      if (error) return { ok: false, msg: error.message };
      if (data.session) return { ok: true, session: data.session };
      return { ok: true, session: null, msg: "Account created — check your email to confirm, then sign in." };
    } catch { return { ok: false, msg: "Network error — check your connection." }; }
  },

  async signOut() {
    const c = supabase();
    if (c) { try { await c.auth.signOut(); } catch {} }
    user = null;
    listeners.forEach((f) => f());
  },
};

/* ===== Attempts telemetry (anonymous device identity) ===== */
let deviceId: string | null = null;
let attemptsReady = false;

export const Attempts = {
  async init() {
    const c = attemptsClient();
    if (!c) return;
    try {
      const { data: { session } } = await c.auth.getSession();
      if (session?.user) { deviceId = session.user.id; attemptsReady = true; }
      else {
        const { data, error } = await c.auth.signInAnonymously();
        if (!error && data?.user) { deviceId = data.user.id; attemptsReady = true; }
      }
    } catch {}
  },
  async save(q: Question, chosen: string, timeMs: number | null) {
    const c = attemptsClient();
    if (!c || !attemptsReady || !deviceId) return;
    const idx = (l: string | null) => {
      if (!q.options || l == null) return null;
      const i = q.options.findIndex((o) => o.label === l);
      return i >= 0 ? i : null;
    };
    const ki = idx(q.correct_answer);
    if (ki === null) return;
    try {
      await c.from("attempts").insert({
        user_id: deviceId, question_id: q.id, source: q.bank ?? "mixed", q_type: q.type,
        chosen_index: idx(chosen), correct_index: ki, is_correct: chosen === q.correct_answer,
        time_ms: typeof timeMs === "number" && timeMs >= 0 ? Math.round(timeMs) : null,
      });
    } catch {}
  },
};
