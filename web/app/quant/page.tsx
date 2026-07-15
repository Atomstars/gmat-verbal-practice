"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Tile from "@/components/SectionTile";
import { loadAll, playable } from "@/lib/banks";
import { Store } from "@/lib/store";
import type { QType, Question } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import styles from "../page.module.css";

function QuantMenu() {
  const params = useSearchParams();
  const raw = params.get("type");
  const type: QType = raw === "DS" ? "DS" : "PS";
  const [all, setAll] = useState<Question[] | null>(null);

  useEffect(() => { loadAll().then(setAll); }, []);

  const pool = all?.filter((q) => q.type === type && playable(q)) ?? [];
  const wrong = (() => {
    if (!all) return 0;
    const w = new Set(Store.wrongIds());
    return pool.filter((q) => w.has(q.id)).length;
  })();

  const label = TYPE_LABEL[type];
  const t = encodeURIComponent(label);

  return (
    <main className="wrap">
      <div className={styles.hero}>
        <div className={styles.kick}>{type === "DS" ? "Section" : "Quant"}</div>
        <h1>{label}</h1>
      </div>
      <h2 className={styles.sec}>Practice</h2>
      <div className={styles.grid}>
        <Tile href={`/setup?types=${type}&title=${t}`} icon="book" accent="blue" title="Full set"
          count={`${pool.length} q`} />
        <Tile href={`/setup?types=${type}&only=topic&title=${t}`} icon="list" accent="teal" title="By topic" />
        <Tile href={`/setup?types=${type}&mode=redo&title=${encodeURIComponent(`${label} · Review`)}`}
          icon="refresh" accent="green" title="Repractice wrong" count={`${wrong} saved`} />
      </div>
    </main>
  );
}

export default function QuantPage() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <QuantMenu />
    </Suspense>
  );
}
