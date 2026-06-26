# HANDOFF — start here

Fast catch-up for a new session. Read this first, then [CLAUDE.md](CLAUDE.md) for the
deep parser/app reference, [TECH_STACK.md](TECH_STACK.md) for the stack, and
[PROJECT_LOG.md](PROJECT_LOG.md) for how we got here.

## What this project is
A **personal, fair-use** GMAT trainer. A Python parser extracts real, answer-verified
questions from GMAT prep books into JSON; a single-file web app (`index.html`) is the
study UI over that data. Now covers **Verbal** (RC + CR) **and Quantitative** (PS + DS).
**Non-negotiable rule: never invent or alter a question/answer — leave anything
unconfirmable as `null`.** Correctness beats volume.

## Current state (works today)
- **Data shipped:**
  - `questions-og.json` — **346** questions from the *GMAT Official Guide 2024-2025*
    (Focus Edition). Every answer verified (346/346, 0 conflicts). Carries `subtype`,
    `category`, `difficulty`, `number`.
  - `questions.json` — 64 from Manhattan *All the Verbal* (CR+RC).
  - `questions-quant.json` — **500** from *Manhattan Review Quantitative Question Bank
    6th Ed* (PS Q1–250 + DS Q251–500). 496/500 confirmed; 4 genuine book conflicts
    flagged `needs_review: true`. Each has `type` (PS/DS), `chapter` (topic), `question`
    (with inline `$math$` for KaTeX), `options`, `explanation`, optional `diagram` path.
    DS options are the 5 standard hardcoded choices (never printed in the PDF).
  - **29 diagram PNGs** in `diagrams/` — cropped geometry figures (200 DPI).
- **App:** `index.html` — "GMAT Verbal Trainer", a multi-screen SPA. Three question
  banks selectable from the top-right dropdown:
  - "Official Guide 2024–25" (default)
  - "Manhattan: All the Verbal"
  - "MR Quant Question Bank" ← added 2026-06-26
  - Quant math renders via **KaTeX** (CDN auto-render, `$...$` inline delimiters).
  - PS badge (blue) and DS badge (purple) in question header.
  - Geometry questions show a diagram `<img>` above the stem.
  - Modes: Daily RC, GMAT RC column, Practice (filters), Exam sim, Redo-my-misses,
    Target-weak-spots, Analytics dashboard. Progress in **localStorage** (`gmat_verbal_v1`).
- **Supabase cross-device sync:** local-first, optional. Google OAuth + `progress` table.
  Project `bfaaczlxfafsxjnqqvoc` (Seoul). **Google sign-in not yet end-to-end verified.**
- **Vector search (optional):** `api.py` (FastAPI + in-memory Qdrant). Run alongside app.
- **Repo:** `github.com/Atomstars/gmat-verbal-practice` (**private**).
- **Deploy:** Vercel **gmat-prep** → **https://gmat-prep-ivory.vercel.app**. May need
  manual unblock — see Open items.

## How to run locally
```bash
python -m http.server 8754      # REQUIRED — app fetch()es JSON, file:// fails
# open http://localhost:8754
```

Re-generate quant data (PDF lives outside the repo on OneDrive Desktop):
```bash
pip install pymupdf pillow sentence-transformers
python parse_quant.py "C:\Users\Akash\OneDrive\Desktop\New folder\MR-GMAT-Quantitative-Question-Bank-BTG-D27-M8_07.11.2016.pdf"
# writes questions-quant.json + diagrams/  (~60s for embeddings)

# test a single topic batch first (faster, ~15s):
python parse_quant.py "<pdf>" --ps-topics "Number properties" --ds-topics "Numbers"
```

Re-generate Verbal data (PDF outside the repo):
```bash
pip install pdfplumber beautifulsoup4 lxml pymupdf
python parser.py --og "<path>/gmat-official-guide-2024-2025.pdf"
```

## Open items / next steps
1. **Verify Google sign-in end-to-end.** Click "Sign in" → Google OAuth → back to app
   with avatar. If "provider not enabled": Supabase → Auth → Providers → Google ON.
   Consent screen is in Testing mode; only `govada.akash@gmail.com` works until published.
