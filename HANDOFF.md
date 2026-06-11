# HANDOFF — start here

Fast catch-up for a new session. Read this first, then [CLAUDE.md](CLAUDE.md) for the
deep parser/app reference, [TECH_STACK.md](TECH_STACK.md) for the stack, and
[PROJECT_LOG.md](PROJECT_LOG.md) for how we got here.

## What this project is
A **personal, fair-use** GMAT **Verbal** (Reading Comprehension + Critical Reasoning)
trainer. A Python parser extracts real, answer-verified questions from GMAT prep books
into JSON; a single-file web app (`index.html`) is the study UI over that data.
**Non-negotiable rule: never invent or alter a question/answer — leave anything
unconfirmable as `null`.** Correctness beats volume.

## Current state (works today)
- **Data shipped:**
  - `questions-og.json` — **346** questions from the *GMAT Official Guide 2024-2025*
    (Focus Edition). Every answer verified (key + explanation agree, 346/346, 0 conflicts).
    Each carries `subtype`, `category`, `difficulty`, `number`.
  - `questions.json` — 64 from Manhattan *All the Verbal* (CR+RC).
  - **Formatting (added 2026-06-11):** RC passages and explanations now keep their
    **paragraph breaks** (`\n\n`). The parser had been flattening every newline to a
    space (walls of text); see PROJECT_LOG / CLAUDE.md "paragraph-aware" notes. No
    answer changed — pure formatting (passages 130/164 OG multi-para; the rest are
    genuinely single-paragraph in the book).
- **App:** `index.html` — "GMAT Verbal Trainer", a multi-screen SPA (landing →
  dashboard → setup → runner → report). Modes: Daily RC (adaptive + streak), GMAT RC
  column (adaptive), Practice (type/concept/difficulty filters), Exam sim (timed),
  Redo-my-misses, Target-weak-spots. Weakness analytics by sub-type/difficulty.
  Progress saved in **localStorage** (`gmat_verbal_v1`).
  - **Report screen (added 2026-06-11):** each question item shows a per-question
    **⏱ time pill**, the report has an **Avg/question** card + total session time, and
    every RC item has a collapsible **📖 Reading passage** toggle. (Per-question timing
    was already tracked in `App.qTimes`; if it looks missing on Vercel, the deploy is
    just behind `master`.)
- **Repo:** `github.com/Atomstars/gmat-verbal-practice` (**private**).
- **Deploy:** Vercel project **gmat-prep** → **https://gmat-prep-ivory.vercel.app**
  (GitHub-connected, so pushes to `master` auto-deploy).

## How to run locally
```bash
python -m http.server 8000      # a server is REQUIRED (app fetch()es the JSON)
# open http://localhost:8000
```
Re-generate OG data (needs the source PDF, which lives outside the repo):
```bash
pip install pdfplumber beautifulsoup4 lxml pymupdf
python parser.py --og "<path-to>/gmat-official-guide-2024-2025...pdf"
```

## Open items / next steps
1. **Make the Vercel deployment public (pending USER action).** It currently returns
   HTTP 401 — Vercel auto-enabled Deployment Protection. To finish: dashboard →
   *gmat-prep* → Settings → **Deployment Protection** → set **Vercel Authentication**
   to **Disabled** → Save. (No CLI/API path worked — the CLI token isn't valid for the
   REST API.) The user explicitly chose **public** despite the copyright caveat.
2. **Supabase cross-device sync (requested, not built).** The `Store` object in
   `index.html` is written as a swappable backend on purpose. To add sync: user creates
   a free Supabase project and provides **Project URL + anon key**; then add a table and
   a `SupabaseStore` with the same API as the localStorage one. This also unlocks a
   real **login page** (the user asked for one — only meaningful with a backend/account).
3. **CR sub-type precision (~88%).** 21/182 CR questions are honestly left
   `"Unclassified"`; the `_OG_CR_RULES` keyword classifier in `parser.py` can be tuned
   if desired (RC is 164/164 from the book and needs no tuning).

## Gotchas / lessons (don't re-learn these the hard way)
- **OG PDF must be parsed with PyMuPDF (`fitz`), not pdfplumber** — pdfplumber drops
  this file's ligatures and smart quotes. See CLAUDE.md.
- **The preview screenshot tool is flaky in this environment** (often times out / returns
  a stale paint). Verify UI by scripting the live app with `preview_eval` (read `App`/DOM
  state) — that's authoritative even when a screenshot looks wrong.
- **Browser caches the JSON.** The app `fetch`es `questions-og.json`/`questions.json`;
  after regenerating data, a normal reload may serve the *old* cached file. The fetch now
  uses `{cache:"no-cache"}`, but if you ever see stale data do a hard refresh (Ctrl+Shift+R).
- **The preview server serves whichever worktree it was started in** — if you edit in a
  worktree, restart the `gmat-app` preview so it serves *your* files, not another worktree's.
- **CSS specificity bug we already hit:** an `#id { display:flex }` rule beats
  `.screen { display:none }`, so the landing page wouldn't hide and the app felt like
  one long page. Screen visibility is driven by `.screen` / `.screen.on`; never set
  `display` on a screen via an ID selector. Layout-only overrides go on `#id.on`.
- **Two source books are independent.** `questions.json` (Manhattan) and
  `questions-og.json` (OG) are NOT cross-checks for each other. The app's source
  selector switches between them; OG is the default and the one with sub-types/difficulty.
- The source books (PDF/EPUB) are **not** in the repo (`.gitignore`d) — they live in the
  user's Downloads.

## Key files
| File | Role |
|---|---|
| `parser.py` | 3 backends: `parse_pdf`/`parse_epub` (Manhattan) + `parse_og` (Official Guide). Run with `--og`. |
| `index.html` | The trainer app (SPA). Edit directly; never regenerate from the parser. |
| `index-classic.html` | The original simple single-question app (kept). |
| `ui-{focus,momentum,console,exam}.html` | Four early UI design explorations (kept for reference). |
| `questions-og.json` / `questions.json` | The two question banks (shared schema). |
| `CLAUDE.md` | Canonical deep reference (parser internals, schema, app architecture). |
| `COVERAGE.md` | Extraction coverage + validation report for both books. |
