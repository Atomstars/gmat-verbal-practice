"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { loadAll } from "@/lib/banks";
import { Store } from "@/lib/store";
import type { QType, Question } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import styles from "./history.module.css";

const mmss = (s: number) => {
  s = Math.max(0, s | 0);
  return `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const fmtDate = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

function HistoryView() {
  const params = useSearchParams();
  const types = (params.get("types")?.split(",").filter(Boolean) ?? []) as QType[];
  const title =
    params.get("title") ??
    (types.length ? types.map((t) => TYPE_LABEL[t]).join(" + ") : "All sections");

  const [all, setAll] = useState<Question[] | null>(null);
  useEffect(() => { loadAll().then(setAll); }, []);

  /* Every attempted question in this section, most recent first. */
  const rows = useMemo(() => {
    if (!all) return [];
    const byId = new Map(all.map((q) => [q.id, q]));
    const hist = Store.get().history;
    return Object.entries(hist)
      .filter(([, h]) => !types.length || types.includes(h.type as QType))
      .map(([id, h]) => ({ id, h, q: byId.get(id) }))
      .sort((a, b) => b.h.ts - a.h.ts);
  }, [all, types]);

  const summary = useMemo(() => {
    let corr = 0, timeMs = 0, timed = 0;
    for (const { h } of rows) {
      if (h.lastResult === "correct") corr++;
      if (h.lastTimeMs) { timeMs += h.lastTimeMs; timed++; }
    }
    return {
      n: rows.length,
      pct: rows.length ? Math.round((100 * corr) / rows.length) : 0,
      avg: timed ? Math.round(timeMs / timed / 1000) : 0,
    };
  }, [rows]);

  if (!all) return <main className="wrap">Loading…</main>;

  return (
    <main className="wrap">
      <div className={styles.hero}>
        <div className={styles.kick}>History · attempted</div>
        <h1>{title}</h1>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Nothing here yet. Once you practice, every question you attempt shows up here
          with your result and the time you spent.
        </p>
      ) : (
        <>
          <div className={styles.stats}>
            <div><b>{summary.n}</b><span>attempted</span></div>
            <div><b>{summary.pct}%</b><span>correct</span></div>
            <div><b>{summary.avg ? `${summary.avg}s` : "—"}</b><span>avg / question</span></div>
          </div>

          <div className={styles.list}>
            {rows.map(({ id, h, q }) => {
              const stem = q ? q.question.split("\n\n").pop()! : "";
              return (
                <div key={id} className={styles.item}>
                  <div className={styles.head}>
                    <span className={h.lastResult === "correct" ? styles.ok : styles.bad}>
                      {h.lastResult === "correct" ? "✓" : "✗"}
                    </span>
                    <span className={styles.meta}>
                      {h.type} · {h.subtype ?? h.chapter ?? "—"}
                      {h.difficulty ? ` · ${h.difficulty}` : ""}
                    </span>
                    <span className={styles.time}>
                      ⏱ {h.lastTimeMs ? mmss(Math.round(h.lastTimeMs / 1000)) : "—"}
                      {h.ts ? ` · ${fmtDate(h.ts)}` : ""}
                    </span>
                  </div>
                  <p className={styles.stem}>
                    {q ? `${stem.slice(0, 150)}${stem.length > 150 ? "…" : ""}` : "Question no longer in the bank."}
                  </p>
                  <div className={styles.foot}>
                    <span className={styles.attempts}>
                      {h.attempts} attempt{h.attempts === 1 ? "" : "s"} · {h.correct}/{h.attempts} correct
                    </span>
                    {q && (
                      <Link className={styles.redo} href={`/practice?ids=${id}&title=${encodeURIComponent("Retry")}`}>
                        Retry →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <HistoryView />
    </Suspense>
  );
}
