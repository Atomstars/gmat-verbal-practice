/**
 * AI tutor client.
 *
 * Talks only to the Java backend. The provider key and question-aware system prompt
 * stay server-side; this client sends conversation turns plus an opaque session and
 * question identifier, then decodes the upstream-compatible SSE stream.
 */

import { supabase } from "./supabase";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

/** Where the proxy lives. Localhost runs it separately on 8787; production is same-origin. */
export function tutorEndpoint(): string {
  return `${API_BASE}/api/tutor`;
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

/** Light performance context for the standalone /tutor chat — not tied to any
    one question. Purely informational; the tutor should still ask rather than
    assume when it matters. */
export interface GeneralStats {
  seen: number;
  pct: number | null;
  weakest?: { type: string; concept: string; pct: number } | null;
}

/** System prompt for the standalone tutor chat (app/tutor) — general GMAT
    coaching with no single question in view. */
export function generalSystemPrompt(stats?: GeneralStats): string {
  const statLine =
    stats && stats.seen > 0
      ? `The student has attempted ${stats.seen} questions in this app so far${
          stats.pct !== null ? ` (${stats.pct}% correct overall)` : ""
        }${
          stats.weakest
            ? `. Their weakest tracked area is ${stats.weakest.type} · ${stats.weakest.concept} (${stats.weakest.pct}% there)`
            : ""
        }. Use this only if it's relevant to what they ask — don't lead with it uninvited.`
      : "No performance history yet for this student — don't assume anything about their level.";

  return [
    "You are a sharp, friendly GMAT tutor embedded in a practice app, chatting outside of any specific question — this is general coaching: concepts, strategy, pacing, what to study next, how the exam works.",
    "",
    statLine,
    "",
    "You are not looking at a specific question right now. If the student pastes one in or describes one, help directly — explain the concept, don't just tell them to go find one in the app. If they ask what to practice next, you may point them at the app's sections (Verbal: RC/CR, Quant: PS/DS, Tests) by name.",
    "Do not invent or claim to be quoting official GMAT questions verbatim; if you write a practice example, make clear it's illustrative, not a real exam item.",
    "",
    "Style: concise, plain English, no filler or flattery. Lead with the answer to what they asked. Use short paragraphs or a few bullets; under ~200 words unless they ask for more. Write any mathematics in inline LaTeX between single dollar signs, e.g. $x^2 + 3$. Stay on the GMAT — quant, verbal, data insights, strategy, or the exam itself.",
  ].join("\n");
}

/** Opening suggestions for the standalone tutor chat. */
export const generalQuickPrompts = (stats?: GeneralStats): string[] => [
  ...(stats?.weakest ? [`Help me improve at ${stats.weakest.concept}`] : ["What should I focus on first?"]),
  "Explain Data Sufficiency strategy",
  "How is the GMAT Focus Edition scored?",
  "How should I pace the Verbal section?",
];

/* ------------------------------------------------------------------ stream */

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onReasoning?: (text: string) => void;
  signal?: AbortSignal;
  think?: boolean;
  questionId?: string;
  sessionId?: string;
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
    const headers = new Headers({ "Content-Type": "application/json" });
    const client = supabase();
    if (client) {
      const { data } = await client.auth.getSession();
      if (data.session?.access_token) headers.set("authorization", `Bearer ${data.session.access_token}`);
    }
    res = await fetch(tutorEndpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: messages.filter((m) => m.role !== "system"), think: !!h.think,
        questionId: h.questionId, sessionId: h.sessionId }),
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
      if (typeof j?.error === "string") msg = j.detail ? `${j.error}: ${j.detail}` : j.error;
      else if (j?.error?.message) msg = j.error.message;
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
