import { Store } from "./store";
import type { Question } from "./types";

/** Daily RC + adaptive level: one passage per day; ≥75% → level up, <50% → down. */
const LEVELS = ["Easy", "Medium", "Hard"] as const;

export function buildPassages(all: Question[]) {
  const map = new Map<string, Question[]>();
  for (const q of all) {
    if (q.type !== "RC" || !q.passage || !q.correct_answer) continue;
    const k = q.passage.slice(0, 80);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(q);
  }
  return [...map.values()].map((qs) => ({ level: qs[0].difficulty ?? "Medium", qs }));
}

export function pickDaily(all: Question[]): Question[] {
  const lvl = Store.get().daily.level || "Easy";
  const ps = buildPassages(all);
  const atLevel = ps.filter((p) => p.level === lvl);
  const pool = atLevel.length ? atLevel : ps;
  return pool.length ? pool[(Math.random() * pool.length) | 0].qs : [];
}

/** Called once when a daily session finishes; adapts level + advances streak. */
export function finishDaily(pct: number) {
  const today = new Date().toISOString().slice(0, 10);
  Store.updateDaily((d) => {
    let li = Math.max(0, LEVELS.indexOf((d.level as (typeof LEVELS)[number]) ?? "Easy"));
    if (pct >= 75) li = Math.min(2, li + 1);
    else if (pct < 50) li = Math.max(0, li - 1);
    return {
      ...d,
      date: today,
      level: LEVELS[li],
      lastPct: pct,
      streak: d.date === today ? d.streak : (d.streak || 0) + 1,
      recent: [pct, ...(d.recent ?? [])].slice(0, 6),
    };
  });
}
