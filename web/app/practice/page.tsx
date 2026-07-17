"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import QuestionCard from "@/components/QuestionCard";
import { type AdaptiveState, pickNext, startAdaptive } from "@/lib/adaptive";
import { loadAll, playable } from "@/lib/banks";
import { finishDaily, pickDaily } from "@/lib/daily";
import { bookOrder, takeBook } from "@/lib/order";
import { Store } from "@/lib/store";
import { Attempts } from "@/lib/sync";
import { conceptOf, type Letter, type QType, type Question } from "@/lib/types";
import { loadEmbeddings, vecSimilar } from "@/lib/vector";
import styles from "./practice.module.css";

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

const mmss = (s: number) => {
  s = Math.max(0, s | 0);
  return `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

interface Answer { picked: Letter; correct: boolean; timeMs: number; }

function Runner() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") ?? "practice"; // practice | exam | redo | daily | gmatfocus
  const exam = mode === "exam";
  const adaptive = mode === "gmatfocus"; // GMAT Focus: difficulty follows performance
  const limit = +(params.get("limit") ?? 0); // countdown seconds (0 = none)
  const title = params.get("title") ?? "Practice";

  const [all, setAll] = useState<Question[]>([]);
  const [qs, setQs] = useState<Question[] | null>(null);
  const [allSeen, setAllSeen] = useState(false); // fresh practice ran dry because everything's been attempted
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Letter | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitted, setSubmitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [similar, setSimilar] = useState<{ q: Question; score: number }[]>([]);
  const [showExpl, setShowExpl] = useState(false);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const qStart = useRef(Date.now());
  const dailyDone = useRef(false);
  const adaptiveRef = useRef<AdaptiveState | null>(null);
  const lastCorrectRef = useRef(false);

  /* build the session pool once */
  useEffect(() => {
    loadAll().then((data) => {
      setAll(data);
      setAllSeen(false); // recomputed below when a fresh session runs dry

      const ids = params.get("ids");
      /* A question is shown ONCE, ever: every mode drops questions you've
         already attempted. The only exceptions are the flows whose whole
         purpose is to resurface seen questions — Review (redo) and an
         explicit id-set (Retry from History / "redo the ones I missed"). */
      const resurface = mode === "redo" || !!ids;
      const seen = new Set(Store.seenIds());
      const fresh = resurface ? data : data.filter((q) => !seen.has(q.id));

      /* GMAT Focus: questions are chosen adaptively, one at a time */
      if (adaptive) {
        const t = params.get("types")?.split(",") as QType[] | undefined;
        const started = startAdaptive(fresh, +(params.get("n") ?? 23), t?.length ? t : undefined);
        adaptiveRef.current = started?.state ?? null;
        setQs(started ? [started.first] : []);
        setAllSeen(!started);
        qStart.current = Date.now();
        return;
      }

      if (mode === "daily") {
        const dq = pickDaily(fresh); // one unseen passage at your adaptive level
        setQs(dq);
        setAllSeen(dq.length === 0);
        qStart.current = Date.now();
        return;
      }

      let pool = fresh.filter(playable);
      if (ids) {
        const want = new Set(ids.split(","));
        pool = pool.filter((q) => want.has(q.id));
      } else {
        if (mode === "redo") {
          const wrong = new Set(Store.wrongIds());
          pool = pool.filter((q) => wrong.has(q.id));
        }
        const types = (params.get("types")?.split(",") ?? []) as QType[];
        if (types.length) pool = pool.filter((q) => types.includes(q.type));
      }
      const topic = params.get("topic");
      if (topic) pool = pool.filter((q) => conceptOf(q) === topic);
      const diff = params.get("diff");
      if (diff) pool = pool.filter((q) => q.difficulty === diff);

      /* Ran dry because everything matching is already done (vs. no match at
         all)? Compare against the same filters over the full bank. */
      if (!resurface && pool.length === 0) {
        const types = (params.get("types")?.split(",") ?? []) as QType[];
        const matched = data.filter(
          (q) =>
            playable(q) &&
            (!types.length || types.includes(q.type)) &&
            (!topic || conceptOf(q) === topic) &&
            (!diff || q.difficulty === diff),
        ).length;
        setAllSeen(matched > 0);
      }

      /* Always book order (RC passages kept as units), unless this is an
         explicitly randomized entry (Random Mix / Exam simulation). */
      if (params.get("order") === "shuffle" || exam) {
        pool = shuffle(pool);
        const n = +(params.get("n") ?? pool.length);
        pool = pool.slice(0, n);
      } else if (ids || mode === "redo") {
        pool = bookOrder(pool);
      } else {
        pool = takeBook(pool, +(params.get("n") ?? pool.length));
      }

      setQs(pool);
      qStart.current = Date.now();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /* session clock */
  const timed = params.get("timed") === "1";
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [finished]);

  /* countdown: auto-finish when the time limit is reached */
  useEffect(() => {
    if (limit && !finished && elapsed >= limit) setFinished(true);
  }, [limit, elapsed, finished]);
  const remaining = limit ? Math.max(0, limit - elapsed) : elapsed;

  const q = qs?.[idx] ?? null;
  /* reviewing an already-answered question (◀ nav): show its saved state */
  const prevAns = q ? answers[q.id] : undefined;
  const effSubmitted = submitted || !!prevAns;
  const effPicked = prevAns ? prevAns.picked : picked;

  const prev = () => {
    if (idx === 0 || adaptive) return; // no going back in adaptive mode (like the real exam)
    setSimilar([]); setPicked(null); setSubmitted(false);
    setIdx(idx - 1);
  };

  const submit = () => {
    if (!q || !picked || effSubmitted) return;
    const correct = picked === q.correct_answer;
    lastCorrectRef.current = correct;
    const timeMs = Date.now() - qStart.current;
    setAnswers((a) => ({ ...a, [q.id]: { picked, correct, timeMs } }));
    setSubmitted(true);
    Store.record(q, picked, correct, timeMs);
    void Attempts.save(q, picked, timeMs);
    if (!exam && !adaptive) {
      void loadEmbeddings(all).then((ok) => {
        if (ok) setSimilar(vecSimilar(all, q.id, 3));
      });
    }
    if (exam) next(true); // exam: no feedback, advance immediately
  };

  const next = (fromExam = false) => {
    if (!qs) return;
    setSimilar([]);
    setPicked(null);
    setSubmitted(false);
    qStart.current = Date.now();
    if (adaptiveRef.current) {
      const nq = pickNext(adaptiveRef.current, lastCorrectRef.current);
      if (!nq) { setFinished(true); return; }
      setQs((prevQs) => [...(prevQs ?? []), nq]);
      setIdx((i) => i + 1);
      return;
    }
    if (idx + 1 < qs.length) setIdx(idx + 1);
    else setFinished(true);
    if (fromExam) return;
  };

  const openSimilar = (sq: Question) => {
    if (!qs) return;
    const at = qs.findIndex((x) => x.id === sq.id);
    if (at >= 0) { setIdx(at); return; }
    setQs([...qs, sq]); // append — never disturb answered indices
    setIdx(qs.length);
    setSimilar([]);
    setPicked(null);
    setSubmitted(false);
    qStart.current = Date.now();
  };

  /* daily mode: adapt level + streak exactly once when the session ends */
  useEffect(() => {
    if (!finished || mode !== "daily" || dailyDone.current || !qs) return;
    const done = Object.values(answers);
    if (!done.length) return;
    dailyDone.current = true;
    finishDaily(Math.round((100 * done.filter((a) => a.correct).length) / done.length));
  }, [finished, mode, answers, qs]);

  /* keyboard: 1-5 pick · Enter submit/next · ← previous · F flag */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!q || finished) return;
      if (/^[1-5]$/.test(e.key) && !effSubmitted) {
        const o = q.options[+e.key - 1];
        if (o) setPicked(o.label);
      } else if (e.key === "Enter") {
        if (!effSubmitted && picked) submit();
        else if (effSubmitted && !exam) next();
      } else if (e.key === "ArrowLeft") prev();
      else if (e.key.toLowerCase() === "f")
        setFlags((f) => {
          const n = new Set(f);
          if (n.has(q.id)) n.delete(q.id); else n.add(q.id);
          return n;
        });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, picked, effSubmitted, finished, idx, qs]);

  if (!qs) return <main className="wrap">Loading questions…</main>;
  if (!qs.length) {
    const typeParam = params.get("types");
    const reviewHref = `/setup?mode=redo${typeParam ? `&types=${typeParam}` : ""}&title=${encodeURIComponent("Review · Mistakes")}`;
    const historyHref = `/history${typeParam ? `?types=${typeParam}` : ""}`;
    return (
      <main className="wrap">
        <div className={styles.report}>
          <h1>{allSeen ? "You've practiced every question here" : "No questions here yet"}</h1>
          <p>
            {allSeen
              ? "Nice work — you've attempted all of these. Review the ones you missed, or look back over your history."
              : mode === "redo"
                ? "Missed questions land in Redo."
                : "Try different filters."}
          </p>
          <div className={styles.repActions}>
            {allSeen && <Link href={reviewHref} className={styles.homeBtn}>Review mistakes</Link>}
            {allSeen && <Link href={historyHref} className={styles.homeBtn}>See history</Link>}
            <Link href="/" className={styles.homeBtn}>Back to home</Link>
          </div>
        </div>
      </main>
    );
  }

  /* ===== report ===== */
  if (finished) {
    const done = Object.values(answers);
    const right = done.filter((a) => a.correct).length;
    const pct = done.length ? Math.round((100 * right) / done.length) : 0;
    const avg = done.length ? Math.round(done.reduce((s, a) => s + a.timeMs, 0) / done.length / 1000) : 0;
    const missedIds = qs.filter((x) => answers[x.id] && !answers[x.id].correct).map((x) => x.id);
    return (
      <main className="wrap">
        <div className={styles.report}>
          <div className={styles.kick}>{title} · report</div>
          <h1>{right} / {done.length} correct ({pct}%)</h1>
          <p>Total {mmss(elapsed)} · avg {avg}s per question</p>
          <div className={styles.repActions}>
            <button type="button" onClick={() => setShowExpl((v) => !v)}>
              {showExpl ? "Hide explanations" : "Show all explanations"}
            </button>
            {missedIds.length > 0 && (
              <button type="button" onClick={() => router.push(`/practice?ids=${missedIds.join(",")}&title=Redo`)}>
                Redo the ones I missed ({missedIds.length})
              </button>
            )}
            <Link href="/" className={styles.homeBtn}>Back to home</Link>
          </div>
        </div>
        <div className={styles.repList}>
          {qs.filter((x) => answers[x.id]).map((x, i) => {
            const a = answers[x.id];
            return (
              <div key={x.id} className={styles.repItem}>
                <div className={styles.repHead}>
                  <span className={a.correct ? styles.ok : styles.bad}>{a.correct ? "✓" : "✕"}</span>
                  <b>Q{i + 1}</b>
                  {flags.has(x.id) && <span className={styles.flagOn}>⚑</span>}
                  <span className={styles.repMeta}>{x.type} · {x.subtype ?? x.chapter}</span>
                  <span className={styles.repTime}>⏱ {Math.round(a.timeMs / 1000)}s</span>
                </div>
                <div className={styles.repStem}>{x.question.split("\n\n").pop()!.slice(0, 140)}…</div>
                {x.passage && (
                  <details className={styles.repPassage}>
                    <summary>📖 Reading passage</summary>
                    <div>{x.passage}</div>
                  </details>
                )}
                <div className={styles.repAns}>
                  You: <b>{a.picked}</b>{!a.correct && <> · Correct: <b>{x.correct_answer}</b></>}
                </div>
                {showExpl && x.explanation && (
                  <div className={styles.repExpl}>{x.explanation.slice(0, 600)}{x.explanation.length > 600 ? "…" : ""}</div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  /* ===== runner (exam-style: dark top strip + fixed bottom nav) ===== */
  const atLast = adaptive
    ? !!(adaptiveRef.current && adaptiveRef.current.servedIds.size >= adaptiveRef.current.target)
    : idx + 1 >= qs.length;

  return (
    <>
      <div className={styles.examBar}>
        <div className={styles.examBarIn}>
          <div className={styles.examBarLeft}>
            <span className={styles.examSection}>
              {exam ? "Exam Simulation" : adaptive ? "GMAT Focus" : title}
            </span>
            <span className={styles.examQnum}>
              Question {idx + 1} of {adaptive ? adaptiveRef.current?.target ?? 23 : qs.length}
            </span>
          </div>
          <div className={styles.examBarRight}>
            {(timed || exam) && (
              <span className={`${styles.examClock} ${limit && remaining <= 60 ? styles.low : ""}`}>
                {mmss(remaining)}
              </span>
            )}
            {q && (
              <button
                type="button"
                className={`${styles.markBtn} ${flags.has(q.id) ? styles.markOn : ""}`}
                onClick={() =>
                  setFlags((f) => {
                    const n = new Set(f);
                    if (n.has(q.id)) n.delete(q.id); else n.add(q.id);
                    return n;
                  })
                }
                title="Mark for Review (F)"
              >
                ⚑ Mark for Review
              </button>
            )}
            <button type="button" className={styles.endBtn} onClick={() => setFinished(true)}>
              End
            </button>
          </div>
        </div>
      </div>

      <main className={`wrap ${styles.runnerMain}`}>
        {q && (
          <QuestionCard q={q} picked={effPicked} submitted={effSubmitted && !exam} onPick={setPicked} />
        )}

        {!exam && submitted && similar.length > 0 && (
          <div className={styles.simPanel}>
            <div className={styles.simHead}>Similar questions <em>✦ AI-matched</em></div>
            {similar.map(({ q: sq, score }) => (
              <button key={sq.id} type="button" className={styles.simItem} onClick={() => openSimilar(sq)}>
                <span className={styles.meta}>
                  <b>{sq.type}</b>{sq.difficulty && <i>{sq.difficulty}</i>}<i>{sq.subtype ?? sq.chapter}</i>
                  <em>{Math.round(score * 100)}%</em>
                </span>
                <span className={styles.simStem}>{sq.question.split("\n\n").pop()!.slice(0, 110)}…</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <div className={styles.navBar}>
        <div className={styles.navBarIn}>
          {!adaptive && idx > 0 && (
            <button type="button" className={styles.backBtn} onClick={prev}>
              ◀ Back
            </button>
          )}
          <span className={styles.navSpacer} />
          {!effSubmitted || exam ? (
            <button className={styles.confirmBtn} disabled={!picked} onClick={submit}>
              {exam && atLast ? "Finish" : "Confirm Answer"}
            </button>
          ) : (
            <button className={styles.confirmBtn} onClick={() => next()}>
              {atLast ? "Finish" : "Next →"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <Runner />
    </Suspense>
  );
}
