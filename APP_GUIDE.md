# GMAT Verbal Trainer — App Guide & Curriculum

A complete reference for **what this app is, how it's built, and how to use it** —
written so anyone (including a future you) can pick it up cold. For a narrative of
*how it was built*, see [PROJECT_LOG.md](PROJECT_LOG.md); for fast session onboarding,
see [HANDOFF.md](HANDOFF.md); for the deep parser/schema reference, see [CLAUDE.md](CLAUDE.md).

---

## 1 · Links

| What | Where |
|---|---|
| **Live app (Vercel)** | **https://gmat-prep-ivory.vercel.app/** |
| **Source code (GitHub, private)** | **https://github.com/Atomstars/gmat-verbal-practice** |
| Vercel project | `gmat-prep` (account: `govadaakash-gmailcoms-projects`) |
| Default branch | `master` |

> Deploys are triggered via the Vercel CLI from this repo (the Vercel project is not
> GitHub-auto-deploy–connected at the project-settings level), so a push to `master`
> needs a follow-up `vercel --prod` to actually go live. Always verify the live URL
> after pushing — see [HANDOFF.md](HANDOFF.md) gotchas.

---

## 2 · What this app actually is (one paragraph)

A **personal, fair-use study tool** that turns two real GMAT prep books into a
practice product: a Python parser extracts verbatim questions + book-verified
answers into JSON, and a single HTML file (`index.html`) is a full practice
experience over that data — dashboard, six practice modes, adaptive difficulty,
weak-spot analytics, and a timed exam simulator. No invented content anywhere:
every question, option, and answer is lifted from the source book; anything the
parser can't confirm is left `null` rather than guessed.

---

## 3 · Architecture

### 3.1 The pipeline (offline, run by hand when source books change)

```
 Manhattan "All the Verbal" (PDF + EPUB)  ──┐
                                             ├──▶  parser.py  ──▶  questions.json       (64 Q)
 GMAT Official Guide 2024-2025 (PDF)  ──────┘        │
                                                       └────────▶  questions-og.json    (346 Q)
                                                                          │
                                                                          ▼
                                                                     index.html  (the app)
                                                                          │
                                                                          ▼
                                                              Vercel static hosting
                                                          https://gmat-prep-ivory.vercel.app
```

- **Two source books, two independent output files.** They are never cross-checked
  against each other — the app's "source bank" selector just switches between them.
- **No backend, no build step.** `parser.py` is a one-shot offline script (run only
  when re-extracting); `index.html` is hand-written, static, and talks to nothing but
  the two JSON files sitting next to it via `fetch()`.
- **No tests.** "Validation" = re-running the parser and reading its printed coverage
  + cross-validation report (see §3.2).

### 3.2 `parser.py` — three extraction backends, one shared JSON schema

| Backend | Library | Book | Role |
|---|---|---|---|
| `parse_pdf` | pdfplumber | Manhattan *All the Verbal* | Primary / source of record |
| `parse_epub` | BeautifulSoup + lxml | Manhattan *All the Verbal* | Independent cross-check oracle |
| `parse_og` | PyMuPDF (`fitz`) | *GMAT Official Guide 2024–25* | Primary (this book has no second source) |

**Anti-hallucination guarantee** — the core design principle: every answer must be
confirmed by **two independent signals**, or it ships as `null`.
- Manhattan: the PDF extraction and the EPUB extraction are done independently, then
  `cross_check()` compares them by normalized question text. They agreed on 50/50
  shared answers in the last run, and the one disagreement they caught
  (`rc-ch15-q9`) turned out to be a real EPUB extraction error — proof the method works.
- Official Guide: the book's own **numbered answer key** (`NNN. X` lines) is checked
  against the **explanation's own "Correct." marker**, both pulled from the same PDF.
  346/346 confirmed, 346/346 agree, 0 conflicts, 0 guessed.

**Other things the parser does**, source-specific and intentionally conservative:
- Locates the Official Guide's Verbal sections (8.4–8.9) **by heading text**, not
  page numbers, because each section spills onto the next section's first page.
- Strips RC line-number markers (`(5)`, `(10)`), normalizes smart quotes/ligatures,
  and now preserves **paragraph breaks** (`clean_paras`) so passages and
  explanations don't render as one wall of text.
- Infers a fine-grained **CR task label** (Weaken/Strengthen/Assumption/…) from stem
  wording via ordered keyword rules (`_OG_CR_RULES`) — the *one* field that isn't a
  verbatim book label, and it degrades to `"Unclassified"` (~12% of CR) rather than
  guess. RC sub-types, by contrast, are the book's own printed labels, verbatim,
  164/164.
- Deliberately **excludes Sentence Correction** — it isn't on the current GMAT
  (Focus Edition dropped it), and the book's SC drills have no reliable answer key.

### 3.3 `index.html` — the app itself

