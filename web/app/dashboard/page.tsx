"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Store } from "@/lib/store";
import styles from "./dash.module.css";

const MIN_ATTEMPTS = 3;
const SECTIONS = [
  { label: "Reading Comprehension", types: ["RC"] },
  { label: "Critical Reasoning", types: ["CR"] },
  { label: "Problem Solving", types: ["PS"] },
  { label: "Data Sufficiency", types: ["DS"] },
];

interface Sec { label: string; t: number; c: number; w: number; pct: number | null; }

export default function Dashboard() {
  const [ov, setOv] = useState({ seen: 0, corr: 0, pct: null as number | null });
  const [wrong, setWrong] = useState(0);
  const [secs, setSecs] = useState<Sec[]>([]);
  const [insight, setInsight] = useState("");

  useEffect(() => {
    const o = Store.overall();
    setOv(o);
    setWrong(Store.wrongIds().length);
    const hist = Object.values(Store.get().history);
    setSecs(
      SECTIONS.map(({ label, types }) => {
        let t = 0, c = 0;
        for (const h of hist) {
          if (!types.includes(h.type)) continue;
          t++;
          if (h.lastResult === "correct") c++;
        }
        return { label, t, c, w: t - c, pct: t ? Math.round((100 * c) / t) : null };
      }),
    );
    /* weakest concept with enough attempts */
    let best: { name: string; c: number; t: number; p: number } | null = null;
    for (const field of ["subtype", "chapter"] as const) {
      const agg = Store.byField(field);
      for (const [name, a] of Object.entries(agg)) {
        if (a.t < MIN_ATTEMPTS) continue;
        const p = a.c / a.t;
        if (!best || p < best.p) best = { name, c: a.c, t: a.t, p };
      }
    }
    setInsight(
      !o.seen
        ? "Answer a few questions and this space highlights your weakest topic."
        : best
          ? `🎯 Focus area: your weakest subchapter is ${best.name} (${best.c}/${best.t}, ${Math.round(100 * best.p)}%).`
          : `You're at ${o.pct}% over ${o.seen} questions. Weak-spot targeting unlocks at ${MIN_ATTEMPTS}+ tries per topic.`,
    );
  }, []);

  const C = 2 * Math.PI * 28;
  return (
    <main className="wrap">
      <div className={styles.head}>
        <div className={styles.kick}>Dashboard</div>
        <h1>Your performance</h1>
      </div>

      <div className={styles.hero}>
        <div className={styles.ringbox}>
          <svg width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
            <circle cx="33" cy="33" r="28" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="7" />
            <circle cx="33" cy="33" r="28" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={ov.pct == null ? C : C - (C * ov.pct) / 100}
              transform="rotate(-90 33 33)" />
          </svg>
          <div>
            <div className={styles.pc}>{ov.pct == null ? "—" : `${ov.pct}%`}</div>
            <div className={styles.subt}>{ov.seen ? `${ov.corr}/${ov.seen} correct` : "no attempts yet"}</div>
          </div>
        </div>
        <div className={styles.quick}>
          <div><b>{ov.seen}</b><span>Done</span></div>
          <div><b>{ov.corr}</b><span>Correct</span></div>
          <div><b>{wrong}</b><span>To redo</span></div>
        </div>
      </div>

      <h2 className={styles.sec}>By section</h2>
      <div className={styles.cards}>
        {secs.map((s) => (
          <div key={s.label} className={styles.card}>
            <div className={styles.cardHead}>
              <b>{s.label}</b>
              <span>{s.pct == null ? "—" : `${s.pct}%`}</span>
            </div>
            <div className={styles.cardStats}>
              <span><b>{s.t}</b> done</span>
              <span className={styles.good}><b>{s.c}</b> right</span>
              <span className={styles.badTxt}><b>{s.w}</b> wrong</span>
            </div>
            {s.t > 0 && (
              <div className={styles.barTrack}>
                <i style={{ width: `${(100 * s.c) / s.t}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.callout}>{insight}</div>
      <p className={styles.foot}>
        Progress is saved on this device — export or reset it in <Link href="/settings">Settings</Link>.
      </p>
    </main>
  );
}
