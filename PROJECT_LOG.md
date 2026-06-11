# PROJECT_LOG — how this app came to be

A narrative of the build, in order, with the decisions and why. (For current state +
next steps, see [HANDOFF.md](HANDOFF.md).)

## 0 · Starting point
The repo already had a Manhattan *All the Verbal* parser (`parse_pdf` + `parse_epub`,
cross-checked) producing `questions.json` (64 CR+RC) and a simple single-question app
(now preserved as `index-classic.html`). The guiding rule from day one:
**never invent or alter a question/answer.**

## 1 · Official Guide extraction (the big data win)
Goal: extract Verbal from the *GMAT Official Guide 2024-2025* (Focus Edition), a
1,084-page PDF. Findings & decisions:
- Verbal is all of **Chapter 8**, in six clean sub-sections (8.4–8.9). Located by
  **heading text**, not page numbers (robust to edition).
- pdfplumber mangled this file (ligatures → `scienti ic`, quotes → `�`); switched the
  backend to **PyMuPDF (`fitz`)**, which returns clean Unicode.
- Built `parse_og`. Two independent answer signals **inside one PDF**: the numbered
  answer key and the explanation's "Correct." marker. Cross-checking them is the
  anti-hallucination guarantee here. Result: **346/346 confirmed, 0 conflicts.**
- Each section **spills onto the next section's first page** — handled by reading one
  page past each boundary and stopping at the next heading.
- Decision: keep OG in a **separate** `questions-og.json` (clean provenance, no
  chapter-number collisions), and add a source selector to the app.

## 2 · UI exploration — four directions
Built four standalone design directions so the user could choose a feel:
`ui-focus.html` (calm editorial reader), `ui-momentum.html` (gamified mobile),
`ui-console.html` (data dashboard), `ui-exam.html` (GMAT Focus exam replica).
The user picked the **exam-style** direction as the base.

## 3 · Sub-typing the questions (for filtering & analytics)
The user wanted to filter by question type (Inference, Weaken, …). Decision that
respected the no-invent rule:
- **RC**: use the book's **own printed type label** from each explanation
  (Main Idea / Supporting Idea / Inference / Application / Evaluation / Logical
  Structure) — 164/164, source-faithful.
- **CR**: the book only prints 3 broad buckets, so the finer task
  (Weaken/Strengthen/Assumption/…) is **inferred from the stem wording** via ordered
  keyword rules — ~88% classified, the rest honestly left `"Unclassified"`.

## 4 · The unified Trainer app — Phase 1
Rebuilt the app into "GMAT Verbal Trainer" with a dashboard + modes. Key call:
the user wanted streaks, redo-failed, and cross-session analytics — which require
**persistence**. We added **localStorage** behind a `Store` abstraction (a reversal of
the classic app's session-only design), written to be **Supabase-ready**.
Delivered: dashboard, weakness analytics by sub-type/difficulty, Practice (filters +
a type badge revealed only *after* answering so it isn't a hint), Redo-my-misses,
Target-weak-spots, Exam simulation, Export/Import/Reset, a syllabus card.

## 5 · Adaptive modes — Phase 2
Added the two adaptive passage modes the user wanted:
- **One RC a day** — a daily passage; next day's difficulty adapts to today's score;
  builds a streak.
- **GMAT RC column** — continuous passages that promote/demote by performance.
Shared rule: after a passage, ≥75% → harder, <50% → easier, else hold. Verified the
promote/demote transitions and streak persistence.

## 6 · Multi-page redesign + a real navigation bug
The user wanted it to feel like a real app — a landing page and distinct pages that
swap. Rebuilt with a landing page, polished dashboard, dedicated setup/runner/report
screens, a design system, and page transitions. Then the user reported it still felt
like "one page." Root cause: `#landing { display:flex }` (an **ID** rule) outranked
`.screen { display:none }`, so the landing never hid and other screens stacked beneath
it. Fixed by moving the layout to `#landing.on`. Now exactly one screen shows at a time.

## 7 · Ship it
- Committed and pushed to **GitHub** (private repo `Atomstars/gmat-verbal-practice`).
- Deployed to **Vercel** as **gmat-prep** (`https://gmat-prep-ivory.vercel.app`),
  GitHub-connected for auto-deploy. The user chose a **public** deployment (aware of the
  copyright trade-off). Vercel auto-enabled Deployment Protection (401); disabling it is
  a one-toggle dashboard step left to the user (see HANDOFF open items).

## 8 · Readability pass — paragraphs + report context (2026-06-11)
User report: passages and explanations rendered as **walls of text** — "everything is
combined," answer-choice letters buried mid-paragraph. Root cause: `clean()` collapsed
every newline to a space, so all paragraph structure was lost (the *content* was always
correct). Fixes, all formatting-only (no answer changed):
- Added `clean_paras()` (clean each paragraph, join with a blank line).
- **OG passages:** the PDF indents each paragraph's first line with an em-space (U+2003);
  `_og_parse_rc_practice` now splits on it. 130/164 are multi-paragraph; the other 34 are
  genuinely single paragraphs in the book (verified against the PDF).
- **OG explanations:** `_og_format_explanation` drops the redundant restated question +
  options (the app already shows them), then lays out the category heading, the CR
  `Situation`/`Reasoning` sub-headings, each per-choice note, and the answer line as
  separate paragraphs. The category line is a 100%-present, reliable divider (346/346).
- **Manhattan:** the EPUB is the better-formatted extraction (indent-marked paragraphs +
  `<p>` explanations). `merge_format_from_oracle` borrows that layout onto the PDF-primary
  records **without changing a PDF answer** — passages transfer when the text matches;
  explanations transfer only when the EPUB answer agrees (so `rc-ch15-q9`, the one known
  conflict where PDF=C is correct, keeps its PDF explanation).
- **App:** `fetch(..., {cache:"no-cache"})` so regenerated JSON isn't served stale. Added
  to the **report**: a per-question **⏱ time pill**, an **Avg/question** card, and a
  collapsible **📖 Reading passage** per RC item (so misses can be reviewed in full
  context). Per-question timing itself was already tracked in `App.qTimes`.

## Recurring principles
- **Source-faithful or `null`.** Every answer is the book's; the one inferred field
  (CR task) degrades to `"Unclassified"` rather than guess.
- **Cross-validate.** Two independent signals agreeing is how we trust the data.
- **No build, one file.** The app stays a hand-editable single file; edit it directly.
