# AI tutor — per-question chat

An **✦ Ask AI** button sits at the top of the test screen during practice sessions and
next to every question on the score report. It opens a chat drawer that already knows
the question: passage, stem, all five choices, the official answer, the book's
explanation, and whether you've answered yet.

Added 2026-07-31. Model: `nvidia/nemotron-3-ultra-550b-a55b` (build.nvidia.com).

## The one architectural constraint

`integrate.api.nvidia.com` answers CORS preflights **without**
`Access-Control-Allow-Origin`, so a browser can never call it directly — verified, not
assumed. Everything therefore goes through our own proxy, which also keeps the API key
off the client:

```
browser ──POST /api/tutor──► api/tutor.js ──► integrate.api.nvidia.com
        ◄──── SSE stream ────┘  (NVIDIA_API_KEY, server-side only)
```

| Piece | Role |
|---|---|
| `api/tutor.js` | The proxy. Vercel builds `/api/*.js` as a Serverless Function even though the site is a static export (`vercel.json`, `framework: null`). Streams the upstream SSE through verbatim. `GET` returns a health check. |
| `scripts/tutor-proxy.mjs` | Runs that same handler on `:8787` for local dev, since `next dev` doesn't serve `api/`. Reads `.env.local`. |
| `web/lib/tutor.ts` | Endpoint resolution, SSE decoding, and the system prompt. |
| `web/components/TutorPanel.tsx` | The drawer: quick prompts, streaming replies, light markdown + KaTeX, per-question thread, Stop, Deep-think toggle. |

## Setup

**Local**

```bash
cp .env.example .env.local     # then put the real key in NVIDIA_API_KEY
node scripts/tutor-proxy.mjs   # :8787 — leave it running beside `npm run dev --prefix web`
```

The client auto-targets `http://localhost:8787/api/tutor` on localhost and `/api/tutor`
everywhere else (override with the `gmat_tutor_endpoint` localStorage key).
Settings → **AI tutor** shows Connected / no key / not reachable.

**Vercel** — add `NVIDIA_API_KEY` (and optionally `NVIDIA_MODEL`) in Project Settings →
Environment Variables, then redeploy. Nothing else changes: the app is still a static
export. If `/api/tutor` 404s after a deploy, check the Functions tab picked up `api/`.

## Teaching rules (in `systemPrompt`)

- **Before you confirm an answer** the tutor must not reveal the answer, eliminate
  choices down to one, or confirm a guess. It hints, reframes the question, teaches the
  approach, and asks what you're thinking. Ask it point-blank and it tells you to commit
  to an answer first.
- **After you confirm**, it explains why the right answer is right, where *your* choice
  breaks down, what the trap was, and the transferable takeaway.
- The book's explanation is **ground truth** — the model may reword it, never overrule it.
- Concise by instruction (~180 words), math in `$…$` so KaTeX renders it.

## Behaviour notes

- **Not available during exam-mode sections** (`mode=exam`, `mode=gmatfocus`) — it would
  defeat the simulation. It comes back on the report, per question, which is where an
  exam debrief belongs.
- **Deep think** toggle turns on the model's reasoning phase (`enable_thinking`,
  4k reasoning budget). Better on hard quant, noticeably slower; off by default.
- Threads live in memory, keyed by question id — closing the drawer or moving away and
  back keeps the conversation; a reload clears it. Chat is not study data.
- Streaming is token-by-token; first token typically lands in a few seconds, a full
  answer in ~10–20s (550B model).
- **The NVIDIA endpoint stalls intermittently.** Observed 2026-07-31: requests that
  normally answer in <1s went completely silent for ~2 minutes (reproduced with plain
  `curl`, so it is upstream, not us), then recovered. Handling: the proxy gives up on
  the connection after 45s (`CONNECT_TIMEOUT_MS`), the client aborts after 40s of
  silence (`IDLE_TIMEOUT_MS`) or on a stream that closes with zero tokens, and the panel
  shows the elapsed wait plus a **Retry** button instead of spinning forever.
  If it stalls repeatedly, `nvidia/nemotron-3-super-120b-a12b` or
  `nvidia/nemotron-3-nano-30b-a3b` are much lighter — set `NVIDIA_MODEL` to swap.

## Caveat worth knowing

The deployed `/api/tutor` is **unauthenticated** — anyone who finds the URL can spend
your NVIDIA quota. It is capped (40 messages, 60k characters, 1400 output tokens per
request), which limits abuse but doesn't prevent it. If that matters, put the deployment
behind Vercel's Deployment Protection or add a shared-secret header.