A **hand-rolled single-page app, one file, no framework, no router library**:

- **Screens** are `<section class="screen">` blocks — `landing`, `dash`, `setup`,
  `run`, `report` — shown one at a time by toggling a `.on` CSS class via `show(id)`.
- **`Store`** — a single IIFE that is the *only* code touching persistence
  (`localStorage`, key `gmat_verbal_v1`). It records per-question history, the daily
  streak/level, and the adaptive column level, and exposes a small API
  (`record`, `overall`, `byField`, `wrongIds`, `adaptLevel`, export/import/reset).
  It's written so a Supabase backend could be swapped in later without touching any
  UI code — sync is requested but not yet built (see §6 Roadmap).
- **Adaptive engine** (`buildPassages` / `pickPassage` / `Store.adaptLevel`) — groups
  every RC question into its passage (36 passages in the OG bank: 11 Easy / 13 Medium
  / 12 Hard), then after each passage: **≥75% correct → harder, <50% → easier,
  otherwise hold**, clamped between Easy and Hard. This one rule drives both adaptive
  modes (§4).
- **Analytics** — `Store.byField("subtype"/"difficulty")` aggregates accuracy, and
  `findWeakest()` picks the lowest-accuracy bucket (once it has ≥3 attempts) to drive
  the dashboard's weak-spot callout and the "Target weak spots" mode.
- **Theming** — light/dark via CSS variables on `:root`, switchable with a header
  toggle button; the choice is saved to `localStorage` (`gmat_theme`) and a tiny
  pre-paint script in `<head>` applies it before first render so there's no flash.
  First-ever visit falls back to the OS `prefers-color-scheme`.
- **Per-question timing** — `App.qTimes` records seconds-per-question during a run;
  the report screen shows a ⏱ pill per question plus an Avg/question card.

### 3.4 Data schema (shared by both JSON files)

