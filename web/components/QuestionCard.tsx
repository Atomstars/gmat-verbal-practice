"use client";

import type { Letter, Question } from "@/lib/types";
import MathText, { MathParas } from "./MathText";
import styles from "./QuestionCard.module.css";

interface Props {
  q: Question;
  picked: Letter | null;
  submitted: boolean;
  onPick: (label: Letter) => void;
}

export default function QuestionCard({ q, picked, submitted, onPick }: Props) {
  const questionPane = (
    <div className={styles.questionPane}>
      <div className={styles.qHead}>
        <span className={`${styles.tag} ${styles["t" + q.type]}`}>{q.type}</span>
        {q.difficulty && <span className={styles.tag}>{q.difficulty}</span>}
        {q.chapter && <span className={styles.tagMuted}>{q.chapter}</span>}
      </div>

      {q.diagram && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/${q.diagram}`} alt="Question diagram" className={styles.diagram} />
      )}

      <div className={styles.stem}>
        <MathParas text={q.question} />
      </div>

      <div className={styles.options} role="radiogroup" aria-label="Answer choices">
        {q.options.map((o) => {
          const isPicked = picked === o.label;
          const isCorrect = submitted && o.label === q.correct_answer;
          const isWrongPick = submitted && isPicked && o.label !== q.correct_answer;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={submitted}
              onClick={() => onPick(o.label)}
              className={[
                styles.opt,
                isPicked ? styles.optPicked : "",
                isCorrect ? styles.optCorrect : "",
                isWrongPick ? styles.optWrong : "",
              ].join(" ")}
            >
              <span className={styles.optLabel}>{o.label}</span>
              <span className={styles.optText}>
                <MathText text={o.text} />
              </span>
              {(isCorrect || isWrongPick) && (
                <span className={styles.optMark} aria-hidden="true">
                  {isCorrect ? "✓" : "✕"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {submitted && (
        <div className={styles.feedback}>
          <div className={picked === q.correct_answer ? styles.verdictOk : styles.verdictNo}>
            <span className={styles.verdictMark}>
              {picked === q.correct_answer ? "✓" : "✕"}
            </span>
            {picked === q.correct_answer
              ? "Correct"
              : `Incorrect — the correct answer is ${q.correct_answer}`}
          </div>
          {q.subtype && <span className={styles.tagMuted}>{q.subtype}</span>}
          {q.explanation && (
            <div className={styles.explanation}>
              <div className={styles.explanationLabel}>Explanation</div>
              <MathParas text={q.explanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!q.passage) {
    return <div className={styles.examShell}>{questionPane}</div>;
  }

  return (
    <div className={`${styles.examShell} ${styles.hasPassage}`}>
      <div className={styles.passagePane}>
        <div className={styles.paneLabel}>Reading Passage</div>
        <div className={styles.passage}>
          <MathParas text={q.passage} />
        </div>
      </div>
      {questionPane}
    </div>
  );
}
