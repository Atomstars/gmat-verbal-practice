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
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={`${styles.pill} ${styles["t" + q.type]}`}>{q.type}</span>
        {q.difficulty && <span className={styles.pill}>{q.difficulty}</span>}
        {q.chapter && <span className={styles.chapter}>{q.chapter}</span>}
      </div>

      {q.passage && (
        <div className={styles.passage}>
          <MathParas text={q.passage} />
        </div>
      )}

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
            </button>
          );
        })}
      </div>

      {submitted && (
        <div className={styles.feedback}>
          <div
            className={
              picked === q.correct_answer ? styles.verdictCorrect : styles.verdictWrong
            }
          >
            {picked === q.correct_answer
              ? "Correct"
              : `Not quite — the answer is ${q.correct_answer}`}
          </div>
          {q.subtype && <span className={styles.pill}>{q.subtype}</span>}
          {q.explanation && (
            <div className={styles.explanation}>
              <MathParas text={q.explanation} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
