"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Tile from "@/components/SectionTile";
import { loadAll, playable } from "@/lib/banks";
import { Store } from "@/lib/store";
import type { QType, Question } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import styles from "../page.module.css";

function VerbalMenu() {
  const params = useSearchParams();
  const type = params.get("type") as QType | null; // RC | CR | null
  const [all, setAll] = useState<Question[] | null>(null);

  useEffect(() => { loadAll().then(setAll); }, []);

  const countOf = (t: QType) => all?.filter((q) => q.type === t && playable(q)).length ?? 0;
  const wrongOf = (t: QType) => {
    if (!all) return 0;
    const w = new Set(Store.wrongIds());
    return all.filter((q) => q.type === t && playable(q) && w.has(q.id)).length;
  };
  const doneOf = (t: QType) =>
    all ? Object.values(Store.get().history).filter((h) => h.type === t).length : 0;

  /* ---- per-type submenu (RC or CR) ---- */
  if (type === "RC" || type === "CR") {
    const label = TYPE_LABEL[type];
    const t = encodeURIComponent(label);
    const w = wrongOf(type);
    return (
      <main className="wrap">
        <div className={styles.hero}>
          <div className={styles.kick}>Verbal</div>
          <h1>{label}</h1>
        </div>
        <h2 className={styles.sec}>Practice</h2>
        <div className={styles.grid}>
          <Tile href={`/setup?types=${type}&title=${t}`} icon="book" accent="blue"
            title="Full set" count={`${countOf(type)} q`} />
          <Tile href={`/setup?types=${type}&only=topic&title=${t}`} icon="list" accent="teal"
            title="By subchapter" />
          <Tile href={`/setup?types=${type}&only=diff&title=${t}`} icon="bars" accent="violet"
            title="By difficulty" />
          <Tile href={`/practice?mode=gmatfocus&types=${type}&timed=1&limit=2400&n=23&title=${encodeURIComponent(`GMAT Focus · ${label}`)}`}
            icon="zap" accent="amber" title="GMAT Focus" feature />
          <Tile href={`/setup?types=${type}&mode=redo&title=${encodeURIComponent(`${label} · Review`)}`}
            icon="refresh" accent="green" title="Repractice wrong" count={`${w} saved`} />
          <Tile href={`/history?types=${type}&title=${encodeURIComponent(`${label} · History`)}`}
            icon="clock" accent="gold" title="History" count={`${doneOf(type)} done`} />
        </div>
        <p className={styles.sec} style={{ marginTop: 24 }}>
          <Link href="/verbal">← All Verbal</Link>
        </p>
      </main>
    );
  }

  /* ---- Verbal top level ---- */
  const totalWrong = wrongOf("RC") + wrongOf("CR");
  return (
    <main className="wrap">
      <div className={styles.hero}>
        <div className={styles.kick}>Section</div>
        <h1>Verbal</h1>
      </div>
      <h2 className={styles.sec}>Practice</h2>
      <div className={styles.grid}>
        <Tile href="/practice?mode=gmatfocus&timed=1&limit=2400&n=23&title=GMAT%20Focus%20Verbal"
          icon="zap" accent="amber" title="GMAT Focus Verbal" feature />
        <Tile href="/verbal?type=RC" icon="book" accent="blue"
          title="Reading Comprehension" count={`${countOf("RC")} q`} />
        <Tile href="/verbal?type=CR" icon="chat" accent="teal"
          title="Critical Reasoning" count={`${countOf("CR")} q`} />
        <Tile href="/practice?mode=daily&title=Daily%20RC" icon="calendar" accent="violet"
          title="Daily RC" />
        <Tile href="/setup?types=RC,CR&mode=redo&title=Errored%20Verbal" icon="refresh" accent="green"
          title="Errored Verbal" count={`${totalWrong} saved`} />
        <Tile href="/history?types=RC,CR&title=Verbal%20%C2%B7%20History" icon="clock" accent="gold"
          title="History" count={`${doneOf("RC") + doneOf("CR")} done`} />
      </div>
    </main>
  );
}

export default function VerbalPage() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <VerbalMenu />
    </Suspense>
  );
}
