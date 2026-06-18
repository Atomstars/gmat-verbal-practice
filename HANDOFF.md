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
    **paragraph breaks** (`\n\n`). No answer changed — pure formatting.
- **App:** `index.html` — "GMAT Verbal Trainer", a multi-screen SPA (landing →
  dashboard → setup → runner → report). Modes: Daily RC (adaptive + streak), GMAT RC
  column (adaptive), Practice (type/concept/difficulty filters), Exam sim (timed),
  Redo-my-misses, Target-weak-spots. Weakness analytics by sub-type/difficulty.
  Progress saved in **localStorage** (`gmat_verbal_v1`).
  - **Report screen:** per-question **time pill**, **Avg/question** card, total session
    time, collapsible **Reading passage** toggle for RC items.
  - **Dark/light theme toggle** with persistence (`gmat_theme` in localStorage).
- **Supabase cross-device sync (added 2026-06-18):** local-first architecture — the
  existing synchronous `Store` API is untouched. When configured, adds Google OAuth
  sign-in + cloud progress merge via a `progress` table in Supabase. **Optional:**
  app runs as a local-only guest if keys are blank or Supabase is down.
  - **Supabase project:** `bfaaczlxfafsxjnqqvoc` (Seoul), table `progress` with RLS.
  - **Google OAuth:** configured in Google Cloud project `GMAT`, consent screen set to
    External/Testing. Test user: `govada.akash@gmail.com`.
  - **Status:** code deployed, Supabase table + RLS + Google provider configured.
    **Google login not yet verified end-to-end** — was returning "provider not enabled"
    error initially; provider was re-enabled in Supabase but not re-tested before
    session ended. **First priority for next session: test the sign-in flow.**
- **Repo:** `github.com/Atomstars/gmat-verbal-practice` (**private**).
- **Deploy:** Vercel project **gmat-prep** → **https://gmat-prep-ivory.vercel.app**
  (GitHub-connected). **Vercel deploy may be stalled** — see "Open items" below.

## How to run locally
```bash
python -m http.server 8754      # a server is REQUIRED (app fetch()es the JSON)
# open http://localhost:8754
```
Re-generate OG data (needs the source PDF, which lives outside the repo):
```bash
pip install pdfplumber beautifulsoup4 lxml pymupdf
python parser.py --og "<path-to>/gmat-official-guide-2024-2025...pdf"
```

## Open items / next steps
1. **Verify Google sign-in end-to-end.** Click "Sign in" on the landing page →
   should redirect to Google → back to app with avatar + email in the header bar.
   If "provider not enabled" error persists, check Supabase → Authentication →
   Providers → Google is toggled ON with the correct Client ID/Secret. The Google
   Cloud OAuth consent screen is in "Testing" mode — only test users
   (`govada.akash@gmail.com`) can sign in until it's published.
2. **Test two-device sync.** Sign in on two browser profiles with the same Google
   account. Answer questions in one, reload the other — progress should appear.
3. **Vercel deploy (may need manual unblock).** Previous session saw every deploy
   stall with status UNKNOWN / empty build logs. Check Vercel dashboard →
   `gmat-prep` → Settings → look for banners about usage limits or billing.
   After unblocking, run `vercel --prod`. The live URL is
   https://gmat-prep-ivory.vercel.app.
4. **CR sub-type precision (~88%).** 21/182 CR questions are `"Unclassified"`;
   the `_OG_CR_RULES` classifier in `parser.py` can be tuned if desired.

## Gotchas / lessons (don't re-learn these the hard way)
- **OG PDF must be parsed with PyMuPDF (`fitz`), not pdfplumber** — pdfplumber drops
  this file's ligatures and smart quotes. See CLAUDE.md.
- **The preview screenshot tool is flaky in this environment** (often times out / returns
  a stale paint). Verify UI by scripting the live app with `preview_eval` (read `App`/DOM
  state) — that's authoritative even when a screenshot looks wrong.
- **The preview server serves from CWD** — if you edit in a worktree, either copy the
  file to the main repo or restart the server with `-d <worktree-path>`.
- **Browser caches the JSON.** The fetch uses `{cache:"no-cache"}`, but if you ever see
  stale data do a hard refresh (Ctrl+Shift+R).
- **CSS specificity bug we already hit:** an `#id { display:flex }` rule beats
  `.screen { display:none }`, so the landing page wouldn't hide. Screen visibility is
  driven by `.screen` / `.screen.on`; never set `display` on a screen via an ID selector.
- **Two source books are independent.** `questions.json` (Manhattan) and
  `questions-og.json` (OG) are NOT cross-checks for each other.
- The source books (PDF/EPUB) are **not** in the repo — they live in the user's Downloads.
- **`gmat_theme` is local-only** — dark/light preference is NOT synced to Supabase
  (intentional; it's a device preference).
- **Supabase anon key is public by design** — RLS protects each user's row. Don't treat
  it as a secret.

## Key files
| File | Role |
|---|---|
| `parser.py` | 3 backends: `parse_pdf`/`parse_epub` (Manhattan) + `parse_og` (Official Guide). Run with `--og`. |
| `index.html` | The trainer app (SPA). Edit directly; never regenerate from the parser. |
| `index-classic.html` | The original simple single-question app (kept). |
| `ui-{focus,momentum,console,exam}.html` | Four early UI design explorations (kept for reference). |
| `questions-og.json` / `questions.json` | The two question banks (shared schema). |
| `APP_GUIDE.md` | Architecture + business-case doc for the app. |
| `CLAUDE.md` | Canonical deep reference (parser internals, schema, app architecture). |
| `COVERAGE.md` | Extraction coverage + validation report for both books. |
