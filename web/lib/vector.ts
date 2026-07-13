import type { Question } from "./types";

/* In-browser vector search: precomputed L2-normalized vectors (embeddings.json)
   + on-device query encoding via transformers.js (all-MiniLM-L6-v2). */

const EMB = new Map<string, Float32Array>();
let ready = false;
let loading: Promise<boolean> | null = null;

export async function loadEmbeddings(all: Question[]): Promise<boolean> {
  if (ready) return true;
  if (loading) return loading;
  loading = (async () => {
    for (const q of all as (Question & { embedding?: number[] })[]) {
      if (Array.isArray(q.embedding) && !EMB.has(q.id))
        EMB.set(q.id, Float32Array.from(q.embedding));
    }
    try {
      const r = await fetch("/data/embeddings.json", { cache: "force-cache" });
      if (r.ok) {
        const j = (await r.json()) as Record<string, number[]>;
        for (const id in j) if (!EMB.has(id)) EMB.set(id, Float32Array.from(j[id]));
      }
    } catch {}
    ready = EMB.size > 0;
    return ready;
  })();
  return loading;
}

export const embCount = () => EMB.size;

const cosine = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function vecSimilar(all: Question[], id: string, limit: number) {
  const e = EMB.get(id);
  if (!e) return [];
  const out: { q: Question; score: number }[] = [];
  for (const q of all) {
    if (q.id === id) continue;
    const v = EMB.get(q.id);
    if (v) out.push({ q, score: cosine(e, v) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function vecSearch(all: Question[], qv: Float32Array, limit: number) {
  const out: { q: Question; score: number }[] = [];
  for (const q of all) {
    const v = EMB.get(q.id);
    if (v) out.push({ q, score: cosine(qv, v) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* lazy on-device query encoder */
/* eslint-disable @typescript-eslint/no-explicit-any */
let extractor: any = null;
let extractorLoading: Promise<any> | null = null;

export async function embedQuery(text: string, onModelLoad?: () => void): Promise<Float32Array> {
  if (!extractor) {
    if (!extractorLoading) {
      onModelLoad?.();
      extractorLoading = (async () => {
        const mod = await import("@xenova/transformers");
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        return extractor;
      })();
    }
    extractor = await extractorLoading;
  }
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Float32Array.from(out.data);
}
