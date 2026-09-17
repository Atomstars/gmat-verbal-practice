/** Shared question record — mirrors the pipeline schema (see docs/DESIGN.md §3.1). */

export type QType = "CR" | "RC" | "PS" | "DS";
export type Bank = "og" | "manhattan" | "quant";
export type Letter = "A" | "B" | "C" | "D" | "E";

export interface Option {
  label: Letter;
  text: string;
}

export interface Question {
  id: string;
  type: QType;
  chapter: string | null;
  title: string | null;
  question: string;
  passage: string | null;
  options: Option[];
  /** Populated only by the answer-submission API after grading. */
  correct_answer?: Letter | null;
  /** Populated only by the answer-submission API after grading. */
  explanation?: string | null;
  format: string;
  /** OG extras */
  subtype?: string;
  category?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  number?: number;
  source?: string;
  /** Quant extras */
  needs_review?: boolean;
  source_page?: number;
  diagram?: string | null;
  diagram_description?: string;
  /** Added client-side at load time */
  bank: Bank;
}

export interface AnswerResult {
  attemptId?: string;
  correct: boolean;
  correctAnswer: Letter;
  explanation: string | null;
}

export interface PracticeSession {
  sessionId: string;
  questions: Question[];
  total: number;
}

export const isQuantType = (t: QType) => t === "PS" || t === "DS";

/** Concept (subchapter) key: quant classifies by topic, verbal by subtype. */
export const conceptOf = (q: Question) =>
  isQuantType(q.type) ? q.chapter : (q.subtype ?? q.chapter);

export const TYPE_LABEL: Record<QType, string> = {
  RC: "Reading Comprehension",
  CR: "Critical Reasoning",
  PS: "Problem Solving",
  DS: "Data Sufficiency",
};
