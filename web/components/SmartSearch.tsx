"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadAll } from "@/lib/banks";
import { embCount, embedQuery, loadEmbeddings, vecSearch } from "@/lib/vector";
import type { Question } from "@/lib/types";
import Icon from "./Icon";
import styles from "./SmartSearch.module.css";

const EXAMPLES = [
  "weaken an argument", "work & rate problems", "geometry — circles",
  "inference from a passage", "probability & combinations", "data sufficiency on averages",
];

/** A single, compact search field — results and quick-start examples appear
    as a dropdown overlay so the input never grows the page layout. */
export default function SmartSearch() {
  const router = useRouter();
  const [all, setAll] = useState<Question[]>([]);
  const [ai, setAi] = useState<"loading" | "on" | "off">("loading");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<{ q: Question; score: number }[] | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAll().then(async (qs) => {
      setAll(qs);
      const ok = await loadEmbeddings(qs);
      setAi(ok ? "on" : "off");
    });
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
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
      setStatus(`${res.length} result${res.length !== 1 ? "s" : ""}`);
    } catch {
      setStatus("Search unavailable — check your connection.");
    }
  };

  const onInput = (v: string) => {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v.trim()), 400);
  };

  const go = (id: string) => {
    setOpen(false);
    router.push(`/practice?ids=${id}`);
  };

  return (
    <div className={styles.box} ref={rootRef}>
      <div className={styles.inputWrap}>
        <span className={styles.searchIcon}><Icon name="target" size={15} /></span>
        <input
          className={styles.input}
          placeholder="Describe a question…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => onInput(e.target.value)}
          spellCheck={false}
        />
        <span className={`${styles.dot} ${styles[ai]}`} title={
          ai === "on" ? `AI search ready · ${embCount()} indexed` : ai === "loading" ? "Loading search index…" : "Search index unavailable"
        } />
      </div>

      {open && (
        <div className={styles.drop}>
          {!query && (
            <div className={styles.chips}>
              {EXAMPLES.map((x) => (
                <button key={x} type="button" onClick={() => { setQuery(x); search(x); }}>
                  {x}
                </button>
              ))}
            </div>
          )}
          {status && <div className={styles.status}>{status}</div>}
          {results && results.length > 0 && (
            <div className={styles.results}>
              {results.map(({ q, score }) => {
                const stem = q.question.split("\n\n").pop()!.slice(0, 110);
                return (
                  <button key={q.id} type="button" className={styles.item} onClick={() => go(q.id)}>
                    <span className={styles.meta}>
                      <b>{q.type}</b>
                      {q.difficulty && <i>{q.difficulty}</i>}
                      <i>{q.subtype ?? q.chapter}</i>
                      <em>{Math.round(score * 100)}%</em>
                    </span>
                    <span className={styles.stem}>{stem}…</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
