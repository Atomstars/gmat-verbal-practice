"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { Store } from "@/lib/store";
import { TYPE_LABEL } from "@/lib/types";
import styles from "./analyzer.module.css";

const MIN_ATTEMPTS = 3;

function band(pct: number) {
  if (pct < 50) return "bad";
  if (pct < 75) return "mid";
  return "ok";
}

export default function AnalyzerPage() {
  const [weak, setWeak] = useState<ReturnType<typeof Store.weakest> | null>(null);

  useEffect(() => {
    setWeak(Store.weakest(MIN_ATTEMPTS));
  }, []);

  return (
    <main className="wrap">
      <div className={styles.banner}>
        <span className={styles.badge}>PREMIUM</span>
        <div className={styles.bannerHead}>
          <div className={styles.mark}><Icon name="brain" size={22} /></div>
          <div>
            <h1 className={styles.title}>Analyzer</h1>
            <p className={styles.lede}>
              Where you actually lose points — by question type, not just by section.
            </p>
          </div>
        </div>
      </div>

      {weak === null ? null : weak.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="target" size={22} />
          <p>Answer a few more questions — Analyzer needs at least {MIN_ATTEMPTS} attempts on a
            topic before it can tell you anything trustworthy about it.</p>
          <Link href="/verbal" className={styles.emptyCta}>Start practicing →</Link>
        </div>
      ) : (
        <>
          <h2 className={styles.sec}>Your weakest areas — worst first</h2>
          <div className={styles.list}>
            {weak.slice(0, 8).map((w) => (
              <div key={`${w.type}-${w.concept}`} className={styles.row}>
                <div className={styles.rowMeta}>
                  <span className={styles.rowType}>{w.type}</span>
                  <span className={styles.rowConcept}>{w.concept}</span>
                  <span className={styles.rowSub}>{TYPE_LABEL[w.type]}</span>
                </div>
                <div className={styles.rowStat}>
                  <div className={styles.barTrack}>
                    <i className={styles[band(w.pct)]} style={{ width: `${w.pct}%` }} />
                  </div>
                  <span className={styles.pct}>{w.pct}%</span>
                  <span className={styles.frac}>{w.c}/{w.t}</span>
                </div>
                <Link
                  href={`/setup?types=${w.type}&topic=${encodeURIComponent(w.concept)}&title=${encodeURIComponent(`${w.concept} · Focus`)}`}
                  className={styles.drill}
                >
                  Drill this →
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.aiTeaser}>
        <Icon name="sparkle" size={14} />
        <span>Full AI-narrated analysis — <em>&quot;you miss Weaken questions because you attack the
          conclusion instead of the evidence&quot;</em> — launching soon.</span>
      </div>
    </main>
  );
}