2. **Test two-device sync.** Sign in on two browser profiles → answer in one → reload
   other → progress should appear.
3. **Vercel deploy (may need unblock).** Previous session: every deploy stalled (status
   UNKNOWN, empty logs). Check Vercel dashboard → `gmat-prep` → Settings for billing
   banners. After unblocking: `vercel --prod`. Live URL: https://gmat-prep-ivory.vercel.app.
4. **Quant type filter chips** — Practice setup shows "All Verbal / Reading Comp /
   Critical Reasoning" chips. These are Verbal-only; when quant bank is selected they
   don't filter usefully. Add "All / PS / DS" chips that activate for the quant source.
   Not breaking (all 500 questions accessible via "All Verbal"), just suboptimal UX.
5. **Quant analytics** — `questions-quant.json` has `chapter` (topic) but no `subtype`,
   so the analytics dashboard shows no quant breakdown. Could use `chapter` as subtype.
6. **CR sub-type precision (~88%).** 21/182 CR questions are `"Unclassified"`;
   `_OG_CR_RULES` in `parser.py` can be tuned.

## Gotchas / lessons (don't re-learn these the hard way)
- **OG PDF needs PyMuPDF (`fitz`)**, not pdfplumber — pdfplumber drops ligatures/quotes.
- **Quant PDF also needs PyMuPDF** — `get_text('dict')` gives per-span font-size needed
  for superscript detection. Do not switch to pdfplumber.
- **`_SOL_QNUM_RE = r'^(\d+)\.(?!\d)'`** — negative lookahead so "5.1" section headings
  don't match as Q5. Blocks run number and text together: `'1.Here given expression...'`.
- **DS solutions use `min_q=251`** — solution pages have sub-point labels like
  `'2. – Sufficient'`. `min_q=251` stops them colliding with PS Q2 in the merged dict.
- **Stem LaTeX**: emit inline `$token$` only around actual math, not the full stem. A
  whole-stem `$...$` makes KaTeX italicise every prose word as a math variable.
- **`y_range` fraction check removed** from `_build_stem` — multi-line questions trigger
  it wrongly. Only use `_spans_to_latex` when `\x12`/`\x13` fraction markers are present.
- **True superscripts need a y-position check**: `size < SUP_SIZE_MAX AND dom_y - span_y > 2`.
  Without it, small-font page numbers adjacent to text become false superscripts.
- **Preview screenshot times out** when KaTeX CDN is loading. Use `preview_snapshot`
  (accessibility tree) instead — reliable even during CDN load.
- **Browser caches JSON.** Fetch uses `{cache:"no-cache"}`. Hard-refresh (Ctrl+Shift+R)
  if data looks stale.
- Source books (PDF/EPUB) are **not** in the repo — they live on the user's machine.
- **`gmat_theme`** (dark/light) is local-only, intentionally NOT synced to Supabase.
- **Supabase anon key is public by design** — RLS protects each user's row.

## Key files
| File | Role |
|---|---|
| `parser.py` | 3 backends: `parse_pdf`/`parse_epub` (Manhattan Verbal) + `parse_og` (OG). |
| `parse_quant.py` | Standalone quant parser: PS+DS → `questions-quant.json` + `diagrams/`. |
| `api.py` | FastAPI vector search (Qdrant in-memory). Optional. |
| `index.html` | The trainer SPA. Edit directly; never regenerate from parser. |
| `index-classic.html` | Original simple single-question app (kept). |
| `questions-og.json` | OG Verbal (346 q, embeddings). |
| `questions.json` | Manhattan Verbal (64 q, embeddings). |
| `questions-quant.json` | Manhattan Quant PS+DS (500 q, embeddings, diagram paths). |
| `diagrams/` | Cropped geometry PNGs (200 DPI). Referenced by `diagram` field in JSON. |
| `CLAUDE.md` | Deep reference: parser internals, schema, app architecture. |
| `COVERAGE.md` | Extraction coverage + validation for the Verbal books. |
