# Agent Playbook — PDF Figures → Questions → Searchable RAG

A step-by-step record of how this project turned a math PDF (with geometry
figures, tables, and charts) into a question bank whose **images are visible
to the user AND visible to vector search**. Written so any agent can repeat
the process on a similar task. The working implementation is in this repo:
`parse_quant.py`, `diagram_captions.json`, `gmat_parsing_common.py`,
`test_embeddings.py`, `api.py`, `index.html`.

**The one-line idea:** a text embedding model cannot see pictures. So every
figure is (a) cropped as a PNG for the user's eyes, and (b) described in a
short factual caption for the embedder's eyes. Same figure, two languages.
Nothing is ever "trained" — embeddings are zero-shot.

---

## Step 0 — Audit before building

Never trust existing extraction output. Two cheap checks found 10 broken
images out of 29 here:

1. **Hash every cropped image** (`md5`). Two records sharing a hash = the
   assignment logic is broken.
2. **Open every image next to its question text** and confirm they match.
   Dump `id | page | stem` to a text file, then view the PNGs in batches.

Also scan the text: look for section headings fused into stems/options,
ligatures (`ﬁ` instead of `fi`) in labels and IDs, and duplicate record IDs.

## Step 1 — Parse questions with positions

Use PyMuPDF (`fitz`) — you need per-span font size and (x, y) positions.

- Group text blocks into questions at numbered starts ("N."), but accept a
  number **only if N == previous + 1** (books number sequentially). Without
  this guard, a stem containing a wrapped number ("...in excess of\n40. What
  was...") splits into a fake question that steals another's answer.
- Skip section-heading blocks (detect by large font, e.g. >11pt vs 9.5pt
  body) or they fuse into the previous question's last option.
- Normalize ligatures/smart-dashes to ASCII **before** deriving IDs/labels.
- Record each question's start position `(page_index, y)` — Step 3 needs it.
- Verify answers with two independent signals (answer key + solution text).
  If they disagree, ship `null` and flag for review. **Never guess.**

## Step 2 — Detect and crop figures

`page.get_drawings()` returns vector strokes/fills. Cluster nearby rects
(merge when inflated by ~12pt they touch) — one cluster = one figure. Crop
via `page.get_pixmap(matrix=fitz.Matrix(200/72, 200/72), clip=bbox+padding)`.

Four traps that each caused a real bug here:

| Trap | Fix |
|---|---|
| `rect.is_empty` is True for pure line strokes → line-only figures vanish | Skip only true points; pad degenerate rects to 0.6pt |
| Invisible white background fills extend past the figure into text | Skip fills with all components ≥ 0.95 (keep gray = shading) |
| Page-wide rules join clusters | Drop rects with width > 0.7 × page width and height < 3 |
| Stacked option fraction-bars look like a figure | Reject clusters where every member's height ≤ 3.5pt |

Labels ("A", "30°", "4√2") are TEXT, not drawings — absorb nearby short text
lines (≤8 chars, not starting with `(`, not `NNN.`, not in the header zone,
not >8pt below the figure) within a ~14pt halo. No chained growth.

## Step 3 — Attach each figure to the right question

**Do not** give all page drawings to all questions on the page, and do not
keyword-match stems ("circle", "figure"). Use interval ownership:

1. Sort questions by start `(page, y)`.
2. Question *i* owns the span from its start to question *i+1*'s start
   (tuple comparison lets intervals cross page boundaries — figures often
   land on the next page).
3. Cap the interval at the end of the page after the start page.
4. A figure belongs to whichever interval contains its y-midpoint.

Deterministic, and correctly gives NO image to questions that have none.

## Step 4 — Caption every figure

Look at each PNG with its stem as context (agents are vision-capable — just
Read the image) and write a **factual** description: shapes, labels, given
measurements, what is shaded. For tables/charts: transcribe the title,
column/axis labels, and values. No interpretations, no answer hints.

Store captions in a **sidecar file** (`diagram_captions.json`) keyed by
question id, with a `source` field marking them machine-derived. The parser
merges the sidecar into a `diagram_description` field at parse time — so
re-parsing never destroys caption work, and the caption never masquerades as
book content. The PNG stays the displayed source of record.

## Step 5 — Embed with the caption INSIDE the text

Build each question's embedding input as:

```
title + question + diagram_description + passage + options
```

The caption goes **right after the question**, because small embedders
(all-MiniLM-L6-v2) truncate at ~256 tokens — a caption appended at the end
contributes nothing. Re-embed all records after any text change.

## Step 6 — Serve one merged index

`test_embeddings.py` loads ALL bank files, tags each record with a `bank`
key matching the app's source map, re-embeds uniformly, and writes
`questions_embedded.json` (gitignored — regenerate, don't commit).
`api.py` loads it into in-memory Qdrant and exposes `/search` and
`/search-similar/{id}` with an optional `?bank=` payload filter. Results
carry `bank` + a `stem` snippet so the UI can render/open cross-bank hits.

## Step 7 — Prove it works end-to-end

1. **Retrieval smoke test**: query something only the FIGURE contains —
   "shaded ring between two circles" must surface the unlabeled annulus
   figure whose stem never says "ring". If it does, search can see pictures.
2. **UI test**: answer a diagram question → similar-questions panel shows
   sensible neighbors; search from another bank → cross-bank hit opens with
   its diagram; zero console errors.
3. **Re-run the whole visual audit** (Step 0) after every heuristic change —
   extraction fixes regress each other silently.
4. Run the schema validation + test suite.

## Ground rules (this project's non-negotiables)

- **Never invent or alter question/answer content.** Unconfirmable → `null`.
- Captions are derived metadata for search only — never displayed as source.
- Regenerate `questions_embedded.json` after any parser re-run.
- Update `CLAUDE.md` / `HANDOFF.md` with any hard-won parsing rule so the
  next agent doesn't re-learn it the expensive way.
