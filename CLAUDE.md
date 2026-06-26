# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **New session? Read [HANDOFF.md](HANDOFF.md) first** — current status, how to run,
> open items, and gotchas. Then [TECH_STACK.md](TECH_STACK.md) (stack) and
> [PROJECT_LOG.md](PROJECT_LOG.md) (how we got here). This file is the deep reference.

## What this is

A **personal** GMAT practice app (fair-use, not for distribution) covering **Verbal**
(RC + CR) and **Quantitative** (PS + DS). Python parsers extract real questions from
GMAT prep books into JSON; a single-file web app (`index.html`) is the study UI.
The hard requirement throughout: **never invent or alter a question/answer** — extract
only what's in the source, and leave anything unconfirmable as `null` rather than guess.
Correctness beats volume.

## Pipeline

```
Manhattan "All the Verbal" (PDF/EPUB)  ->  parser.py       ->  questions.json     --\
GMAT Official Guide 2024-2025 (--og)   ->  parser.py       ->  questions-og.json  ---|->  index.html
Manhattan Review Quant QB 6th Ed (PDF) ->  parse_quant.py  ->  questions-quant.json -/
                                               |                       |
                                        embed_questions()       embed_questions()
                                        (all-MiniLM-L6-v2)     (all-MiniLM-L6-v2)
                                               |
                                  questions_embedded.json  ->  api.py  ->  index.html
                                                            (Qdrant + FastAPI)
```

Three **separate** source books feed three **separate** output files; the app's source
selector switches between them. Source books live **outside this repo** (user's
Downloads / OneDrive Desktop). Pass their paths to the parser.

## Commands

