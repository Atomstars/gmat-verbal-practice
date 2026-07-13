"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadAll } from "@/lib/banks";
import { embCount, embedQuery, loadEmbeddings, vecSearch } from "@/lib/vector";
import type { Question } from "@/lib/types";
import styles from "./SmartSearch.module.css";

const EXAMPLES = [
  "weaken an argument", "work & rate problems", "geometry — circles",
  "inference from a passage", "probability & combinations", "data sufficiency on averages",
];

export default function SmartSearch() {
  const router = useRouter();
  const [all, setAll] = useState<Question[]>([]);
  const [ai, setAi] = useState<"loading" | "on" | "off">("loading");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<{ q: Question; score: number }[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAll().then(async (qs) => {
      setAll(qs);
      const ok = await loadEmbeddings(qs);
      setAi(ok ? "on" : "off");
    });
  }, []);

  const search = async (text: string) => {
    if (!text || text.length < 3) { setResults(null); setStatus(""); return; }
    setStatus("Searching…");
    try {
      const qv = await embedQuery(text, () =>
        setStatus("Warming up the search model (first time only)…"),
      );
      const res = vecSearch(all, qv, 8);
      setResults(res);
      setStatus(`${res.length} result${res.length !== 1 ? "s" : ""} for "${text}"`);
    } catch {
      setStatus("Couldn't load the on-device search model — check your connection and retry.");
    }
  };

  const onInput = (v: string) => {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v.trim()), 400);
  };

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.title}>Smart search</span>
        <span className={`${styles.pill} ${styles[ai]}`}>
          {ai === "on" ? `AI ready · ${embCount()} indexed` : ai === "loading" ? "loading…" : "index unavailable"}
        </span>
      </div>
      <input
        className={styles.input}
        placeholder="Describe a question — e.g. “weaken an argument about pollution”"
        value={query}
        onChange={(e) => onInput(e.target.value)}
        spellCheck={false}
      />
      <div className={styles.chips}>
        {EXAMPLES.map((x) => (
          <button key={x} type="button" onClick={() => { setQuery(x); search(x); }}>
            {x}
          </button>
        ))}
      </div>
      {status && <div className={styles.status}>{status}</div>}
      {results && (
        <div className={styles.results}>
          {results.map(({ q, score }) => {
            const stem = q.question.split("\n\n").pop()!.slice(0, 120);
            return (
              <button
                key={q.id}
                type="button"
                className={styles.item}
                onClick={() => router.push(`/practice?ids=${q.id}`)}
              >
                <span className={styles.meta}>
                  <b>{q.type}</b>
                  {q.difficulty && <i>{q.difficulty}</i>}
                  <i>{q.subtype ?? q.chapter}</i>
                  <em>{Math.round(score * 100)}% match</em>
                </span>
                <span className={styles.stem}>{stem}…</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
