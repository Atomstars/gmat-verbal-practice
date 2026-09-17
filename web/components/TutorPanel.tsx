"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/types";
import {
  type ChatMsg,
  quickPrompts,
  streamChat,
  tutorHealth,
} from "@/lib/tutor";
import RichText from "./RichText";
import styles from "./TutorPanel.module.css";

/* Conversations live for the browser session, keyed by question id, so closing the
   drawer or moving to another question and back keeps the thread. Deliberately not
   persisted: chat history is chatter, not study data. */
const threads = new Map<string, ChatMsg[]>();

interface Props {
  q: Question;
  answered: boolean;
  sessionId: string;
  onClose: () => void;
}

export default function TutorPanel({ q, answered, sessionId, onClose }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => threads.get(q.id) ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false); // model is in its reasoning phase
  const [deepThink, setDeepThink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; note: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /* swap the visible thread when the question changes */
  useEffect(() => {
    setMsgs(threads.get(q.id) ?? []);
    setError(null);
    abort.current?.abort();
    setStreaming(false);
  }, [q.id]);

  /* one health check per mount — tells the user *why* it isn't answering */
  useEffect(() => {
    let live = true;
    tutorHealth().then((h) => {
      if (!live) return;
      if (h.reachable && h.configured) setHealth(null);
      else if (!h.reachable)
        setHealth({ ok: false, note: "Java backend is not reachable. Start it with: mvn spring-boot:run" });
      else setHealth({ ok: false, note: "Server is up but NVIDIA_API_KEY is not set." });
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  /* live "waiting Ns" counter — a stalled endpoint should look stalled, not dead */
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!streaming) { setWaited(0); return; }
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [streaming]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || streaming) return;
    setError(null);
    setInput("");

    const history = threads.get(q.id) ?? [];
    const next: ChatMsg[] = [...history, { role: "user", content: body }];
    threads.set(q.id, next);
    setMsgs(next);
    await run(next);
  };

  /** Send the thread as it stands (used by send and by Retry after a stall). */
  const run = async (next: ChatMsg[]) => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming(true);
    setThinking(deepThink);

    let acc = "";
    try {
      await streamChat(next, {
        think: deepThink,
        questionId: q.id,
        sessionId,
        signal: ctrl.signal,
        onReasoning: () => setThinking(true),
        onDelta: (d) => {
          acc += d;
          setThinking(false);
          setMsgs([...next, { role: "assistant", content: acc }]);
        },
      });
      const done: ChatMsg[] = [...next, { role: "assistant", content: acc }];
      threads.set(q.id, done);
      setMsgs(done);
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        /* keep whatever streamed before the stop */
        const kept: ChatMsg[] = acc ? [...next, { role: "assistant", content: acc }] : next;
        threads.set(q.id, kept);
        setMsgs(kept);
      } else {
        setError(err.message);
        threads.set(q.id, next);
      }
    } finally {
      setStreaming(false);
      setThinking(false);
      abort.current = null;
    }
  };

  const stop = () => abort.current?.abort();

  /** Re-send the thread after a stall (the failed turn's question is still last). */
  const retry = () => {
    const t = threads.get(q.id) ?? [];
    if (streaming || !t.length || t[t.length - 1].role !== "user") return;
    setError(null);
    void run(t);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
    e.stopPropagation(); // the runner listens for 1-5 / B / R globally
  };

  return (
    <aside className={styles.panel} aria-label="AI tutor">
      <header className={styles.head}>
        <span className={styles.title}>AI Tutor</span>
        <span className={styles.sub}>
          {answered ? "answer revealed" : "hints only until you answer"}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close tutor">
          ✕
        </button>
      </header>

      <div className={styles.body} ref={scroller}>
        {health && <div className={styles.warn}>{health.note}</div>}

        {msgs.length === 0 && (
          <div className={styles.intro}>
            <p>
              Ask anything about this question — the tutor can see the passage, the choices
              and the official explanation after submission.
              {!answered && " Until you confirm an answer it will hint, not tell."}
            </p>
            <div className={styles.chips}>
              {quickPrompts(answered).map((p) => (
                <button key={p} type="button" className={styles.chip} onClick={() => void send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? styles.user : styles.bot}>
            {m.role === "user" ? m.content : <RichText text={m.content} />}
          </div>
        ))}

        {streaming && (
          <div className={styles.thinking}>
            {thinking ? "reasoning" : "thinking"}… {waited}s
            {waited >= 12 && " · the 550B model is slow when the endpoint is busy"}
          </div>
        )}
        {error && (
          <div className={styles.err}>
            {error}
            <button type="button" className={styles.retry} onClick={retry}>Retry</button>
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          rows={2}
          value={input}
          placeholder={answered ? "Why is (C) better than (B)?" : "Where should I start?"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <div className={styles.actions}>
          <label className={styles.think}>
            <input
              type="checkbox"
              checked={deepThink}
              onChange={(e) => setDeepThink(e.target.checked)}
            />
            Deep think
          </label>
          <span className={styles.spacer} />
          {streaming ? (
            <button type="button" className={styles.stop} onClick={stop}>Stop</button>
          ) : (
            <button
              type="button"
              className={styles.send}
              disabled={!input.trim()}
              onClick={() => void send(input)}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