```bash
# one-time deps — Verbal parsers
pip install pdfplumber beautifulsoup4 lxml pymupdf

# one-time deps — Quant parser
pip install pymupdf pillow sentence-transformers

# one-time deps — vector search (optional, app works without it)
pip install sentence-transformers qdrant-client fastapi uvicorn

# --- Manhattan "All the Verbal" -> questions.json ---
python parser.py "<book>.pdf" --epub "<book>.epub"
python parser.py "<book>.epub"          # EPUB-only also works

# --- GMAT Official Guide 2024-2025 (Focus Edition) -> questions-og.json ---
python parser.py --og "<official-guide>.pdf"

# --- Manhattan Review Quant QB 6th Ed -> questions-quant.json ---
python parse_quant.py "<quant-book>.pdf"
# PDF path (on user's machine): C:\Users\Akash\OneDrive\Desktop\New folder\MR-GMAT-Quantitative-Question-Bank-BTG-D27-M8_07.11.2016.pdf
# Writes questions-quant.json + diagrams/*.png  (~60s including embeddings)
# Test a single topic batch first (faster):
python parse_quant.py "<pdf>" --ps-topics "Number properties" --ds-topics "Numbers"

# run the app (server REQUIRED — app fetch()es JSON; file:// fails)
python -m http.server 8000      # then open http://localhost:8000

# --- Vector search API (optional — similar-question panel + search bar) ---
python test_embeddings.py       # reads questions-og.json, writes questions_embedded.json (~16s)
python api.py                   # FastAPI on http://127.0.0.1:8000; docs at /docs
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

The EPUB also doubles as a **formatting** source: pdfplumber drops the PDF's paragraph
indents, so `merge_format_from_oracle()` borrows the EPUB's clean layout onto the
PDF-primary records — **without changing any PDF answer**. A passage transfers only when
its text essentially matches (same words, just paragraph breaks); an explanation transfers
only when the EPUB's answer *agrees* with the PDF's, so a shipped explanation never argues
for a different letter than the shipped answer (this is why `rc-ch15-q9`, where PDF=C is
correct, keeps its PDF explanation). EPUB RC passages are `ktp-numbered-line` spans whose
paragraph-start lines are indented with leading nbsp — `_epub_passage_text` splits on that.

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
  **Paragraph breaks are preserved**: the PDF indents each paragraph's first line with an
  **em-space (U+2003)**; `_og_parse_rc_practice` starts a new paragraph on it and joins via
  `clean_paras` (`\n\n`). That indent is the only paragraph signal in the linear text —
  don't collapse it. Plain `clean()` flattens every newline, so passages/explanations must
  use `clean_paras`, not `clean`.
- **Explanations are formatted, not flattened** (`_og_format_explanation`): the OG prints
  each explanation as restated question + restated options + a category heading + reasoning
  + a per-choice analysis + the answer line. The restated question/options are **dropped**
  (the app shows them already); the **category heading is the divider** (present 346/346)
  and everything from it on is kept — heading, the CR `Situation`/`Reasoning` sub-headings,
  each `A.`–`E.` note, and `The correct answer is X.` each on its own paragraph. Formatting
  only, no words changed. The answer-marker detection still runs on the raw block, so
  cross-validation is unaffected.
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

### Embedding (`embed_questions`) — called automatically at the end of both `main()` and `run_og()`
- Uses **all-MiniLM-L6-v2** (384-dim, local, no API keys). Adds `"embedding": [384 floats]`
  to each question dict before writing JSON. Gracefully skips (warning only) if
  `sentence-transformers` is not installed — the parser's core output is unaffected.
- Input text per question: `title + question + passage[:500] + options[:300]`, capped at
  1000 chars. The model's internal truncation handles overflow.
- `questions_embedded.json` is a standalone copy (generated by `test_embeddings.py`)
  consumed by `api.py`. If you re-run the parser, the main JSON files also get embeddings
  but `questions_embedded.json` must be regenerated separately for `api.py` to pick them up.

## Vector search layer (`api.py`)

FastAPI backend (port 8000) that loads `questions_embedded.json` into an **in-memory Qdrant**
collection at startup and exposes four endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check; returns question count |
| `GET /search-similar/{id}?limit=N` | N nearest questions by cosine similarity to a known question |
| `GET /search?q=<text>&limit=N` | Embed a freeform query on-the-fly, return N matches |
| `GET /questions/{id}` | Full question record (used by the similar-panel click handler) |

**Implementation notes:**
- Uses `client.query_points()` (qdrant-client v1.7+ API). The older `client.search()` was
  removed in v1.7 — do not revert to it.
- In-memory Qdrant is intentional for 346 questions (5 MB). For persistent storage, swap
  `QdrantClient(":memory:")` for `QdrantClient(url="http://localhost:6333")` and run Qdrant
  in Docker.
- The `window.VECTOR_API = "http://127.0.0.1:8000"` config line in `index.html` controls
  where the browser calls. Set it to `""` to disable all vector features.
- All vector features in the UI **degrade gracefully** — `fetch` errors are caught silently;
  the app functions normally if `api.py` is not running.
- Print statements in all vector scripts use plain ASCII (no emoji) to avoid
  `UnicodeEncodeError` on Windows CP1252 terminals.

## questions.json schema

Array of objects: `id` (`{cr|rc}-ch{n}-q{n}`, or `og-{cr|rc}-q{n}`), `type`
(`CR`|`RC`), `chapter`, `title` (CR topic label or null), `question` (title + stem,
`\n\n`-joined), `passage` (RC only, else null), `options` (`[{label:"A", text}...]`,
A–E), `correct_answer` (single letter; never null in the shipped CR/RC set),
`explanation`, `format` (`multiple_choice`). `questions-og.json` records also carry
`difficulty` (Easy/Medium/Hard), `number` (book question #), `source`, and the
sub-type fields below; both files share the schema so the app reads either.

When embeddings are generated, each record also carries `"embedding": [384 floats]`.
The app (`index.html`) ignores this field; only `api.py` / `questions_embedded.json` uses it.

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

## parse_quant.py architecture — Manhattan Review Quant Question Bank

Standalone parser (do not touch `parser.py`). Uses **PyMuPDF (`fitz`)** throughout —
`get_text('dict')` gives per-span `size`, `origin(x,y)`, `text`, required for LaTeX
reconstruction. Do not switch to pdfplumber (drops ligatures; no span metadata).

### PDF structure (550 pages, 1-indexed)
| Pages | Content |
|---|---|
| 15–90 | PS Questions, sections 2.1–2.24 (Number properties → Co-ordinate geometry) |
| 91–142 | DS Questions, sections 3.1–3.24 |
| 143–150 | Answer Key — `(NNN) X` lines, PRIMARY truth signal |
| 151–342 | PS Solutions |
| 343–550 | DS Solutions |

### Answer cross-validation (anti-hallucination guarantee)
Two independent signals, compared per question:
1. **Answer Key** (`(NNN) X` lines) — authoritative, complete (PRIMARY)
2. **Solution marker** — `"The correct answer is option X."` in solution text

Rules: AGREE → confirm; KEY only → keep key answer; DISAGREE → `correct_answer=null` +
`needs_review=true`. **Never guess.** Current run: 496/500 confirmed, 4 genuine book
conflicts.

### LaTeX reconstruction — structural, not visual
`page.get_text('dict')` provides per-span font metrics. Rules:

- **Superscripts**: `span.size < SUP_SIZE_MAX (8.0)` AND `dom_y - span.y > 2.0 pt`
  → collect consecutive sup spans, pull back the preceding base word, emit `$base^{exp}$`.
  The y-check is essential — without it, small-font page numbers adjacent to text
  become false superscripts (e.g. `If^{20}the sequence^{19}`).
- **Fractions**: `\x12`/`\x13` control chars are TeX fraction delimiters in this PDF.
  `_spans_to_latex` is called only when these markers are present in a stem.
- **Square roots**: literal `√` char (Unicode) → `\sqrt{arg}`. If arg span is empty,
  consume the next span as the argument.
- **Prose text**: emitted verbatim, not wrapped in `$...$`. Only true math tokens get
  `$...$` wrapping — wrapping entire stems makes KaTeX italicise all words.

### DS standard answer choices
DS options are never printed in the PDF. They're hardcoded in `DS_CHOICES` (same for
all 250 DS questions, standard GMAT wording). Do not try to extract them from the PDF.

### `_SOL_QNUM_RE = r'^(\d+)\.(?!\d)'`
Negative lookahead prevents "5.1" section headings matching as Q5. Required because
solution blocks often have no space: `'1.Here given expression...'`.

### `load_solutions(doc, sol_range, min_q=1)` — DS uses `min_q=251`
DS solution pages contain sub-point labels like `'2. – Sufficient'`. Without `min_q`,
these overwrite PS Q2 in the shared dict. Always call DS load with `min_q=251`.

### Diagram detection
`page.get_drawings()` detects vector figures. When drawings exist in a question's
y-zone: rasterize page at 200 DPI (`fitz.Matrix(200/72, 200/72)`), crop union bbox
with 10px padding via Pillow, save to `diagrams/{id}.png`. Currently 29 geometry
questions carry diagrams.

### Schema additions (quant-specific)
Same base schema as Verbal. Extra fields: `type` (PS/DS), `chapter` (topic label from
section header), `number` (book Q#), `source`, `needs_review` (bool), `source_page`,
`diagram` (path or null). No `subtype` / `category` (add later using `chapter`).

## index.html (the app) — "GMAT Verbal Trainer"

One self-contained file: plain HTML/CSS/JS, no build, no backend. Mobile-first,
responsive, auto light/dark. A **source selector** (`SOURCES` map) switches between
three banks: `questions-og.json` (default), `questions.json`, `questions-quant.json`.
The original simple app is preserved as `index-classic.html`; `ui-{focus,momentum,
console,exam}.html` are earlier design explorations.

**Quant-specific additions (2026-06-26):**
- **KaTeX** CDN (`katex@0.16.9`, auto-render). After each `renderQ()`, calls
  `renderMathInElement(col, {delimiters:[{left:'$',right:'$',display:false}]})`.
  Inline `$...$` only — display math is not used.
- **PS/DS type badges**: `<span class="pill t-PS">` (blue `#dbeafe`) and
  `<span class="pill t-DS">` (purple `#ede9fe`) shown in question header.
