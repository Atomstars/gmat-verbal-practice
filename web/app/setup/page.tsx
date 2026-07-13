"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { loadAll, playable } from "@/lib/banks";
import { Store } from "@/lib/store";
import type { QType, Question } from "@/lib/types";
import { conceptOf, isQuantType, TYPE_LABEL } from "@/lib/types";
import styles from "./setup.module.css";

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const types = (params.get("types")?.split(",") ?? []) as QType[];
  const mode = params.get("mode") ?? "practice"; // practice | exam | redo
  const title =
    params.get("title") ??
    (types.length === 1 ? TYPE_LABEL[types[0]] : "Practice session");

  const [all, setAll] = useState<Question[]>([]);
  const [timed, setTimed] = useState(mode === "exam");
  const [count, setCount] = useState(mode === "exam" ? 23 : 10);
  const [order, setOrder] = useState<"shuffle" | "book">("shuffle");
  const [topic, setTopic] = useState("");

  useEffect(() => { loadAll().then(setAll); }, []);

  const pool = useMemo(() => {
    let p = all.filter(playable);
    if (mode === "redo") {
      const wrong = new Set(Store.wrongIds());
      p = p.filter((q) => wrong.has(q.id));
    } else if (types.length) p = p.filter((q) => types.includes(q.type));
    if (topic) p = p.filter((q) => conceptOf(q) === topic);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, topic, mode, params]);

  const topics = useMemo(() => {
    if (types.length !== 1 || !isQuantType(types[0])) return [];
    const c: Record<string, number> = {};
    for (const q of all.filter((q) => q.type === types[0] && playable(q))) {
      const k = conceptOf(q);
      if (k) c[k] = (c[k] ?? 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, params]);

  const start = () => {
    const n = Math.min(count, pool.length);
    const q = new URLSearchParams();
    if (types.length) q.set("types", types.join(","));
    q.set("mode", mode);
    q.set("n", String(n));
    q.set("order", order);
    if (timed) q.set("timed", "1");
    if (topic) q.set("topic", topic);
    q.set("title", title + (topic ? ` · ${topic}` : ""));
    router.push(`/practice?${q.toString()}`);
  };

  return (
    <main className="wrap">
      <div className={styles.card}>
        <div className={styles.kick}>Session</div>
        <h1>{title}</h1>

        {topics.length > 0 && (
          <div className={styles.field}>
            <label>Topic</label>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All topics ({pool.length})</option>
              {topics.map(([t, n]) => (
                <option key={t} value={t}>{t} ({n})</option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.field}>
          <label>Timing</label>
          <div className={styles.chips}>
            <button className={!timed ? styles.on : ""} onClick={() => setTimed(false)} type="button">Untimed</button>
            <button className={timed ? styles.on : ""} onClick={() => setTimed(true)} type="button">Timed</button>
          </div>
        </div>

        <div className={styles.field}>
          <label>How many</label>
          <select value={count} onChange={(e) => setCount(+e.target.value)}>
            {[5, 10, 15, 21, 23, 30].map((n) => (
              <option key={n} value={n}>{n} questions</option>
            ))}
            <option value={999}>Everything ({pool.length})</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>Order</label>
          <div className={styles.chips}>
            <button className={order === "shuffle" ? styles.on : ""} onClick={() => setOrder("shuffle")} type="button">Shuffle</button>
            <button className={order === "book" ? styles.on : ""} onClick={() => setOrder("book")} type="button">In book order</button>
          </div>
        </div>

        <button className={styles.start} onClick={start} disabled={!pool.length}>
          Start →
        </button>
        <p className={styles.note}>
          {pool.length
            ? `${pool.length} questions available${mode === "exam" ? " · exam pacing: no feedback until the report" : ""}.`
            : mode === "redo"
              ? "Nothing to redo yet — missed questions land here."
              : "Loading questions…"}
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