```
id, type (CR|RC), chapter, title, question, passage (RC only, else null),
options [{label:"A".."E", text}], correct_answer, explanation, format
```
The Official Guide file adds: `subtype` (fine-grained type, for filtering/analytics),
`category` (the book's 3-bucket label), `difficulty` (Easy/Medium/Hard), `number`
(book's own question number), `source`. The app reads either file; unknown keys are
ignored, so both files work through the same rendering code.

---

## 4 · Business case — what the app actually gives you

The product being built here is a **practice product disguised as a personal tool**:
real exam content (legally a grey area, hence "personal/fair-use only") wrapped in
the same kind of adaptive-practice UX that paid test-prep products charge for.
Concretely, it gives:

| Value | How |
|---|---|
| **A real, verified question bank** | 346 Official Guide + 64 Manhattan questions, every answer checked against the book's own key — not scraped, not AI-generated. |
| **Knowing exactly where you're losing points** | Accuracy tracked per RC type (Main Idea, Inference, …) and per CR task (Weaken, Assumption, …), not just an overall score. |
| **Practice that gets harder as you improve** | The adaptive passage engine — same idea as the real GMAT's adaptive scoring, applied to practice. |
| **A daily habit loop** | "One RC a day" + streak counter — a single small commitment per day rather than "study for 2 hours." |
| **Real exam pressure, on demand** | Timed, no-feedback exam simulation that mirrors GMAT Focus pacing (23 questions / 45 minutes). |
| **A way to close the loop on mistakes** | Redo-my-misses replays exactly the questions you got wrong, nothing else. |
| **Zero setup cost for the user** | One file, no login, no install — `localStorage` remembers everything between visits on the same device. |

### 4.1 The six practice modes (the product's "feature list")

| Mode | What it does | Feedback | Best for |
|---|---|---|---|
| **One RC a day** | One adaptive RC passage per day; tomorrow's difficulty depends on today's score; builds a 🔥 day-streak. Doing a 2nd passage same day offers a "bonus" round that doesn't affect the streak/level. | Immediate, per question | Building a daily habit without burning out |
| **GMAT RC column** | A continuous run of RC passages, promote/demote after every passage — the closest thing to riding the GMAT's real adaptive algorithm in practice. | Immediate, per question | Simulating "the exam never lets up" pressure |
| **Practice** | Pick type (RC/CR/either), concept/sub-type, difficulty, question count (5/10/15/21/All), and order (shuffled or book order). | Immediate, plus the question's sub-type badge is revealed *only after* you answer (so it's never a hint) | Targeted, self-directed drilling |
| **Exam simulation** | Fixed 21-question set (configurable), full countdown timer paced at 45min/23Q, **zero feedback** until the end, then a full score report. | Delayed — end-of-section report only | Rehearsing real test conditions |
| **Redo my misses** | Auto-builds a set from every question you've ever gotten wrong (and not yet gotten right). | Immediate | Closing the loop, spaced-repetition style |
| **Target weak spots** | Auto-builds a 15-question set from your single lowest-accuracy sub-type (needs ≥3 attempts in that bucket to qualify). | Immediate | Letting the data pick your next session for you |

### 4.2 The dashboard (the "home base")

- **Overall accuracy ring** + quick stats: questions done, questions to redo, day streak.
- **One smart recommendation** (`renderAnalytics`'s `rec` logic): if you've never
  practiced → "start today's passage"; if today's daily isn't done → do it; else if
  there's a clear weak spot → drill it; else → continue the adaptive column. The app
  always has an opinion about what you should do next.
- **Accuracy bars** per RC sub-type, per CR task, and per difficulty band, with the
  single weakest bucket highlighted.
- **GMAT Focus Verbal syllabus card** — a static reference panel (23Q/45min pacing,
  the two question types, the sub-type lists) so the app doubles as a one-page study
  guide for the exam format itself.
- **Data tools** — Export progress (downloads a JSON snapshot), Import (restores it,
  e.g. onto a new device), Reset all (wipes local progress after confirmation).

### 4.3 Two switchable question banks

A **source selector** in the app bar swaps the entire app between:
- **Official Guide 2024–25** (`questions-og.json`, default) — 346 Q, has sub-types,
  difficulty bands, and feeds the adaptive engine (36 leveled passages).
- **Manhattan: All the Verbal** (`questions.json`) — 64 Q, CR + RC only, no difficulty
  bands so the two adaptive modes are unavailable on this bank.

### 4.4 Who this is for / how it's actually used

- A single GMAT candidate (Akash), studying Verbal solo, on their own device(s),
  fitting practice into small daily sessions plus occasional full-length timed runs.
- Not multi-user, not a sold product, not distributed — the source books stay out of
  the repo and the README explicitly flags personal/fair-use only.
- Realistic week-in-the-life usage pattern the modes are built around: **daily RC
  passage** (habit) → **Practice** sessions targeting a known weak sub-type → an
  occasional **exam simulation** to check real-condition pacing → **redo-my-misses**
  to mop up → dashboard analytics quietly tell you when the weak spot has shifted.

---

## 5 · How to run it

```bash
# one-time deps (only needed if you're re-running the parser, not the app)
pip install pdfplumber beautifulsoup4 lxml pymupdf

# run the app locally — a server is REQUIRED (the page fetch()es the JSON; file:// fails)
python -m http.server 8000
# open http://localhost:8000

# re-extract a question bank (source PDFs live outside the repo)
python parser.py "<Manhattan book>.pdf" --epub "<Manhattan book>.epub"
python parser.py --og "<GMAT Official Guide 2024-2025>.pdf"
```

Or just use the live deploy — **https://gmat-prep-ivory.vercel.app/** — nothing to
install.

---

## 6 · Current state, known gaps, roadmap

- **Shipped today:** both banks, all 6 modes, adaptive engine, full analytics,
  export/import/reset, light/dark theming, per-question timing in reports.
- **Not yet built:** cross-device sync. `Store` is written to make this a backend
  swap (not a rewrite) — needs a Supabase project (URL + anon key) and a
  `SupabaseStore` implementing the same API. This is also the prerequisite for a real
  login page.
- **Known accuracy gap:** ~12% of CR questions in the Official Guide bank are honestly
  labeled `"Unclassified"` rather than force-fit into a task category — tunable via
  `_OG_CR_RULES` in `parser.py` if more precision is wanted later.
- **Deploy is CLI-push, not auto-deploy.** Pushing to `master` does not by itself
  update the live Vercel link — a `vercel --prod` deploy step is required after.
  Vercel has occasionally queued/stalled builds for several minutes; if the live site
  doesn't reflect a recent push, re-check deployment status before assuming the code
  is wrong.

---

## 7 · File map

| File | Role |
|---|---|
| [`index.html`](index.html) | The app itself. Edit directly — never regenerate from the parser. |
| [`parser.py`](parser.py) | The 3 extraction backends + cross-validation. Offline tool, run by hand. |
| [`questions-og.json`](questions-og.json) | Official Guide 2024–25 bank (346 Q) — the app's default. |
| [`questions.json`](questions.json) | Manhattan *All the Verbal* bank (64 Q). |
| [`index-classic.html`](index-classic.html) | The original, simpler single-question app (kept for reference). |
| `ui-{focus,momentum,console,exam}.html` | Four early UI design explorations (kept, not live). |
| [`CLAUDE.md`](CLAUDE.md) | Deep technical reference for the parser internals + schema. |
| [`HANDOFF.md`](HANDOFF.md) | Fast catch-up doc for a new working session. |
| [`PROJECT_LOG.md`](PROJECT_LOG.md) | Narrative build history — the *why* behind each decision. |
| [`COVERAGE.md`](COVERAGE.md) | Extraction coverage + validation numbers for both books. |
| `APP_GUIDE.md` *(this file)* | Architecture + business-case curriculum, all in one place. |
