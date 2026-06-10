# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **New session? Read [HANDOFF.md](HANDOFF.md) first** — current status, how to run,
> open items, and gotchas. Then [TECH_STACK.md](TECH_STACK.md) (stack) and
> [PROJECT_LOG.md](PROJECT_LOG.md) (how we got here). This file is the deep reference.

## What this is

A **personal** GMAT Verbal practice app (fair-use, not for distribution). A Python
parser extracts real questions from a GMAT prep book into `questions.json`, and a
single-file web app (`index.html`) is a practice UI over that data. The hard
requirement throughout: **never invent or alter a question/answer** — extract only
what's in the source, and leave anything unconfirmable as `null` rather than guess.
Correctness beats volume.

## Pipeline

```
Manhattan "All the Verbal" (PDF and/or EPUB)  ->  parser.py  ->  questions.json  --\
                                                                                     >  index.html
GMAT Official Guide 2024-2025 (PDF, --og)     ->  parser.py  ->  questions-og.json --/
```

Two **separate** source books feed two **separate** output files; the app's source
selector switches between them. The source books live **outside this repo** (the
user's Downloads / OneDrive Desktop), not in version control. Pass their paths to
`parser.py`.

## Commands

```bash
# one-time deps  (pymupdf is only needed for the Official Guide backend)
pip install pdfplumber beautifulsoup4 lxml pymupdf

# --- Manhattan "All the Verbal" -> questions.json ---
# (PDF is the source of record; --epub enables PDF-vs-EPUB cross-validation)
python parser.py "<book>.pdf" --epub "<book>.epub"
python parser.py "<book>.epub"          # EPUB-only also works
# auto-discovers a "*verbal*manhattan*" file in ./, ~/Downloads, ~/Desktop, etc.
# if no path is given. Writes questions.json + prints a coverage + cross-check report.

# --- GMAT Official Guide 2024-2025 (Focus Edition) -> questions-og.json ---
python parser.py --og "<official-guide>.pdf"
# A bare .pdf whose filename contains "official"+"guide" also routes here, as does
# auto-discovery when no other file is passed. Writes questions-og.json + prints a
# coverage + intra-file cross-validation report. Does NOT touch questions.json.

# run the app (a server is REQUIRED — the page fetch()es questions.json; file:// fails)
python -m http.server 8000      # then open http://localhost:8000
```

There are no tests or build step. Validation is done by re-running the parser and
reading its printed **coverage summary** and **cross-validation** report.

`.claude/launch.json` defines a `gmat-app` static-server config for the preview tool.

## parser.py architecture (the important part)

Two backends produce the **same JSON schema**, dispatched by file extension in
`main()`:

- **`parse_pdf`** (pdfplumber) — primary / source of record. Parses the linear page
  text using structural anchors.
- **`parse_epub`** (BeautifulSoup) — parses the structured XHTML. Used as an
  independent **cross-check oracle** when both files are supplied.

`cross_check()` matches confirmed answers between the two extractions by normalized
question text and reports agreements/conflicts. Two independent parses agreeing is
the project's anti-hallucination guarantee — a past run caught a real answer error
this way (see COVERAGE.md, `rc-ch15-q9`).

A **third** backend, `parse_og` (PyMuPDF/`fitz`), handles the GMAT Official Guide
2024-2025 — a different book, written to `questions-og.json` (see below). It is
**not** an oracle for the Manhattan book; the two books are independent.

### Official Guide backend (`parse_og`) — same JSON schema, separate file
- **Why fitz, not pdfplumber**: pdfplumber drops this file's `fi`/`fl` ligatures
  (`scienti ic`) and maps smart quotes/dashes to U+FFFD; fitz returns clean Unicode
  that `clean()`/`SMART` normalize. Don't switch it back to pdfplumber.
- **Source structure (Chapter 8, Focus Edition)**: Verbal is six sub-sections,
  located by heading text (`_og_find_sections`, not hardcoded pages):
  `8.4` RC practice, `8.5` RC key, `8.6` RC explanations, `8.7` CR practice,
  `8.8` CR key, `8.9` CR explanations. **Each section spills onto the first page of
  the next** (e.g. RC questions 615-619 and the RC key for them land on the 8.5/8.6
  pages) — the key/explanation/practice readers all include `hi+1` and stop at the
  next heading. Question numbers are global: **RC = 456-619, CR = 620-801**.
- **Two independent answer signals, cross-checked intra-file** (the anti-
  hallucination guarantee, here within one PDF):
  1. the **numbered Answer Key** (`NNN. X` lines) — authoritative, complete;
  2. the **explanation marker** — `(X)... Correct.` (RC + CR) / `The correct answer
     is X.` (CR). The shipped answer is the key; a question whose two signals
     **disagree** is reported as a conflict and left `null`, never guessed. Current
     run: 346/346 confirmed, 346/346 agree, 0 conflicts.
- **RC passages**: each `Questions X-Y refer to the passage.` line maps a passage to
  question range X..Y (36 passages). `Line` / `(5)`,`(10)` markers are stripped.
- **Difficulty bands** (`Questions X-Y — Difficulty: Easy/Medium/Hard`) become the
  `chapter` label, so the app's chapter filter acts as a difficulty filter. OG
  records carry extra `difficulty`, `number`, `source` fields (the app ignores
  unknown keys); ids are `og-{rc|cr}-q{NNN}`.

### Source structure assumptions (Manhattan "All the Verbal", 6th ed.)
- Chapters map to types by number: **2–9 = SC, 11–15 = RC, 16–22 = CR**
  (`unit_for_chapter`, `PROBLEMSET_CHAPTERS`). Ch 1/10 have no problem set.
- The PDF backend matches the 20 problem-set page regions, in order, to
  `PROBLEMSET_CHAPTERS`. If that ordering ever breaks, every chapter mapping breaks.
- **Do not trust EPUB `sourceline`** (often `None`); the EPUB backend derives a
  document-order index from `soup.descendants` instead.

### Answer inference (conservative, source-specific) — do not loosen these
- **CR**: the solution states `"<Title>: The correct answer is (X)"`
  (`cr_answer_by_title` / `cr_answer_from_text`). Read verbatim — it's the book's key.
- **RC**: the answer analysis marks one labelled choice `"(X) ... CORRECT."`
  - Positional map (i-th `CORRECT` marker = i-th question) **only** when the
    marker count equals the question count in that chapter; otherwise fall back to
    stem-anchored search. RC explanations are anchored on the **correct option's own
    text** (`pdf_rc_explanation_anchor`) because question stems repeat across
    passages ("The primary purpose of the passage is to") and would mismatch.
- **SC**: intentionally left `null` AND excluded from the shipped file. Its
  solutions are prose with no reliable key, and SC is not on the current GMAT
  (Focus Edition). Only `type in ("CR","RC")` is written to `questions.json`.

### Parsing quirks already handled (don't regress)
- A numbered line `N.` is a real problem only if an `(A)` option appears before the
  next numbered line — this filters out the directions' own 1–4 list.
- Option text accumulation stops at a `Passage X:` header so the next passage
  doesn't bleed into the last answer choice.
- RC passage line-number markers like `(5)`, `(10)` are stripped (`LINE_NO_RE`);
  these are digits, distinct from letter option labels `(A)–(E)`.
- `SMART`/`clean()` normalize smart quotes, ligatures, dashes to ASCII.

## questions.json schema

Array of objects: `id` (`{cr|rc}-ch{n}-q{n}`, or `og-{cr|rc}-q{n}`), `type`
(`CR`|`RC`), `chapter`, `title` (CR topic label or null), `question` (title + stem,
`\n\n`-joined), `passage` (RC only, else null), `options` (`[{label:"A", text}...]`,
A–E), `correct_answer` (single letter; never null in the shipped CR/RC set),
`explanation`, `format` (`multiple_choice`). `questions-og.json` records also carry
`difficulty` (Easy/Medium/Hard), `number` (book question #), `source`, and the
sub-type fields below; both files share the schema so the app reads either.

### Sub-type fields (OG only)
- `subtype` — the question's fine type used for filtering/analytics. **RC**: the
  book's own printed label (`_og_category` reads it verbatim from the explanation:
  Main Idea / Supporting Idea / Inference / Application / Evaluation / Logical
  Structure) — source-faithful, 164/164. **CR**: a task **inferred from the stem
  wording** (`_og_cr_task`: Weaken/Strengthen/Assumption/Inference / Conclusion/Flaw/
  Evaluate/Boldface / Method/Explain a Discrepancy/Plan/Complete the Argument), or
  `"Unclassified"` when no rule matches with confidence (~12%). The CR inference is
  the ONE place a label isn't taken verbatim from the book — keep it conservative.
- `category` — the book's printed label verbatim (RC: same as subtype; CR: the 3
  broad buckets Argument Construction / Argument Evaluation / Evaluation of a Plan).

