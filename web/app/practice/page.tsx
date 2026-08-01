"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "@/components/QuestionCard";
import TutorPanel from "@/components/TutorPanel";
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

/** How many answers the real GMAT Focus lets you change per section. */
const EDIT_LIMIT = 3;

interface Answer { picked: Letter; correct: boolean; timeMs: number; }

/** directions → section ⇄ review → complete → report */
type Stage = "directions" | "section" | "review" | "complete";

function Runner() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") ?? "practice"; // practice | exam | redo | daily | gmatfocus
  const exam = mode === "exam";
  const adaptive = mode === "gmatfocus"; // GMAT Focus: difficulty follows performance
  /* Exam-like sections run the real protocol: no feedback until the report,
     answers recorded at section end, up to three edits via Question Review. */
  const examLike = exam || adaptive;
  const limit = +(params.get("limit") ?? 0); // countdown seconds (0 = none)
  const timed = params.get("timed") === "1";
  const title = params.get("title") ?? "Practice";

  const [all, setAll] = useState<Question[]>([]);
  const [qs, setQs] = useState<Question[] | null>(null);
  const [allSeen, setAllSeen] = useState(false); // fresh practice ran dry because everything's been attempted
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Letter | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [confirming, setConfirming] = useState(false); // Next pressed, waiting on Confirm
  const [stage, setStage] = useState<Stage>(examLike || timed ? "directions" : "section");
  const [finished, setFinished] = useState(false); // report (outside the exam chrome)
  const [elapsed, setElapsed] = useState(0);
  const [clockOff, setClockOff] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editsLeft, setEditsLeft] = useState(EDIT_LIMIT);
  const [similar, setSimilar] = useState<{ q: Question; score: number }[]>([]);
  const [showExpl, setShowExpl] = useState(false);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  /* AI tutor drawer — holds the question it was opened for (the current one
     during a section, any question from the report afterwards) */
  const [tutorFor, setTutorFor] = useState<Question | null>(null);
  const qStart = useRef(Date.now());
  const dailyDone = useRef(false);
  const recorded = useRef(false);
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

  /* the section owns the screen: hide the site header + nav while it runs */
  const inExam = !finished && !!qs && qs.length > 0;
  useEffect(() => {
    if (!inExam) return;
    document.body.dataset.exam = "1";
    return () => { delete document.body.dataset.exam; };
  }, [inExam]);

  /* tutor open: the drawer takes a column of its own (globals.css --tutor-w),
     so the report — like the exam surface — narrows instead of being covered */
  useEffect(() => {
    if (!tutorFor) return;
    document.body.dataset.tutor = "1";
    return () => { delete document.body.dataset.tutor; };
  }, [tutorFor]);

  /* section clock — runs from "Begin Section" until the section ends */
  useEffect(() => {
    if (stage === "directions" || stage === "complete" || finished) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [stage, finished]);

  /* countdown: the section ends by itself when time runs out */
  useEffect(() => {
    if (limit && elapsed >= limit && (stage === "section" || stage === "review")) {
      setStage("complete");
    }
  }, [limit, elapsed, stage]);
  const remaining = limit ? Math.max(0, limit - elapsed) : elapsed;

  const q = qs?.[idx] ?? null;
  const prevAns = q ? answers[q.id] : undefined;
  const answered = !!prevAns;
  /* practice reveals the answer immediately; an exam section never does */
  const showFeedback = answered && !examLike;
  /* exam sections stay editable only while edits remain */
  const locked = examLike && answered && editsLeft <= 0;

  const total = adaptive ? (adaptiveRef.current?.target ?? 23) : (qs?.length ?? 0);
  const atLast = adaptive
    ? !!(adaptiveRef.current && adaptiveRef.current.servedIds.size >= adaptiveRef.current.target)
    : idx + 1 >= (qs?.length ?? 0);

  const sectionLabel = useMemo(() => {
    const types = new Set((qs ?? []).map((x) => x.type));
    if (!types.size) return title;
    const t = [...types];
    if (t.every((x) => x === "RC" || x === "CR")) return "Verbal Reasoning";
    if (t.every((x) => x === "PS" || x === "DS")) return "Quantitative Reasoning";
    return "Mixed Section";
  }, [qs, title]);

  /* moving to a question always restores whatever is already selected on it */
  const goTo = (i: number) => {
    if (!qs || i < 0 || i >= qs.length) return;
    setIdx(i);
    setPicked(answers[qs[i].id]?.picked ?? null);
    setConfirming(false);
    setSimilar([]);
    setStage("section");
    qStart.current = Date.now();
  };

  const endSection = () => setStage("complete");

  const advance = () => {
    if (!qs) return;
    setSimilar([]);
    setConfirming(false);
    setPicked(null);
    qStart.current = Date.now();
    /* adaptive: a new question is only served from the frontier — stepping
       forward through questions you went back to just walks the list */
    if (adaptiveRef.current && idx === qs.length - 1) {
      const nq = pickNext(adaptiveRef.current, lastCorrectRef.current);
      if (!nq) { endSection(); return; }
      setQs((p) => [...(p ?? []), nq]);
      setIdx((i) => i + 1);
      return;
    }
    if (idx + 1 < qs.length) {
      const nid = qs[idx + 1].id;
      setPicked(answers[nid]?.picked ?? null);
      setIdx(idx + 1);
    } else endSection();
  };

  /** Lock the selected choice in (the "Confirm" step). */
  const commit = () => {
    if (!q || !picked) return;
    const correct = picked === q.correct_answer;
    const timeMs = prevAns ? prevAns.timeMs : Date.now() - qStart.current;
    const isEdit = !!prevAns;
    setAnswers((a) => ({ ...a, [q.id]: { picked, correct, timeMs } }));
    setConfirming(false);
    if (isEdit && examLike) setEditsLeft((e) => Math.max(0, e - 1));

    if (examLike) {
      /* the adaptive engine only reacts to the frontier question */
      if (idx === (qs?.length ?? 1) - 1) lastCorrectRef.current = correct;
      /* attempts are written once, at section end, so edits don't double-count */
      advance();
      return;
    }

    Store.record(q, picked, correct, timeMs);
    void Attempts.save(q, picked, timeMs);
    void loadEmbeddings(all).then((ok) => {
      if (ok) setSimilar(vecSimilar(all, q.id, 3));
    });
  };

  /** The bottom-right button: Next → Confirm → (next question). */
  const primary = () => {
    if (!q) return;
    if (stage === "directions") { setStage("section"); qStart.current = Date.now(); return; }
    const changed = !!picked && (!prevAns || picked !== prevAns.picked);
    if (!changed) { advance(); return; }     // nothing new to lock in
    if (!confirming) { setConfirming(true); return; }
    commit();
  };

  const toggleFlag = () => {
    if (!q) return;
    setFlags((f) => {
      const n = new Set(f);
      if (n.has(q.id)) n.delete(q.id); else n.add(q.id);
      return n;
    });
  };

  const openSimilar = (sq: Question) => {
    if (!qs) return;
    const at = qs.findIndex((x) => x.id === sq.id);
    if (at >= 0) { goTo(at); return; }
    setQs([...qs, sq]); // append — never disturb answered indices
    setIdx(qs.length);
    setSimilar([]);
    setPicked(null);
    setConfirming(false);
    qStart.current = Date.now();
  };

  /* exam-like sections: write every attempt once, when the section ends */
  useEffect(() => {
    if (stage !== "complete" || !examLike || recorded.current || !qs) return;
    recorded.current = true;
    for (const x of qs) {
      const a = answers[x.id];
      if (!a) continue;
      Store.record(x, a.picked, a.correct, a.timeMs);
      void Attempts.save(x, a.picked, a.timeMs);
    }
  }, [stage, examLike, qs, answers]);

  /* daily mode: adapt level + streak exactly once when the session ends */
  useEffect(() => {
    if (stage !== "complete" || mode !== "daily" || dailyDone.current || !qs) return;
    const done = Object.values(answers);
    if (!done.length) return;
    dailyDone.current = true;
    finishDaily(Math.round((100 * done.filter((a) => a.correct).length) / done.length));
  }, [stage, mode, answers, qs]);

  /* keyboard: 1-5 pick · Enter Next/Confirm · B bookmark · R review · Esc close */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (finished || !q) return;
      /* never hijack typing (the tutor's composer) */
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.key === "Escape") { setHelpOpen(false); if (stage === "review") setStage("section"); return; }
      if (helpOpen) return;
      if (stage !== "section" && e.key !== "Enter") return;
      if (/^[1-5]$/.test(e.key) && !locked && !showFeedback) {
        const o = q.options[+e.key - 1];
        if (o) { setPicked(o.label); setConfirming(false); }
      } else if (e.key === "Enter") {
        if (stage === "directions") { setStage("section"); qStart.current = Date.now(); }
        else if (stage === "section" && (picked || answered)) primary();
      } else if (tutorFor) {
        return; // the tutor drawer owns the keyboard while it is open
      } else if (e.key.toLowerCase() === "b") toggleFlag();
      else if (e.key.toLowerCase() === "r") setStage((s) => (s === "review" ? "section" : "review"));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, picked, answered, locked, showFeedback, stage, helpOpen, finished, idx, qs, confirming, tutorFor]);

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

  /* ===== score report (back in the normal app theme) ===== */
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
                  <button type="button" className={styles.repAsk} onClick={() => setTutorFor(x)}>
                    ✦ Ask AI
                  </button>
                </div>
                {showExpl && x.explanation && (
                  <div className={styles.repExpl}>{x.explanation.slice(0, 600)}{x.explanation.length > 600 ? "…" : ""}</div>
                )}
              </div>
            );
          })}
        </div>
        {tutorFor && (
          <TutorPanel
            q={tutorFor}
            answered={!!answers[tutorFor.id]}
            picked={answers[tutorFor.id]?.picked}
            correct={answers[tutorFor.id]?.correct}
            onClose={() => setTutorFor(null)}
          />
        )}
      </main>
    );
  }

  /* ===== the test screen ===== */
  const answeredCount = qs.filter((x) => answers[x.id]).length;
  const changed = !!picked && (!prevAns || picked !== prevAns.picked);
  const primaryLabel =
    stage === "directions"
      ? "Begin Section"
      : confirming
        ? "Confirm"
        : changed || !answered
          ? "Next"
          : atLast
            ? "End Section"
            : "Next";

  return (
    <div className={`${styles.exam} ${tutorFor ? styles.withTutor : ""}`}>
      <header className={styles.hdr}>
        <span className={styles.hdrMark}>G</span>
        <span className={styles.sectionName}>{sectionLabel}</span>
        <div className={styles.hdrRight}>
          <div className={styles.clockBox}>
            <span className={styles.clockLabel}>{limit ? "Time Remaining" : "Time"}</span>
            {clockOff ? (
              <span className={`${styles.clock} ${styles.clockHidden}`}>--:--</span>
            ) : (
              <span className={`${styles.clock} ${limit && remaining <= 60 ? styles.clockLow : ""}`}>
                {mmss(remaining)}
              </span>
            )}
            <button type="button" className={styles.linkBtn} onClick={() => setClockOff((v) => !v)}>
              {clockOff ? "Show" : "Hide"}
            </button>
          </div>
          {stage !== "directions" && (
            <span className={styles.qcount}>
              Question {Math.min(idx + 1, total)} of {total}
            </span>
          )}
          {/* the tutor is a practice aid — it stays out of exam-mode sections,
              where it would defeat the simulation (it returns on the report) */}
          {!examLike && stage === "section" && q && (
            <button
              type="button"
              className={`${styles.askBtn} ${tutorFor ? styles.askOn : ""}`}
              onClick={() => setTutorFor(tutorFor ? null : q)}
            >
              ✦ Ask AI
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {/* ---- section directions ---- */}
        {stage === "directions" && (
          <div className={styles.sheet}>
            <div className={styles.sheetIn}>
              <div className={styles.sheetKick}>Section Directions</div>
              <h1>{sectionLabel}</h1>
              <div className={styles.factRow}>
                <div className={styles.fact}>
                  <b>{total}</b><span>Questions</span>
                </div>
                {limit > 0 && (
                  <div className={styles.fact}>
                    <b>{Math.round(limit / 60)}</b><span>Minutes</span>
                  </div>
                )}
                {examLike && (
                  <div className={styles.fact}>
                    <b>{EDIT_LIMIT}</b><span>Answer edits</span>
                  </div>
                )}
              </div>
              <div className={styles.rules}>
                <ul>
                  <li>Select an answer, click <b>Next</b>, then <b>Confirm</b> to lock it in. You cannot leave a question unanswered.</li>
                  <li><b>Bookmark</b> flags a question so you can find it again on the review screen.</li>
                  <li><b>Question Review &amp; Edit</b> lists every question in this section and lets you go back to one.
                    {examLike
                      ? ` You may change up to ${EDIT_LIMIT} confirmed answers.`
                      : " Confirmed answers stay as they are."}
                  </li>
                  <li>
                    {limit > 0
                      ? "The section ends when the timer reaches zero or when you finish the last question."
                      : "This section is untimed — the clock counts up so you can track your pace."}
                  </li>
                  {!examLike && <li>This is practice: the answer and explanation appear as soon as you confirm.</li>}
                </ul>
              </div>
              <p className={styles.revNote}>The timer starts when you click Begin Section.</p>
            </div>
          </div>
        )}

        {/* ---- the question ---- */}
        {stage === "section" && q && (
          <QuestionCard
            q={q}
            picked={picked}
            submitted={showFeedback}
            locked={locked}
            onPick={(l) => { setPicked(l); setConfirming(false); }}
          >
            {showFeedback && similar.length > 0 && (
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
          </QuestionCard>
        )}

        {/* ---- question review & edit ---- */}
        {stage === "review" && (
          <div className={styles.sheet}>
            <div className={styles.sheetIn}>
              <div className={styles.sheetKick}>Section Navigation</div>
              <h1>Question Review &amp; Edit</h1>
              <p className={styles.revNote}>
                {answeredCount} of {qs.length} answered
                {examLike ? ` · ${editsLeft} answer edit${editsLeft === 1 ? "" : "s"} remaining` : ""}
                {adaptive ? " · questions are served one at a time" : ""}
              </p>
              <table className={styles.revTable}>
                <thead>
                  <tr><th>Question</th><th>Status</th><th>Bookmark</th></tr>
                </thead>
                <tbody>
                  {qs.map((x, i) => (
                    <tr key={x.id}>
                      <td colSpan={3}>
                        <button
                          type="button"
                          className={`${styles.revRow} ${i === idx ? styles.revCurrent : ""}`}
                          onClick={() => goTo(i)}
                          aria-label={`Go to question ${i + 1} — ${answers[x.id] ? "answered" : "not answered"}${flags.has(x.id) ? ", bookmarked" : ""}`}
                        >
                          <span className={styles.revNum}>Question {i + 1}</span>
                          <span className={styles.revStatus}>
                            {answers[x.id] ? "Answered" : "Not answered"}
                            {i === idx ? " · current" : ""}
                          </span>
                          <span className={styles.revFlag}>{flags.has(x.id) ? "⚑" : ""}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.revActions}>
                <button type="button" className={styles.ftrBtn} onClick={() => setStage("section")}>
                  Return to Question {idx + 1}
                </button>
                <button type="button" className={styles.ftrBtn} onClick={endSection}>
                  End Section
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- section complete ---- */}
        {stage === "complete" && (
          <div className={styles.sheet}>
            <div className={styles.sheetIn}>
              <div className={styles.sheetKick}>Section Complete</div>
              <h1>You have completed this section.</h1>
              <div className={styles.factRow}>
                <div className={styles.fact}>
                  <b>{answeredCount}</b><span>Answered</span>
                </div>
                <div className={styles.fact}>
                  <b>{mmss(elapsed)}</b><span>Time used</span>
                </div>
                {flags.size > 0 && (
                  <div className={styles.fact}>
                    <b>{flags.size}</b><span>Bookmarked</span>
                  </div>
                )}
              </div>
              <p>Your answers are recorded. Continue to see the full report with explanations.</p>
            </div>
          </div>
        )}

        {helpOpen && (
          <div className={styles.helpBack} onClick={() => setHelpOpen(false)} role="presentation">
            <div className={styles.helpBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Help">
              <h2>Help</h2>
              <dl>
                <dt>1 – 5</dt><dd>Select an answer choice</dd>
                <dt>Enter</dt><dd>Next / Confirm</dd>
                <dt>B</dt><dd>Bookmark this question</dd>
                <dt>R</dt><dd>Question Review &amp; Edit</dd>
                <dt>Esc</dt><dd>Close this window</dd>
              </dl>
              <div className={styles.revActions}>
                <button type="button" className={styles.ftrBtn} onClick={() => setHelpOpen(false)}>Return to Section</button>
                <button type="button" className={styles.ftrBtn} onClick={() => { setHelpOpen(false); endSection(); }}>
                  End Section
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className={styles.ftr}>
        {stage === "section" && (
          <>
            <button
              type="button"
              className={`${styles.ftrBtn} ${q && flags.has(q.id) ? styles.bookmarkOn : ""}`}
              onClick={toggleFlag}
            >
              ⚑ {q && flags.has(q.id) ? "Bookmarked" : "Bookmark"}
            </button>
            <button type="button" className={styles.ftrBtn} onClick={() => setStage("review")}>
              Question Review
            </button>
          </>
        )}
        {stage === "review" && (
          <button type="button" className={styles.ftrBtn} onClick={() => setStage("section")}>
            ◀ Return to Section
          </button>
        )}
        <button type="button" className={styles.ftrBtn} onClick={() => setHelpOpen(true)}>
          Help
        </button>
        <span className={styles.ftrSpacer} />
        {confirming && <span className={styles.confirmHint}>Click Confirm to lock in your answer.</span>}
        {stage === "complete" ? (
          <button type="button" className={styles.primary} onClick={() => setFinished(true)}>
            See Report
          </button>
        ) : stage === "review" ? (
          <button type="button" className={styles.primary} onClick={() => setStage("section")}>
            Continue
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            disabled={stage === "section" && !picked && !answered}
            onClick={primary}
          >
            {primaryLabel}
          </button>
        )}
      </footer>

      {tutorFor && (
        <TutorPanel
          q={tutorFor}
          answered={!!answers[tutorFor.id]}
          picked={answers[tutorFor.id]?.picked}
          correct={answers[tutorFor.id]?.correct}
          onClose={() => setTutorFor(null)}
        />
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<main className="wrap">Loading…</main>}>
      <Runner />
    </Suspense>
  );
}
