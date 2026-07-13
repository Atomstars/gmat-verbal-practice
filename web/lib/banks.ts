import type { Bank, Question } from "./types";

/** Bank key → data file. Keys MUST match pipeline/build_index.py. */
export const BANKS: [Bank, string, string][] = [
  ["og", "/data/questions-og.json", "GMAT Official Guide 2024–25"],
  ["manhattan", "/data/questions.json", "Manhattan: All the Verbal"],
  ["quant", "/data/questions-quant.json", "MR Quant Question Bank"],
];

let cache: Question[] | null = null;
let loading: Promise<Question[]> | null = null;

/** Fetch all three banks once and merge into a single tagged pool (910 q). */
export async function loadAll(): Promise<Question[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    const parts = await Promise.all(
      BANKS.map(async ([bank, file]) => {
        const r = await fetch(file, { cache: "no-cache" });
        if (!r.ok) throw new Error(`Failed to load ${file}`);
        const arr = (await r.json()) as Question[];
        for (const q of arr) q.bank = bank;
        return arr;
      }),
    );
    cache = parts.flat();
    return cache;
  })();
  return loading;
}

export const playable = (q: Question) =>
  q.format !== "open_ended" && q.options?.length > 0 && q.correct_answer != null;
