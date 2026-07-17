"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { loadAll, playable } from "@/lib/banks";
import { Store } from "@/lib/store";
import type { QType, Question } from "@/lib/types";
import { conceptOf, TYPE_LABEL } from "@/lib/types";
import styles from "./setup.module.css";

const DIFFS = ["Easy", "Medium", "Hard"] as const;
const DURATIONS = [10, 20, 30, 40]; // minutes

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const types = (params.get("types")?.split(",") ?? []) as QType[];
  const mode = params.get("mode") ?? "practice"; // practice | exam | redo
  const only = params.get("only"); // 'topic' | 'diff' | null — which division this entry is for
  const incomingOrder = params.get("order"); // forwarded to /practice (e.g. Random Mix)
  const title =
    params.get("title") ??
    (types.length === 1 ? TYPE_LABEL[types[0]] : "Practice session");

  const [all, setAll] = useState<Question[]>([]);
  const [timed, setTimed] = useState(mode === "exam");
  const [count, setCount] = useState(mode === "exam" ? 23 : 10);
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [diff, setDiff] = useState(params.get("diff") ?? "All");
  const [limitMin, setLimitMin] = useState(20);

  useEffect(() => { loadAll().then(setAll); }, []);

  /* base pool (type AND redo filters compose, so "Review · Verbal" etc. work) */
  const basePool = useMemo(() => {
    let p = all.filter(playable);
    if (mode === "redo") {
      const wrong = new Set(Store.wrongIds());
      p = p.filter((q) => wrong.has(q.id));
    }
    if (types.length) p = p.filter((q) => types.includes(q.type));
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, mode, params]);

  const topics = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of basePool) {
      const k = conceptOf(q);
      if (k) c[k] = (c[k] ?? 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [basePool]);

  const hasDifficulty = useMemo(() => basePool.some((q) => q.difficulty), [basePool]);

  /* difficulty counts within the current topic selection */
  const diffCounts = useMemo(() => {
    const c: Record<string, number> = { All: 0, Easy: 0, Medium: 0, Hard: 0 };
    for (const q of basePool) {
      if (topic && conceptOf(q) !== topic) continue;
      c.All++;
      if (q.difficulty) c[q.difficulty] = (c[q.difficulty] ?? 0) + 1;
    }
    return c;
  }, [basePool, topic]);

  const pool = useMemo(() => {
    let p = basePool;
    if (topic) p = p.filter((q) => conceptOf(q) === topic);
    if (diff !== "All") p = p.filter((q) => q.difficulty === diff);
    return p;
  }, [basePool, topic, diff]);

  /* Every session shows a question only once, so exclude already-attempted
     questions here too — counts reflect what you'll actually be served. Only
     Review (redo) is exempt (it exists to resurface misses). */
  const seen = useMemo(() => new Set(Store.seenIds()), [all]);
  const freshPool = useMemo(
    () => (mode === "redo" ? pool : pool.filter((q) => !seen.has(q.id))),
    [pool, seen, mode],
  );
  const doneCount = pool.length - freshPool.length;

  const showTopic = only !== "diff" && topics.length > 1;
  const showDiff = only !== "topic" && hasDifficulty;

  const start = () => {
    const n = Math.min(count, freshPool.length);
    const q = new URLSearchParams();
    if (types.length) q.set("types", types.join(","));
    q.set("mode", mode);
    q.set("n", String(n));
    if (topic) q.set("topic", topic);
    if (diff !== "All") q.set("diff", diff);
    if (timed) { q.set("timed", "1"); q.set("limit", String(limitMin * 60)); }
    if (incomingOrder) q.set("order", incomingOrder);
    q.set(
      "title",
      title + (topic ? ` · ${topic}` : "") + (diff !== "All" ? ` · ${diff}` : ""),
    );
    router.push(`/practice?${q.toString()}`);
  };

  const countOpts = [5, 10, 15, 21, 23, 30];

  return (
    <main className="wrap">
      <div className={styles.card}>
        <div className={styles.kick}>Session</div>
        <h1>{title}</h1>

        {showTopic && (
          <div className={styles.field}>
            <label>{types[0] === "RC" || types[0] === "CR" ? "Question type" : "Topic"}</label>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All ({basePool.length})</option>
              {topics.map(([t, n]) => (
                <option key={t} value={t}>{t} ({n})</option>
              ))}
            </select>
          </div>
        )}

        {showDiff && (
          <div className={styles.field}>
            <label>Difficulty</label>
            <div className={styles.chips}>
              {(["All", ...DIFFS] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={d !== "All" && !diffCounts[d]}
                  className={diff === d ? styles.on : ""}
                  onClick={() => setDiff(d)}
                >
                  {d}{d !== "All" && <span className={styles.chipN}> {diffCounts[d]}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label>Timing</label>
          <div className={styles.chips}>
            <button className={!timed ? styles.on : ""} onClick={() => setTimed(false)} type="button">Untimed</button>
            <button className={timed ? styles.on : ""} onClick={() => setTimed(true)} type="button">Timed</button>
          </div>
        </div>

        {timed && (
          <div className={styles.field}>
            <label>Time limit</label>
            <div className={styles.chips}>
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={limitMin === m ? styles.on : ""}
                  onClick={() => setLimitMin(m)}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label>How many</label>
          <select value={count} onChange={(e) => setCount(+e.target.value)}>
            {countOpts.map((n) => (
              <option key={n} value={n}>{n} questions</option>
            ))}
            <option value={999}>Everything ({freshPool.length})</option>
          </select>
        </div>

        <button className={styles.start} onClick={start} disabled={!freshPool.length}>
          Start →
        </button>
        <p className={styles.note}>
          {freshPool.length
            ? `${freshPool.length} ${mode === "redo" ? "" : "new "}question${freshPool.length === 1 ? "" : "s"} available${
                mode !== "redo" && doneCount ? ` · ${doneCount} already done` : ""
              }${mode === "exam" ? " · exam pacing: no feedback until the report" : ""}.`
            : mode === "redo"
              ? "Nothing to redo yet — missed questions land here."
              : pool.length
                ? "You've already done every question in this selection — try Review, or a different topic."
                : "No questions match these filters."}
        </p>
      </div>
    </main>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <Setup />
    </Suspense>
  );
}
