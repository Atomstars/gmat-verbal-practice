"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import SmartSearch from "@/components/SmartSearch";
import { loadAll, playable } from "@/lib/banks";
import { Store } from "@/lib/store";
import { Sync } from "@/lib/sync";
import type { QType, Question } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import styles from "./page.module.css";

const SECTIONS: { type: QType; desc: string }[] = [
  { type: "RC", desc: "Passages with question sets — main idea, inference, structure." },
  { type: "CR", desc: "Arguments — weaken, strengthen, assumptions, flaws." },
  { type: "PS", desc: "Problem Solving — arithmetic to geometry, 24 topics." },
  { type: "DS", desc: "Data Sufficiency — is the information enough?" },
];

export default function Home() {
  const [gate, setGate] = useState<"pending" | "show" | "done">("pending");
  const [all, setAll] = useState<Question[] | null>(null);
  const [err, setErr] = useState(false);
  const [stats, setStats] = useState({ seen: 0, pct: null as number | null, wrong: 0 });

  useEffect(() => {
    /* show the auth landing once, until sign-in or explicit guest choice */
    let guest = false;
    try { guest = localStorage.getItem("gmat_guest") === "1"; } catch {}
    setGate(Sync.user || guest ? "done" : "show");
    const unsub = Sync.subscribe(() => { if (Sync.user) setGate("done"); });

    loadAll().then(setAll).catch(() => setErr(true));
    const o = Store.overall();
    setStats({ seen: o.seen, pct: o.pct, wrong: Store.wrongIds().length });
    return unsub;
  }, []);

  if (gate === "pending") return null;
  if (gate === "show") return <AuthGate onDone={() => setGate("done")} />;

  const countOf = (t: QType) => all?.filter((q) => q.type === t && playable(q)).length ?? 0;

  return (
    <main className="wrap">
      <div className={styles.hero}>
        <div className={styles.kick}>
          {stats.seen ? `${stats.seen} questions practiced` : "Welcome"}
        </div>
        <h1>Ready to train?</h1>
        <div className={styles.hstats}>
          <div><b>{stats.pct == null ? "—" : `${stats.pct}%`}</b><span>Accuracy</span></div>
          <div><b>{stats.seen}</b><span>Done</span></div>
          <div><b>{stats.wrong}</b><span>To redo</span></div>
        </div>
      </div>

      <SmartSearch />

      {err && (
        <p className={styles.error}>
          Couldn&apos;t load the question banks — check that /data is deployed.
        </p>
      )}

      <h2 className={styles.sec}>Sections</h2>
      <div className={styles.grid}>
        {SECTIONS.map(({ type, desc }) => (
          <Link key={type} href={`/setup?types=${type}`} className={styles.tile}>
            <div className={styles.tileHead}>
              <span className={styles.tileType}>{type}</span>
              <span className={styles.tileCount}>{all ? `${countOf(type)} questions` : "…"}</span>
            </div>
            <div className={styles.tileTitle}>{TYPE_LABEL[type]}</div>
            <div className={styles.tileDesc}>{desc}</div>
          </Link>
        ))}
        <Link href="/practice?mode=daily&title=Daily RC" className={styles.tile}>
          <div className={styles.tileHead}><span className={styles.tileType}>DAILY</span></div>
          <div className={styles.tileTitle}>Daily RC</div>
          <div className={styles.tileDesc}>One passage a day at your adaptive level — keep the streak.</div>
        </Link>
        <Link href="/setup?types=RC,CR,PS,DS&title=Random Mix" className={styles.tile}>
          <div className={styles.tileHead}><span className={styles.tileType}>MIX</span></div>
          <div className={styles.tileTitle}>Random Mix</div>
          <div className={styles.tileDesc}>A shuffled set drawn from every section.</div>
        </Link>
        <Link href="/setup?types=RC,CR,PS,DS&mode=exam&title=Exam simulation" className={styles.tile}>
          <div className={styles.tileHead}><span className={styles.tileType}>EXAM</span></div>
          <div className={styles.tileTitle}>Exam simulation</div>
          <div className={styles.tileDesc}>Timed, no feedback until the score report.</div>
        </Link>
        <Link href="/setup?mode=redo&title=Redo my misses" className={styles.tile}>
          <div className={styles.tileHead}>
            <span className={styles.tileType}>REDO</span>
            <span className={styles.tileCount}>{stats.wrong} saved</span>
          </div>
          <div className={styles.tileTitle}>Redo my misses</div>
          <div className={styles.tileDesc}>Every question you last got wrong.</div>
        </Link>
        <Link href="/dashboard" className={`${styles.tile} ${styles.feature}`}>
          <div className={styles.tileHead}><span className={styles.tileType}>STATS</span></div>
          <div className={styles.tileTitle}>Dashboard</div>
          <div className={styles.tileDesc}>Your performance, precision &amp; weak spots.</div>
        </Link>
      </div>
    </main>
  );
}
