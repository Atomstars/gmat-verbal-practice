# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **New session? Read [HANDOFF.md](HANDOFF.md) first** — current status, how to run,
> open items, and gotchas. Then [TECH_STACK.md](docs/TECH_STACK.md) (stack) and
> [PROJECT_LOG.md](docs/PROJECT_LOG.md) (how we got here). This file is the deep reference.

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

## Repo layout (2026-07-13)

Root = the deployable static app (`index.html` + `questions*.json` + `embeddings.json`
+ `diagrams/` — exactly what Vercel serves). Tooling lives in `pipeline/` (parsers,
`build_index.py`, `eval_retrieval.py`, optional `api.py`, `diagram_captions.json`),
tests in `tests/`, reference docs in `docs/` (see `docs/DESIGN.md` for HLD/LLD),
old UI explorations in `prototypes/`. **Run all commands from the repo root** —
pipeline scripts use cwd-relative paths so outputs land at the root where the app
fetches them.

## Commands

```bash
# one-time deps — Verbal parsers
pip install pdfplumber beautifulsoup4 lxml pymupdf

# one-time deps — Quant parser
pip install pymupdf pillow sentence-transformers

# one-time deps — vector search (optional, app works without it)
pip install sentence-transformers qdrant-client fastapi uvicorn

# --- Manhattan "All the Verbal" -> questions.json ---
python pipeline/parser.py "<book>.pdf" --epub "<book>.epub"
python pipeline/parser.py "<book>.epub"          # EPUB-only also works

# --- GMAT Official Guide 2024-2025 (Focus Edition) -> questions-og.json ---
python pipeline/parser.py --og "<official-guide>.pdf"

# --- Manhattan Review Quant QB 6th Ed -> questions-quant.json ---
python pipeline/parse_quant.py "<quant-book>.pdf"
# PDF path (on user's machine): C:\Users\Akash\OneDrive\Desktop\New folder\MR-GMAT-Quantitative-Question-Bank-BTG-D27-M8_07.11.2016.pdf
# Writes questions-quant.json + diagrams/*.png  (~60s including embeddings)
# Test a single topic batch first (faster):
python pipeline/parse_quant.py "<pdf>" --ps-topics "Number properties" --ds-topics "Numbers"

# run the app (server REQUIRED — app fetch()es JSON; file:// fails)
python -m http.server 8000      # then open http://localhost:8000

# --- Vector search API (optional — similar-question panel + search bar) ---
python pipeline/build_index.py       # UNIFIED index: merges ALL 3 banks (910 q), tags each with
                                # bank (og|manhattan|quant), re-embeds with the shared recipe
                                # (incl. quant diagram captions), writes questions_embedded.json (~40s)
python pipeline/api.py                   # FastAPI on http://127.0.0.1:8000; docs at /docs
python pipeline/eval_retrieval.py        # retrieval eval: type/chapter consistency@5, weak queries, near-dups
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
this way (see docs/COVERAGE.md, `rc-ch15-q9`).

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
- Input text per question: `title + question + diagram_description[:300] +
  passage[:500] + options[:300]`, capped at 1000 chars. The diagram description sits
  right after the question so it lands inside MiniLM's ~256-token window — this is
  what makes figure content searchable.
- `questions_embedded.json` is the merged ALL-BANKS index (generated by
  `pipeline/build_index.py`, which tags each record with `bank`: og|manhattan|quant)
  consumed by `api.py`. If you re-run any parser, regenerate it with
  `python pipeline/build_index.py` for `api.py` to pick up the changes.

## Vector search layer (`api.py`)

FastAPI backend (port 8000) that loads `questions_embedded.json` into an **in-memory Qdrant**
collection at startup and exposes four endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check; returns question count (910 across all 3 banks) |
| `GET /search-similar/{id}?limit=N&same_bank=&same_type=&bank=&chapter=&difficulty=&min_score=` | Nearest neighbors; defaults `same_bank=true&same_type=true&min_score=0.25`; explicit `bank=` overrides |
| `GET /search?q=<text>&limit=N&bank=&type=&chapter=&difficulty=` | Embed a freeform query; searches all banks unless filtered (the UI searches everything and auto-switches banks on click) |
| `GET /chapters?bank=` | Chapter/topic labels with question counts per bank |
| `GET /questions/{id}` | Full question record incl. `bank`, `diagram` (used by the similar-panel click handler) |

Results carry `bank` and a `stem` snippet so the UI can render/open cross-bank hits.

Filters are Qdrant payload filters (`Filter`/`FieldCondition`/`MatchValue`); the payload
carries `bank` alongside type/chapter/subtype/difficulty. `eval_retrieval.py` is the
retrieval eval harness (proxy metrics: type/chapter consistency@5, top-1 score stats,
weak queries, near-duplicate pairs — it independently detects the book's reprinted
questions, e.g. ps-percents-q041/q044).

**Implementation notes:**
- Uses `client.query_points()` (qdrant-client v1.7+ API). The older `client.search()` was
  removed in v1.7 — do not revert to it. Bank filtering uses a Qdrant payload `Filter`.
- In-memory Qdrant is intentional for 910 questions (~10 MB). For persistent storage, swap
  `QdrantClient(":memory:")` for `QdrantClient(url="http://localhost:6333")` and run Qdrant
  in Docker.
- **The app no longer calls this API.** Since 2026-07 vector search runs 100% in the
  browser (`embeddings.json` + transformers.js — see the index.html section). `api.py`
  is kept as an optional local tool (its `/docs`, filters and Qdrant queries are useful
  for debugging retrieval) and still serves the static app from the repo root.
- All vector features in the UI **degrade gracefully** — `fetch`/model failures are caught
  silently; the app functions normally without `embeddings.json` or a network connection.
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

### Question-start numbers must be sequential
`parse_questions_in_range` accepts a line-initial `N.` as a new question ONLY when
`N == previous + 1`. The book's numbering is strictly sequential; without this check a
stem's own line-initial number becomes a phantom question (real case: Q24's
"...hours worked in excess of\n40. What was the total payroll..." created a duplicate
ps-percents-q040 carrying Q40's answer key entry on Q24's truncated stem). The book
genuinely reprints some questions under two numbers (41/44, 42/45 in Percents; also
detected by eval_retrieval.py) — those are source-faithful and kept.

### `_SOL_QNUM_RE = r'^(\d+)\.(?!\d)'`
Negative lookahead prevents "5.1" section headings matching as Q5. Required because
solution blocks often have no space: `'1.Here given expression...'`.

### `load_solutions(doc, sol_range, min_q=1)` — DS uses `min_q=251`
DS solution pages contain sub-point labels like `'2. – Sufficient'`. Without `min_q`,
these overwrite PS Q2 in the shared dict. Always call DS load with `min_q=251`.

### Diagram detection — structural interval assignment (rewritten 2026-07-04)
`page.get_drawings()` + per-question ownership intervals. Each question owns the
document span from its own start `(page, y)` (internal `_start_y`, popped before
write) to the next question's start, capped at the end of the following page.
Page drawings are clustered by proximity (12pt gap) into distinct figures; each
cluster is assigned to the interval containing its y-midpoint, then cropped via
`page.get_pixmap(clip=...)` at 200 DPI (Pillow no longer required). Currently
**32** questions carry diagrams (geometry + 3 data-interpretation tables + a 3×3
grid). Hard-won rules — do not regress:
- **Never use `rect.is_empty`** to filter drawings: line-only figures (number
  lines with ticks) have degenerate zero-area rects that `is_empty` discards.
  Pad them to 0.6pt thickness instead.
- **Skip pure-white fills** (`fill≈(1,1,1)`, no stroke color): invisible
  background paint extends past the visible figure into stem/option text. Keep
  gray fills (q219's shaded annulus).
- **Skip clusters whose members are all thin bars** (every height ≤3.5pt):
  stacked option fraction bars, not figures.
- Vertex/length labels are TEXT, not drawings: the clip absorbs short text
  lines (≤8 chars, not starting with `(`, not `NNN.`, below the 60pt header
  zone, not >8pt below the figure) within a 14pt halo of the drawn bbox.
- The old union-bbox+keyword approach shipped 10 duplicate/misassigned crops
  out of 29 — interval ownership is the fix; do not reintroduce keyword matching.

### Diagram captions (`diagram_captions.json` sidecar)
Machine-derived descriptions of each cropped figure (Claude vision reading the
PNGs against their stems, 2026-07-04), keyed by question id. The parser merges
them at parse time into `diagram_description` (+ `diagram_description_source`),
so the sidecar survives re-parses. Used ONLY as embedding/search text so
retrieval can see figure content — never displayed; the PNG stays the source of
record. If the diagram set changes, re-read the new crops and update the sidecar.

### Sequential-number guard (question grouping)
A `N.` block starts a new question ONLY if `N == previous + 1` (the book numbers
PS 1-250 / DS 251-500 strictly). Without it, a stem containing a wrapped number
(Q24: "...hours worked in excess of\n40. What was the total payroll...") splits
into a fake Q40 that steals the real Q40's answer-key letter and ships half a stem.

### Text normalization (quant)
Topic labels and all shipped text go through the shared `SMART` map
(`smart_clean` from gmat_parsing_common): ligatures/smart dashes → ASCII. This
fixed chapter labels (`Proﬁt & Loss` → `Profit & Loss`) and ids
(`ps-pro-t-loss-*` → `ps-profit-loss-*`; quant ids changed 2026-07-04, which
orphans any quant history saved under old ids — verbal history unaffected).
Section-heading blocks (~13.2pt font, `_is_section_heading_block`) are skipped
during grouping so headings no longer bleed into stems/options.

### Schema additions (quant-specific)
Same base schema as Verbal (incl. `title`/`passage` present as null — the schema
requires the keys). Extra fields: `type` (PS/DS), `chapter` (topic label from
section header), `number` (book Q#), `source`, `needs_review` (bool), `source_page`,
`diagram` (path or null), `diagram_description` + `diagram_description_source`
(machine-derived caption, embedding/search only). No `subtype` / `category`
(add later using `chapter`).

## index.html (the app) — "GMAT Trainer"

One self-contained file: plain HTML/CSS/JS, no build, no backend. Mobile-first,
responsive, auto light/dark. The whole UI is **bank-aware** (2026-07-04): `isQuant()`/`conceptOf(q)`/`hasSubtypes()`/
`hasDifficulty()` helpers drive setup chips (quant: All Quant/PS/DS + Topic picker with
counts), per-topic PS/DS analytics (weakest first), weakest-concept targeting
(`weakestForBank`, bank-scoped), syllabus card, landing copy, and exam pacing
(quant 21q/45min vs verbal 23q/45min). `Store.record` persists `chapter` per attempt.
All three banks (`BANKS` map: `questions-og.json`, `questions.json`,
`questions-quant.json`) are **fetched together at boot and merged into one pool**
(`loadAll` → `App.all`, 910 questions, each tagged `q.bank`) — there is no bank
picker; the Sections UI decides which questions appear.
The original simple app is preserved as `prototypes/index-classic.html`;
`prototypes/ui-{focus,momentum,console,exam}.html` are earlier design explorations.

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
- **Vector features — run 100% in the browser, no backend** (since 2026-07):
  precomputed L2-normalized vectors ship in `embeddings.json` (built by
  `pipeline/build_index.py`, `{id: [384 floats]}`), loaded lazily by `loadEmbeddings()`;
  similarity is a plain dot product (`cosine`/`vecSimilar`/`vecSearch`). Free-text
  queries are embedded **on-device** with transformers.js (`Xenova/all-MiniLM-L6-v2`,
  lazy CDN import, browser-cached) — the same model used offline, so query and corpus
  vectors live in one space. Works on static hosts (Vercel); degrades silently if the
  model or `embeddings.json` can't load.
  - **Similar questions panel** — rendered into `#simPanelSlot` on answer submission in
    non-exam modes; 3 nearest questions across **all 910** (`vecSimilar` iterates
    `App.all`, which is the merged all-banks pool). Clicking jumps to the question if
    it's in the current session, else inserts it right after the current question.
  - **Smart search bar** (`#srchInput`) on Home — 400ms debounce; ranks all 910
    questions across the three banks (`vecSearch` over the merged `App.all`).
    Clicking a result starts a 1-question Practice session.

Edit the source directly for UI changes; do not regenerate it from the parser.
