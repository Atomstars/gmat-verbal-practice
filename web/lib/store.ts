import type { QType, Question } from "./types";
import { conceptOf } from "./types";

const MIN_ATTEMPTS = 3;
const CONCEPT_FIELD: Record<QType, "subtype" | "chapter"> = {
  RC: "subtype", CR: "subtype", PS: "chapter", DS: "chapter",
};

/**
 * Progress store — localStorage, SAME KEY as the vanilla app (gmat_verbal_v1)
 * so history carries over during the migration and both apps stay in sync.
 */
const KEY = "gmat_verbal_v1";

export interface HistoryEntry {
  lastResult: "correct" | "wrong";
  lastPicked: string;
  attempts: number;
  correct: number;
  type: string;
  subtype?: string | null;
  chapter?: string | null;
  difficulty?: string | null;
  lastTimeMs?: number; // time spent on the most recent attempt (for the History view)
  ts: number;
}

/** Per-day, per-question-type time spent (ms), used by the consistency tracker. */
export type ActivityDay = Partial<Record<"RC" | "CR" | "PS" | "DS", number>>;

export interface StoreData {
  version: number;
  history: Record<string, HistoryEntry>;
  activity: Record<string, ActivityDay>; // "YYYY-MM-DD" -> per-type ms
  daily: {
    date: string | null;
    level: string;
    streak: number;
    lastPct: number | null;
    recent: number[];
  };
  adaptive: { level: string };
}

const blank = (): StoreData => ({
  version: 1,
  history: {},
  activity: {},
  daily: { date: null, level: "Easy", streak: 0, lastPct: null, recent: [] },
  adaptive: { level: "Easy" },
});

function load(): StoreData {
  if (typeof window === "undefined") return blank();
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (!d || !d.history) return blank();
    d.activity ??= {}; // backfill for progress saved before activity tracking existed
    return d;
  } catch {
    return blank();
  }
}

/* registered by sync.ts consumers to push after local writes (avoids circular import) */
let onChange: ((d: StoreData) => void) | null = null;
export function setStoreOnChange(fn: (d: StoreData) => void) {
  onChange = fn;
}

function save(data: StoreData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full / private mode — stay in-memory */
  }
  try {
    onChange?.(data);
  } catch {}
}

export const Store = {
  get(): StoreData {
    return load();
  },

  record(q: Question, picked: string, correct: boolean, timeMs?: number) {
    const data = load();
    const h = data.history[q.id] ?? {
      lastResult: "wrong" as const,
      lastPicked: "",
      attempts: 0,
      correct: 0,
      type: q.type,
      ts: 0,
    };
    h.attempts += 1;
    if (correct) h.correct += 1;
    h.lastResult = correct ? "correct" : "wrong";
    h.lastPicked = picked;
    h.type = q.type;
    h.subtype = q.subtype ?? null;
    h.chapter = q.chapter ?? null;
    h.difficulty = q.difficulty ?? null;
    h.ts = Date.now();
    if (typeof timeMs === "number" && timeMs > 0) h.lastTimeMs = timeMs;
    data.history[q.id] = h;
    if (typeof timeMs === "number" && timeMs > 0) {
      const day = new Date().toISOString().slice(0, 10);
      const bucket = (data.activity[day] ??= {});
      bucket[q.type] = (bucket[q.type] ?? 0) + timeMs;
    }
    save(data);
  },

  overall() {
    const data = load();
    let seen = 0,
      corr = 0;
    for (const h of Object.values(data.history)) {
      seen++;
      if (h.lastResult === "correct") corr++;
    }
    return { seen, corr, pct: seen ? Math.round((100 * corr) / seen) : null };
  },

  wrongIds(): string[] {
    const data = load();
    return Object.entries(data.history)
      .filter(([, h]) => h.lastResult === "wrong")
      .map(([id]) => id);
  },

  /** Every question the user has attempted at least once (any result).
      Used to keep fresh practice sessions from re-serving seen questions. */
  seenIds(): string[] {
    return Object.keys(load().history);
  },

  updateDaily(fn: (d: StoreData["daily"]) => StoreData["daily"]) {
    const data = load();
    data.daily = fn(data.daily);
    save(data);
  },

  exportJSON() {
    return JSON.stringify(load(), null, 2);
  },
  importJSON(s: string) {
    const d = JSON.parse(s);
    if (!d.history) throw new Error("bad file");
    save(d);
  },
  reset() {
    save(blank());
  },
  /** hydrate from a synced blob WITHOUT re-triggering a push (no sync loop) */
  hydrate(obj: StoreData) {
    if (!obj?.history) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
    } catch {}
  },

  /** last-N-days study time, per day and per section — powers the consistency
      tracker's bar thickness/color and its weekly breakdown. */
  consistency(days = 7) {
    const data = load();
    const today = new Date();
    const out: { date: string; totalMs: number; bySection: ActivityDay }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const bySection = data.activity[key] ?? {};
      const totalMs = Object.values(bySection).reduce((a, b) => a + (b ?? 0), 0);
      out.push({ date: key, totalMs, bySection });
    }
    return out;
  },

  /** consecutive days (ending today or yesterday) with any recorded activity. */
  streak() {
    const data = load();
    let n = 0;
    const d = new Date();
    // allow "today not started yet" to still show yesterday's streak
    if (!data.activity[d.toISOString().slice(0, 10)]) d.setDate(d.getDate() - 1);
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (!data.activity[key] || !Object.keys(data.activity[key]).length) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  },

  /** Ranked weakest concepts (RC/CR by subtype, PS/DS by chapter), worst
      first, with at least `minAttempts` tries. Powers the Home "focus today"
      callout and the Analyzer page. */
  weakest(minAttempts = MIN_ATTEMPTS) {
    const out: { type: QType; concept: string; c: number; t: number; pct: number }[] = [];
    (["RC", "CR", "PS", "DS"] as QType[]).forEach((type) => {
      const agg = this.byField(CONCEPT_FIELD[type], type);
      for (const [concept, a] of Object.entries(agg)) {
        if (a.t < minAttempts) continue;
        out.push({ type, concept, c: a.c, t: a.t, pct: Math.round((100 * a.c) / a.t) });
      }
    });
    out.sort((a, b) => a.pct - b.pct);
    return out;
  },

  /** accuracy grouped by a history field (subtype/chapter/difficulty) */
  byField(field: "subtype" | "chapter" | "difficulty", type?: string) {
    const data = load();
    const acc: Record<string, { c: number; t: number }> = {};
    for (const h of Object.values(data.history)) {
      if (type && h.type !== type) continue;
      const k = h[field];
      if (!k) continue;
      const x = (acc[k] ??= { c: 0, t: 0 });
      x.t++;
      if (h.lastResult === "correct") x.c++;
    }
    return acc;
  },
};

export { conceptOf };
