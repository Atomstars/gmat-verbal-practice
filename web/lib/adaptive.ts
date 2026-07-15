import { buildPassages } from "./daily";
import { playable } from "./banks";
import type { QType, Question } from "./types";

/**
 * GMAT Focus (adaptive) engine for Verbal. Mirrors the real section: a mixed
 * RC + CR set (~23 questions) whose difficulty tracks performance — a correct
 * answer nudges the next question harder, a wrong one easier. RC is served a
 * whole passage at a time (a unit); its difficulty is adapted per-passage
 * (≥75% correct → up, <50% → down), matching the Daily-RC rule.
 *
 * Only the OG bank is used (it carries `difficulty`); Manhattan verbal has none.
 */

export const LEVELS = ["Easy", "Medium", "Hard"] as const;
export type Level = (typeof LEVELS)[number];

const shuffle = <T>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export interface AdaptiveState {
  target: number;
  rcQuestionTarget: number;
  li: number; // current level index into LEVELS
  cr: Question[][]; // unused CR questions, bucketed by level [Easy, Medium, Hard]
  rc: Question[][][]; // unused RC passages (each a Question[]), bucketed by passage level
  servedIds: Set<string>;
  rcServed: number;
  last: Question | null;
  curRemaining: Question[]; // remaining questions of the passage in progress
  curScore: { c: number; a: number };
  order: Question[];
}

function bucketByLevel<T>(items: T[], levelOf: (x: T) => string): T[][] {
  const out: T[][] = [[], [], []];
  for (const it of items) {
    const i = LEVELS.indexOf((levelOf(it) as Level) ?? "Medium");
    out[i < 0 ? 1 : i].push(it);
  }
  return out;
}

/** Pop the nearest-available item to level `li` (tries li, then spreads outward). */
function popNearest<T>(buckets: T[][], li: number): T | null {
  for (const d of [0, 1, -1, 2, -2]) {
    const i = li + d;
    if (i >= 0 && i < buckets.length && buckets[i].length) return buckets[i].shift()!;
  }
  return null;
}

/** Build the initial state and serve the first question. */
export function startAdaptive(
  all: Question[],
  target = 23,
  types?: QType[],
): { state: AdaptiveState; first: Question } | null {
  const wantRC = !types || types.includes("RC");
  const wantCR = !types || types.includes("CR");
  const og = all.filter((q) => q.bank === "og" && playable(q) && q.difficulty);
  const crBuckets = bucketByLevel(
    shuffle(wantCR ? og.filter((q) => q.type === "CR") : []),
    (q) => q.difficulty!,
  );
  const passages = wantRC
    ? shuffle(buildPassages(all).filter((p) => p.qs[0].bank === "og" && p.qs[0].difficulty))
    : [];
  const rcBuckets = bucketByLevel(passages, (p) => p.level).map((grp) => grp.map((p) => p.qs));

  const rcQuestionTarget = !wantRC ? 0 : !wantCR ? target : Math.round(target * 0.42);
  const state: AdaptiveState = {
    target,
    rcQuestionTarget, // ~10 of 23 → roughly 3 passages (or full target when RC-only)
    li: 1, // start Medium
    cr: crBuckets,
    rc: rcBuckets,
    servedIds: new Set(),
    rcServed: 0,
    last: null,
    curRemaining: [],
    curScore: { c: 0, a: 0 },
    order: [],
  };

  // Start with an RC passage (the real section opens with reading).
  const first = serveNextUnit(state, true);
  if (!first) return null;
  return { state, first };
}

/** Decide + serve the next unit's first question; returns it (or null if none). */
function serveNextUnit(state: AdaptiveState, preferRC: boolean): Question | null {
  const rcBehind = state.rcServed < state.rcQuestionTarget;
  const wantRC = rcBehind && (preferRC || state.rcServed / state.rcQuestionTarget <= state.order.length / state.target);
  if (wantRC) {
    const passage = popNearest(state.rc, state.li);
    if (passage && passage.length) {
      state.curRemaining = passage.slice(1);
      state.curScore = { c: 0, a: 0 };
      return serve(state, passage[0]);
    }
  }
  const cr = popNearest(state.cr, state.li);
  if (cr) return serve(state, cr);
  // out of CR — fall back to any remaining RC passage
  const passage = popNearest(state.rc, state.li);
  if (passage && passage.length) {
    state.curRemaining = passage.slice(1);
    state.curScore = { c: 0, a: 0 };
    return serve(state, passage[0]);
  }
  return null;
}

function serve(state: AdaptiveState, q: Question): Question {
  state.servedIds.add(q.id);
  state.order.push(q);
  state.last = q;
  if (q.type === "RC") state.rcServed++;
  return q;
}

const up = (li: number) => Math.min(2, li + 1);
const down = (li: number) => Math.max(0, li - 1);

/**
 * Record the result of the just-answered question and return the next one to
 * serve, or null when the target is reached (session over).
 */
export function pickNext(state: AdaptiveState, lastCorrect: boolean): Question | null {
  const last = state.last;
  if (last) {
    if (last.type === "RC") {
      state.curScore.a++;
      if (lastCorrect) state.curScore.c++;
      if (state.curRemaining.length === 0) {
        // passage finished → adapt level by its score
        const pct = state.curScore.a ? state.curScore.c / state.curScore.a : 0.5;
        state.li = pct >= 0.75 ? up(state.li) : pct < 0.5 ? down(state.li) : state.li;
      }
    } else {
      state.li = lastCorrect ? up(state.li) : down(state.li);
    }
  }

  if (state.servedIds.size >= state.target) return null;

  // continue the passage in progress before starting a new unit
  if (state.curRemaining.length) return serve(state, state.curRemaining.shift()!);

  return serveNextUnit(state, false);
}
