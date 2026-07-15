import type { Bank, Question } from "./types";

/**
 * Book-order helpers. Sessions are always delivered in the order the questions
 * appear in their source book, and — critically — every Reading Comprehension
 * passage is kept together as ONE unit: all of passage 1's questions, then all
 * of passage 2's, never interleaved or split.
 */

const BANK_RANK: Record<Bank, number> = { og: 0, manhattan: 1, quant: 2 };

/** A stable sequence number for a question within its book. */
export function seqNum(q: Question): number {
  if (typeof q.number === "number") return q.number;
  // Manhattan ids look like "rc-ch13-q7" → order by chapter then question.
  const ch = /ch(\d+)-q(\d+)/.exec(q.id);
  if (ch) return +ch[1] * 1000 + +ch[2];
  const tail = /(\d+)\s*$/.exec(q.id);
  return tail ? +tail[1] : 0;
}

/** Global book-order key: bank first, then in-book sequence. */
export function bookKey(q: Question): number {
  return (BANK_RANK[q.bank] ?? 9) * 1_000_000 + seqNum(q);
}

/** Passage identity for RC grouping (same text = same passage). */
const passageKey = (q: Question) => `${q.bank}::${(q.passage ?? "").slice(0, 80)}`;

/**
 * Order a pool into book order as a list of UNITS. Each unit is either a single
 * non-RC question or a whole RC passage (its questions, in book order). RC units
 * come first (grouped, ordered by the passage's first question), then the rest.
 */
export function orderedUnits(pool: Question[]): Question[][] {
  const rcGroups = new Map<string, Question[]>();
  const others: Question[] = [];
  for (const q of pool) {
    if (q.type === "RC" && q.passage) {
      const k = passageKey(q);
      if (!rcGroups.has(k)) rcGroups.set(k, []);
      rcGroups.get(k)!.push(q);
    } else {
      others.push(q);
    }
  }
  const rcUnits = [...rcGroups.values()].map((qs) => qs.sort((a, b) => bookKey(a) - bookKey(b)));
  rcUnits.sort((a, b) => bookKey(a[0]) - bookKey(b[0]));
  others.sort((a, b) => bookKey(a) - bookKey(b));
  return [...rcUnits, ...others.map((q) => [q])];
}

/** Flatten the ordered units into a single book-ordered list. */
export function bookOrder(pool: Question[]): Question[] {
  return orderedUnits(pool).flat();
}

/**
 * Take the first ~n questions in book order, but never split an RC passage:
 * once a passage starts it is included whole (so the result may slightly exceed n).
 */
export function takeBook(pool: Question[], n: number): Question[] {
  if (n >= pool.length) return bookOrder(pool);
  const out: Question[] = [];
  for (const unit of orderedUnits(pool)) {
    if (out.length >= n) break;
    out.push(...unit);
  }
  return out;
}
