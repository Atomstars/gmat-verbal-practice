import type { Question } from "./types";
import { conceptOf } from "./types";

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
  ts: number;
}

export interface StoreData {
  version: number;
  history: Record<string, HistoryEntry>;
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
  daily: { date: null, level: "Easy", streak: 0, lastPct: null, recent: [] },
  adaptive: { level: "Easy" },
});

function load(): StoreData {
  if (typeof window === "undefined") return blank();
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "");
    return d && d.history ? d : blank();
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

  record(q: Question, picked: string, correct: boolean) {
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
    data.history[q.id] = h;
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