## index.html (the app) — "GMAT Verbal Trainer"

One self-contained file: plain HTML/CSS/JS, no build, no backend. Mobile-first,
responsive, auto light/dark. A **source selector** (`SOURCES` map) switches between
`questions-og.json` (default) and `questions.json`. The app is a dashboard + several
modes; the original simple single-question app is preserved as `index-classic.html`,
and `ui-{focus,momentum,console,exam}.html` are earlier design explorations.

- **Persistence:** uses **localStorage** (key `gmat_verbal_v1`) via the `Store`
  abstraction — per-question history, daily streak/level, column level. This
  deliberately reverses the classic app's session-only design (needed for streaks,
  redo-failed, and cross-session analytics). `Store` is written so a Supabase
  backend can be dropped in for cross-device sync (swap the backend, keep the API);
  Export/Import/Reset are exposed. Nothing is uploaded by default.
- **Modes:** Daily RC (one passage/day, adaptive difficulty + streak), GMAT RC
  column (continuous passage-level adaptive), Practice (filter by type / `subtype`
  concept / difficulty, instant feedback + a sub-type badge **revealed only after
  answering** so it isn't a hint), Exam simulation (timed 45min/23Q pace, no
  feedback, score report), Redo-my-misses (from saved wrong set), Target-weak-spots
  (lowest-accuracy `subtype`).
- **Adaptive engine** (`buildPassages`/`pickPassage`/`Store.adaptLevel`): RC grouped
  into passages (OG: 36 — 11 Easy/13 Medium/12 Hard); after a passage, **≥75% → up,
  <50% → down, else stay** (clamped Easy↔Hard). Same rule drives Daily and Column.
- **Analytics dashboard:** accuracy bars per RC `subtype`, per CR `subtype`, per
  difficulty, with a weakest-area callout (needs ≥`MIN_ATTEMPTS`). Plus a GMAT Focus
  Verbal syllabus card (23Q/45min, the types).

Edit the source directly for UI changes; do not regenerate it from the parser.
