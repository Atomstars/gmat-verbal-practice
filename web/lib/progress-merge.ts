import type { StoreData } from "./store";

const blank = (): StoreData => ({
  version: 2, history: {}, activity: {},
  daily: { date: null, level: "Easy", streak: 0, lastPct: null, recent: [] },
  adaptive: { level: "Easy" },
});

/** Deterministic cache merge. Counters use max, never addition, so a repeated
 * legacy migration or sync round-trip cannot duplicate attempts. */
export function mergeProgress(local: StoreData | null, remote: StoreData | null): StoreData {
  const L = { ...blank(), ...(local ?? {}) };
  const R = { ...blank(), ...(remote ?? {}) };
  const history: StoreData["history"] = {};
  for (const id of new Set([...Object.keys(L.history ?? {}), ...Object.keys(R.history ?? {})])) {
    const a = L.history?.[id];
    const b = R.history?.[id];
    if (!a) { history[id] = b; continue; }
    if (!b) { history[id] = a; continue; }
    const newer = (b.ts || 0) >= (a.ts || 0) ? b : a;
    history[id] = { ...a, ...b, ...newer,
      attempts: Math.max(a.attempts || 0, b.attempts || 0),
      correct: Math.max(a.correct || 0, b.correct || 0) };
  }
  const activity: StoreData["activity"] = {};
  for (const day of new Set([...Object.keys(L.activity ?? {}), ...Object.keys(R.activity ?? {})])) {
    const a = L.activity?.[day] ?? {}, b = R.activity?.[day] ?? {};
    const merged: Record<string, number> = {};
    for (const type of new Set([...Object.keys(a), ...Object.keys(b)]))
      merged[type] = Math.max(a[type as keyof typeof a] ?? 0, b[type as keyof typeof b] ?? 0);
    activity[day] = merged;
  }
  const ld = L.daily ?? blank().daily, rd = R.daily ?? blank().daily;
  const daily = (rd.date ?? "") >= (ld.date ?? "") ? rd : ld;
  return { version: 2, history, activity, daily,
    adaptive: Object.keys(R.history ?? {}).length ? R.adaptive : L.adaptive };
}
