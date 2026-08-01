"use client";

import { useEffect, useRef, useState } from "react";
import { Store } from "@/lib/store";
import {
  type ChatMsg,
  type GeneralStats,
  generalQuickPrompts,
  generalSystemPrompt,
  streamChat,
  tutorHealth,
} from "@/lib/tutor";
import RichText from "./RichText";
import styles from "./TutorChat.module.css";

/* Session-only, like the per-question drawer — the general chat isn't study
   data, so it isn't persisted past a reload. */
let thread: ChatMsg[] = [];

function readStats(): GeneralStats {
  const { seen, pct } = Store.overall();
  const top = Store.weakest()[0];
  return {
    seen,
    pct,
    weakest: top ? { type: top.type, concept: top.concept, pct: top.pct } : null,
  };
}

export default function TutorChat() {
  const [msgs, setMsgs] = useState<ChatMsg[]>(thread);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ note: string } | null>(null);
  const [stats, setStats] = useState<GeneralStats | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStats(readStats());
    let live = true;
    tutorHealth().then((h) => {
      if (!live) return;
      if (h.reachable && h.configured) setHealth(null);
      else if (!h.reachable)
        setHealth({ note: "Tutor server not running. Start it with: node scripts/tutor-proxy.mjs" });
      else setHealth({ note: "Server is up but NVIDIA_API_KEY is not set." });
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!streaming) { setWaited(0); return; }
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [streaming]);

  const run = async (next: ChatMsg[]) => {
    const wire: ChatMsg[] = [
      { role: "system", content: generalSystemPrompt(stats ?? undefined) },
      ...next,
    ];
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming(true);
    setThinking(deepThink);

    let acc = "";
    try {
      await streamChat(wire, {
        think: deepThink,
        signal: ctrl.signal,
        onReasoning: () => setThinking(true),
        onDelta: (d) => {
          acc += d;
          setThinking(false);
          thread = [...next, { role: "assistant", content: acc }];
          setMsgs(thread);
        },
      });
      thread = [...next, { role: "assistant", content: acc }];
      setMsgs(thread);
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        thread = acc ? [...next, { role: "assistant", content: acc }] : next;
        setMsgs(thread);
      } else {
        setError(err.message);
        thread = next;
      }
    } finally {
      setStreaming(false);
      setThinking(false);
      abort.current = null;
    }
  };

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || streaming) return;
    setError(null);
    setInput("");
    const next: ChatMsg[] = [...thread, { role: "user", content: body }];
    thread = next;
    setMsgs(next);
    await run(next);
  };

  const stop = () => abort.current?.abort();

  const retry = () => {
    if (streaming || !thread.length || thread[thread.length - 1].role !== "user") return;
    setError(null);
    void run(thread);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.body} ref={scroller}>
        {health && <div className={styles.warn}>{health.note}</div>}

        {msgs.length === 0 && (
          <div className={styles.intro}>
            <p>
              Ask about any GMAT concept, strategy, or how the exam works — no question
              needs to be open. Working through a specific one? Use the ✦ Ask AI button
              on the question screen instead; it can see the passage and choices.
            </p>
            <div className={styles.chips}>
              {generalQuickPrompts(stats ?? undefined).map((p) => (
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
          placeholder="Ask about the GMAT…"
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
    </div>
  );
}