- **Diagram rendering**: `q.diagram` → `<img class="q-diagram">` above the stem.
  CSS: `.q-diagram{display:block;max-width:100%;margin:0.75rem 0 1rem;border-radius:6px}`

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
- **Report screen** (`finish`/`finishAdaptive`/`buildRepList`): total session time +
  an Avg/question card; each question item carries a per-question **⏱ time pill** (from
  `App.qTimes`, recorded in `resetRun`/`renderQ`/submit) and — for RC — a collapsible
  **📖 Reading passage** toggle so misses can be reviewed in full context.
- **Data fetch uses `{cache:"no-cache"}`** so a regenerated JSON is never served stale.
- **Vector features** (require `api.py` running):
  - **Similar questions panel** — rendered into `#simPanelSlot` (after `.pcard`) on every
    answer submission in non-exam modes via `showSimilarForCurrentQ()`. Shows 3 nearest
    questions with type/difficulty/subtype pills; clicking opens that question.
  - **Semantic search bar** (`#srchInput`) on the dashboard — 400ms debounce, calls
    `/search?q=...`, results in `#srchResults`; clicking a result starts a 1-question
    Practice session. Controlled by `window.VECTOR_API`; silently absent when empty.

Edit the source directly for UI changes; do not regenerate it from the parser.
