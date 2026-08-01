"use client";

import type { Letter, Question } from "@/lib/types";
import MathText, { MathParas } from "./MathText";
import styles from "./QuestionCard.module.css";

interface Props {
  q: Question;
  picked: Letter | null;
  /** answer locked AND feedback visible (practice modes only — never in exam) */
  submitted: boolean;
  /** answer locked with no feedback (exam mode, out of edits) */
  locked?: boolean;
  onPick: (label: Letter) => void;
  /** rendered at the foot of the question pane (practice-mode extras) */
  children?: React.ReactNode;
}

/**
 * The question surface as the real test delivers it: no metadata, no letters,
 * no cards — a stem and a column of radio buttons, with reading passages in a
 * left-hand pane that scrolls independently of the question. Everything that
 * would tip off the answer (choice letters, sub-type, explanation) appears only
 * after the answer is confirmed, and only in practice modes.
 */
export default function QuestionCard({ q, picked, submitted, locked, onPick, children }: Props) {
  const disabled = submitted || !!locked;

  const questionPane = (
    <div className={styles.questionPane}>
      <div className={styles.questionIn}>
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
                aria-label={`Choice ${o.label}`}
                disabled={disabled}
                onClick={() => onPick(o.label)}
                className={[
                  styles.opt,
                  isPicked ? styles.optPicked : "",
                  isCorrect ? styles.optCorrect : "",
                  isWrongPick ? styles.optWrong : "",
                ].join(" ")}
              >
                <span className={styles.radio} aria-hidden="true">
                  <span className={styles.dot} />
                </span>
                {submitted && <span className={styles.letter}>{o.label}</span>}
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
            <div className={styles.metaRow}>
              <span className={styles.tag}>{q.type}</span>
              {q.difficulty && <span className={styles.tag}>{q.difficulty}</span>}
              {(q.subtype ?? q.chapter) && (
                <span className={styles.tagMuted}>{q.subtype ?? q.chapter}</span>
              )}
            </div>
            {q.explanation && (
              <div className={styles.explanation}>
                <div className={styles.explanationLabel}>Explanation</div>
                <MathParas text={q.explanation} />
              </div>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );

  if (!q.passage) return <div className={styles.shell}>{questionPane}</div>;

  return (
    <div className={`${styles.shell} ${styles.hasPassage}`}>
      <div className={styles.passagePane}>
        <div className={styles.passageIn}>
          <MathParas text={q.passage} />
        </div>
      </div>
      {questionPane}
    </div>
  );
}
