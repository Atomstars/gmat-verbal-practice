"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Store, type HistoryEntry } from "@/lib/store";
import { Sync } from "@/lib/sync";
import type { QType } from "@/lib/types";
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
  const typesKey = params.get("types") ?? "";
  const types = useMemo(() => (typesKey.split(",").filter(Boolean) as QType[]), [typesKey]);
  const title =
    params.get("title") ??
    (types.length ? types.map((t) => TYPE_LABEL[t]).join(" + ") : "All sections");

  const [rows, setRows] = useState<{ id: string; h: HistoryEntry; stem: string }[] | null>(null);
  useEffect(() => {
    const load = async () => {
      if (Sync.user) {
        try {
          const query = types.length ? `?types=${types.join(",")}` : "";
          const data = await apiFetch<{ rows: Array<Record<string, unknown>> }>(`/api/history${query}`);
          setRows(data.rows.map((raw) => {
            const q = (Array.isArray(raw.questions) ? raw.questions[0] : raw.questions) as Record<string, unknown>;
            return { id: String(raw.question_id), stem: String(q?.question ?? ""), h: {
              attempts: Number(raw.attempt_count), correct: Number(raw.correct_count),
              lastPicked: String(raw.last_answer ?? ""), lastResult: raw.last_result ? "correct" : "wrong",
              lastTimeMs: raw.last_time_ms == null ? undefined : Number(raw.last_time_ms),
              ts: raw.last_attempted_at ? new Date(String(raw.last_attempted_at)).getTime() : 0,
              type: String(q?.type ?? ""), subtype: q?.subtype as string | null,
              chapter: q?.chapter as string | null, difficulty: q?.difficulty as string | null,
            } };
          }));
          return;
        } catch {}
      }
      const local = Object.entries(Store.get().history)
        .filter(([, h]) => !types.length || types.includes(h.type as QType))
        .map(([id, h]) => ({ id, h, stem: h.stem ?? "" }))
        .sort((a, b) => b.h.ts - a.h.ts);
      setRows(local);
    };
    void load();
    return Sync.subscribe(() => { void load(); });
  }, [types]);

  /* Every attempted question in this section, most recent first. */
  const shownRows = useMemo(() => rows ?? [], [rows]);

  const summary = useMemo(() => {
    let corr = 0, timeMs = 0, timed = 0;
    for (const { h } of shownRows) {
      if (h.lastResult === "correct") corr++;
      if (h.lastTimeMs) { timeMs += h.lastTimeMs; timed++; }
    }
    return {
      n: shownRows.length,
      pct: shownRows.length ? Math.round((100 * corr) / shownRows.length) : 0,
      avg: timed ? Math.round(timeMs / timed / 1000) : 0,
    };
  }, [shownRows]);

  if (!rows) return <main className="wrap">Loading…</main>;

  return (
    <main className="wrap">
      <div className={styles.hero}>
        <div className={styles.kick}>History · attempted</div>
        <h1>{title}</h1>
      </div>

      {shownRows.length === 0 ? (
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
            {shownRows.map(({ id, h, stem }) => {
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
                    {stem ? `${stem.slice(0, 150)}${stem.length > 150 ? "…" : ""}` : "Question details are not cached on this device."}
                  </p>
                  <div className={styles.foot}>
                    <span className={styles.attempts}>
                      {h.attempts} attempt{h.attempts === 1 ? "" : "s"} · {h.correct}/{h.attempts} correct
                    </span>
                    <Link className={styles.redo} href={`/practice?ids=${id}&title=${encodeURIComponent("Retry")}`}>
                      Retry →
                    </Link>
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
