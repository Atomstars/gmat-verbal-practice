# TECH_STACK

Deliberately minimal: no build step, no framework, no backend (yet). Everything is
plain files you can open and run.

## At a glance
| Layer | Choice | Why |
|---|---|---|
| Extraction | **Python 3** | One script, no packaging. |
| PDF parse (Manhattan) | **pdfplumber** | Linear page text + structural anchors. |
| EPUB parse (Manhattan) | **BeautifulSoup + lxml** | Structured XHTML; independent cross-check oracle. |
| PDF parse (Official Guide) | **PyMuPDF (`fitz`)** | Clean Unicode — pdfplumber mangles this file's ligatures/quotes. |
| Data | **JSON** (`questions*.json`) | Flat array, one schema both books share. |
| Frontend | **Vanilla HTML/CSS/JS**, single file | Zero build, opens anywhere, easy to reason about. |
| State / persistence | **localStorage** via a `Store` abstraction | Per-device save; swappable for a DB backend. |
| Local serving | `python -m http.server` | The app `fetch()`es JSON, so `file://` won't work. |
| Source control | **Git + GitHub** (private) | `github.com/Atomstars/gmat-verbal-practice`. |
| Hosting | **Vercel** (static) | Project `gmat-prep`, GitHub-connected auto-deploy. |

There are **no tests and no build**. "Validation" = re-running `parser.py` and reading
its printed coverage + cross-validation report.

## Pipeline
```
Manhattan PDF/EPUB  ─┐
                     ├─ parser.py ─┬─ questions.json      ─┐
GMAT Official Guide ─┘  (--og)     └─ questions-og.json   ─┴─ index.html ─ (Vercel)
   (PDF, fitz)
```

## Parser architecture (`parser.py`)
Three backends, **one JSON schema**:
- `parse_pdf` (pdfplumber) + `parse_epub` (bs4) for Manhattan; `cross_check()` compares
  the two independent extractions — agreement is the anti-hallucination guarantee.
- `parse_og` (fitz) for the Official Guide: locates Chapter 8's six sub-sections by
  heading text (8.4–8.9), reads the **numbered answer key** as authoritative, and
  cross-checks it against the **explanation's "Correct." marker** within the same PDF.
  Sub-types: RC = the book's printed type label (verbatim); CR = a task inferred from
  the stem wording (`_OG_CR_RULES`), `"Unclassified"` when uncertain.

## App architecture (`index.html`)
A hand-rolled single-page app — no router library:
- **Screens** are `<section class="screen">` blocks (`landing`, `dash`, `setup`, `run`,
  `report`). `show(id)` toggles a `.on` class; CSS shows exactly one at a time. Layout
  that must differ per screen goes on `#id.on` (never a bare `#id { display }` — that
  breaks hiding; see HANDOFF gotchas).
- **`Store`** (IIFE) — the only thing that touches persistence. Records per-question
  history, daily streak/level, adaptive column level; exposes `record`, `overall`,
  `byField`, `wrongIds`, `adaptLevel`, daily/column helpers, export/import/reset.
  Built so a Supabase backend can replace it without touching the UI.
- **Adaptive engine** — `buildPassages()` groups RC into passages (OG: 36 = 11/13/12 by
  difficulty); after a passage, `adaptLevel`: ≥75% → harder, <50% → easier, else stay.
  Drives both Daily RC and the GMAT column.
- **Analytics** — accuracy aggregated by `subtype` (RC type / CR task) and `difficulty`,
  with a weakest-area callout.

## Schema (both files)
`id, type (CR|RC), chapter, title, question, passage (RC only), options[{label,text}],
correct_answer, explanation, format`. OG adds `subtype, category, difficulty, number,
source`. The app reads either file; unknown keys are ignored.
