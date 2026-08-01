/**
 * AI tutor client.
 *
 * Talks to our own proxy (api/tutor.js on Vercel, scripts/tutor-proxy.mjs locally) —
 * never to NVIDIA directly: that endpoint sends no CORS headers, and the API key must
 * stay off the client. The proxy passes the upstream SSE stream through untouched, so
 * this file's job is to build the question-aware prompt and decode the stream.
 */

import type { Question } from "./types";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

const LS_ENDPOINT = "gmat_tutor_endpoint";

/** Where the proxy lives. Localhost runs it separately on 8787; production is same-origin. */
export function tutorEndpoint(): string {
  if (typeof window === "undefined") return "/api/tutor";
  const override = window.localStorage.getItem(LS_ENDPOINT);
  if (override) return override;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "http://localhost:8787/api/tutor";
  return "/api/tutor";
}

export interface TutorHealth {
  reachable: boolean;
  configured: boolean;
  model?: string;
  error?: string;
}

export async function tutorHealth(): Promise<TutorHealth> {
  try {
    const r = await fetch(tutorEndpoint(), { method: "GET", cache: "no-store" });
    if (!r.ok) return { reachable: false, configured: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { reachable: true, configured: !!j.configured, model: j.model };
  } catch (e) {
    return { reachable: false, configured: false, error: (e as Error).message };
  }
}

/* ------------------------------------------------------------------ prompt */

const letterList = (q: Question) =>
  q.options.map((o) => `(${o.label}) ${o.text}`).join("\n");

/**
 * The tutor is told everything about the question, including the official answer and
 * explanation — and told when it may use them. Before the student confirms an answer
 * it coaches without giving the answer away; afterwards it debriefs the miss. The
 * book's explanation is ground truth: the model may reword it, never overrule it.
 */
export function systemPrompt(
  q: Question,
  state: { answered: boolean; picked?: string | null; correct?: boolean },
): string {
  const meta = [
    `Type: ${q.type}`,
    q.difficulty ? `Difficulty: ${q.difficulty}` : null,
    q.subtype ? `Sub-type: ${q.subtype}` : q.chapter ? `Topic: ${q.chapter}` : null,
  ].filter(Boolean).join(" · ");

  const status = state.answered
    ? `The student has ANSWERED: they chose (${state.picked}), which is ${state.correct ? "CORRECT" : "WRONG"}.`
    : "The student has NOT answered yet.";

  const rules = state.answered
    ? `Because the answer is already locked in, be direct: say why (${q.correct_answer}) is right, and — if they missed it — exactly where the reasoning of (${state.picked}) breaks down and what the trap was. Finish with the one transferable takeaway for questions like this.`
    : `They have NOT answered yet, so DO NOT reveal the correct answer, do not say which choices are wrong, and do not narrow it to one option. Coach instead: clarify the question, unpack the passage/stem, teach the approach, ask what their current thinking is. If they ask outright for the answer, tell them to pick one and confirm it first — you will explain fully then.`;

  return [
    "You are a sharp, friendly GMAT tutor embedded in a practice app. The student is working on the question below.",
    "",
    `--- QUESTION (${meta}) ---`,
    q.passage ? `PASSAGE:\n${q.passage}\n` : "",
    `PROMPT:\n${q.question}`,
    "",
    `ANSWER CHOICES:\n${letterList(q)}`,
    "",
    `OFFICIAL ANSWER: ${q.correct_answer ?? "unknown"}`,
    q.explanation ? `OFFICIAL EXPLANATION (ground truth — never contradict it):\n${q.explanation}` : "",
    "--- END QUESTION ---",
    "",
    status,
    rules,
    "",
    "Style: concise, plain English, no filler or flattery. Lead with the answer to what they asked. Use short paragraphs or a few bullets; under ~180 words unless they ask for more. Write any mathematics in inline LaTeX between single dollar signs, e.g. $x^2 + 3$. Stay on this question and on GMAT strategy.",
  ].filter((s) => s !== "").join("\n");
}

/** Opening suggestions offered as one-tap prompts. */
export const quickPrompts = (answered: boolean): string[] =>
  answered
    ? [
        "Why is my answer wrong?",
        "Explain the correct answer simply",
        "What was the trap here?",
        "How do I spot this pattern next time?",
      ]
    : [
        "Give me a hint",
        "What is this question really asking?",
        "How should I approach this type?",
        "I'm stuck — where do I start?",
      ];

/* ------------------------------------------------------------------ stream */

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onReasoning?: (text: string) => void;
  signal?: AbortSignal;
  think?: boolean;
}

/** The upstream endpoint sometimes accepts a request and then goes quiet. Give up
    on silence rather than leaving the user staring at a spinner forever. */
const IDLE_TIMEOUT_MS = 40000;

export class TutorTimeout extends Error {
  constructor() {
    super("No response for 40s — the NVIDIA endpoint is congested. Try again.");
    this.name = "TutorTimeout";
  }
}

/**
 * POST the conversation and decode the SSE stream, calling back per token.
 * Resolves with the full assistant message; throws on transport/API errors.
 */
export async function streamChat(messages: ChatMsg[], h: StreamHandlers): Promise<string> {
  /* our own controller so a silent stream can be cut short; the caller's Stop
     button still aborts through it */
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  h.signal?.addEventListener("abort", onAbort);
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ping = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { idle = true; ctrl.abort(); }, IDLE_TIMEOUT_MS);
  };
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    h.signal?.removeEventListener("abort", onAbort);
  };

  ping();
  let res: Response;
  try {
    res = await fetch(tutorEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, think: !!h.think }),
      signal: ctrl.signal,
    });
  } catch (e) {
    cleanup();
    if (idle) throw new TutorTimeout();
    throw e;
  }

  if (!res.ok || !res.body) {
    cleanup();
    let msg = `Tutor request failed (HTTP ${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.detail ? `${j.error}: ${j.detail}` : j.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      cleanup();
      if (idle) throw new TutorTimeout();
      throw e;
    }
    const { value, done } = chunk;
    if (done) break;
    ping();
    buf += dec.decode(value, { stream: true });

    /* SSE frames are separated by a blank line */
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let j: {
          choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
          error?: string;
        };
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.error) { cleanup(); throw new Error(j.error); }
        const d = j.choices?.[0]?.delta;
        if (!d) continue;
        if (d.reasoning_content) h.onReasoning?.(d.reasoning_content);
        if (d.content) {
          full += d.content;
          h.onDelta(d.content);
        }
      }
    }
  }
  cleanup();
  /* a stream that closes without ever sending a token is a stall, not an answer */
  if (!full.trim()) throw new TutorTimeout();
  return full;
}
