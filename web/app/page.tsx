"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import ConsistencyTracker from "@/components/ConsistencyTracker";
import Icon from "@/components/Icon";
import SmartSearch from "@/components/SmartSearch";
import Tile from "@/components/SectionTile";
import { loadAll } from "@/lib/banks";
import { Store } from "@/lib/store";
import { Sync } from "@/lib/sync";
import type { Question } from "@/lib/types";
import styles from "./page.module.css";

export default function Home() {
  const [gate, setGate] = useState<"pending" | "show" | "done">("pending");
  const [, setAll] = useState<Question[] | null>(null);
  const [err, setErr] = useState(false);
  const [focus, setFocus] = useState<ReturnType<typeof Store.weakest>[number] | null>(null);

  useEffect(() => {
    /* show the auth landing once, until sign-in or explicit guest choice */
    let guest = false;
    try { guest = localStorage.getItem("gmat_guest") === "1"; } catch {}
    setGate(Sync.user || guest ? "done" : "show");
    const unsub = Sync.subscribe(() => { if (Sync.user) setGate("done"); });

    loadAll().then(setAll).catch(() => setErr(true));
    setFocus(Store.weakest()[0] ?? null);
    return unsub;
  }, []);

  if (gate === "pending") return null;
  if (gate === "show") return <AuthGate onDone={() => setGate("done")} />;

  return (
    <main className="wrap">
      <ConsistencyTracker />

      <SmartSearch />

      {err && (
        <p className={styles.error}>
          Couldn&apos;t load the question banks — check that /data is deployed.
        </p>
      )}

      {focus && (
        <Link
          href={`/setup?types=${focus.type}&topic=${encodeURIComponent(focus.concept)}&title=${encodeURIComponent(`${focus.concept} · Focus`)}`}
          className={styles.focus}
        >
          <span className={styles.focusIcon}><Icon name="target" size={17} /></span>
          <span className={styles.focusBody}>
            <span className={styles.focusKick}>Focus today</span>
            <span className={styles.focusText}>{focus.type} · {focus.concept} — {focus.pct}% ({focus.c}/{focus.t})</span>
          </span>
          <span className={styles.focusGo}>Drill →</span>
        </Link>
      )}

      <h2 className={styles.sec}>Sections</h2>
      <div className={styles.grid}>
        <Tile href="/verbal" icon="book" accent="blue" title="Verbal" />
        <Tile href="/quant?type=PS" icon="bars" accent="teal" title="Quant" />
        <Tile href="/quant?type=DS" icon="layers" accent="violet" title="Data Sufficiency" />
        <Tile href="/fulllength" icon="clock" accent="amber" title="Tests" />
        <Tile href="/setup?mode=redo&title=Review" icon="refresh" accent="green" title="Review" />
        <Tile href="/dashboard" icon="chart" accent="blue" title="Dashboard" feature />
        <Tile href="/analyzer" icon="brain" accent="gold" title="Analyzer" badge="PREMIUM" />
        <Tile href="/tutor" icon="graduate" accent="gold" title="Tutor" badge="PREMIUM" />
      </div>
    </main>
  );
}
