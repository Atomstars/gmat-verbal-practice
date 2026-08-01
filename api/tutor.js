/**
 * AI tutor proxy.
 *
 * The browser cannot call NVIDIA's inference API directly: integrate.api.nvidia.com
 * answers CORS preflights with no Access-Control-Allow-Origin, so every fetch from a
 * page is blocked. This function is the only thing that talks to it — which also means
 * the API key stays on the server and is never shipped to the client.
 *
 * Deploy: Vercel picks up /api/*.js as a Serverless Function even though the project
 * builds a static export (vercel.json, framework: null). Set NVIDIA_API_KEY in the
 * project's Environment Variables.
 * Local dev: `node scripts/tutor-proxy.mjs` runs this same handler on :8787.
 *
 * POST /api/tutor  { messages: [{role, content}], think?: bool, model?: string }
 *   → text/event-stream, passed through verbatim from the upstream API
 * GET  /api/tutor   → { ok, configured, model } health check
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

/* The chat is a study aid on a personal app, not a general-purpose endpoint:
   keep requests small so an unattended deployment can't be turned into one. */
const MAX_MESSAGES = 40;
const MAX_CHARS = 60000;
const MAX_TOKENS = 1400;
const REASONING_BUDGET = 4096;
/** Upstream sometimes accepts a request and then never answers; don't wait forever. */
const CONNECT_TIMEOUT_MS = 45000;

module.exports = async function handler(req, res) {
  const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, configured: !!process.env.NVIDIA_API_KEY, model });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "NVIDIA_API_KEY is not set. Add it to .env.local (local) or the Vercel project's environment variables.",
    });
  }

  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: "Body is not valid JSON" });
  }
  const messages = body && body.messages;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages[] required" });
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(413).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
  }
  const chars = messages.reduce((n, m) => n + String((m && m.content) || "").length, 0);
  if (chars > MAX_CHARS) {
    return res.status(413).json({ error: `Conversation too long (max ${MAX_CHARS} characters)` });
  }

  const think = body.think === true;
  const payload = {
    model: body.model || model,
    messages: messages.map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    temperature: think ? 1 : 0.4,
    top_p: 0.95,
    max_tokens: MAX_TOKENS,
    stream: true,
    chat_template_kwargs: { enable_thinking: think },
  };
  if (think) payload.reasoning_budget = REASONING_BUDGET;

  let upstream;
  try {
    upstream = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
      /* the endpoint occasionally queues a request and never answers — fail
         fast instead of holding the connection open forever */
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e.name === "TimeoutError" || e.name === "AbortError";
    return res.status(504).json({
      error: timedOut
        ? "The model did not respond in time (the NVIDIA endpoint is busy). Try again."
        : `Upstream request failed: ${e.message}`,
    });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return res.status(upstream.status || 502).json({
      error: `Upstream error ${upstream.status}`,
      detail: detail.slice(0, 600),
    });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: String(e.message || e) })}\n\n`);
  }
  res.end();
};

module.exports.DEFAULT_MODEL = DEFAULT_MODEL;
