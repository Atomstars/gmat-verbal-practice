/**
 * Local dev server for the AI tutor.
 *
 * On Vercel, api/tutor.js runs as a Serverless Function at /api/tutor. `next dev`
 * knows nothing about that folder (the app is a static export), so this wraps the
 * exact same handler in a tiny http server on :8787 with CORS for localhost — the
 * client points here automatically when it is running on localhost.
 *
 *   node scripts/tutor-proxy.mjs        # reads NVIDIA_API_KEY from .env.local or the env
 */

import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const PORT = +(process.env.TUTOR_PORT || 8787);

/* .env.local (gitignored) → process.env, so the key never lands in the repo */
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

const handler = createRequire(import.meta.url)(join(root, "api", "tutor.js"));

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 200_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const path = (req.url || "").split("?")[0];
  if (path !== "/api/tutor" && path !== "/") {
    res.statusCode = 404;
    return res.end("not found");
  }

  /* give the node response the two helpers Vercel's runtime adds */
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };

  try {
    if (req.method === "POST") {
      const raw = await readBody(req);
      req.body = raw ? JSON.parse(raw) : {};
    }
    await handler(req, res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e.message || e) });
    else res.end();
  }
});

server.listen(PORT, () => {
  const configured = !!process.env.NVIDIA_API_KEY;
  console.log(`tutor proxy: http://localhost:${PORT}/api/tutor`);
  console.log(
    configured
      ? `tutor proxy: key loaded, model ${process.env.NVIDIA_MODEL || handler.DEFAULT_MODEL}`
      : "tutor proxy: NO NVIDIA_API_KEY — set it in .env.local at the repo root",
  );
});
