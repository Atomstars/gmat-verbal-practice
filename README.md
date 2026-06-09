# GMAT Verbal Practice

A personal, fair-use GMAT **Verbal** (Reading Comprehension + Critical Reasoning)
practice app. A Python parser extracts real questions from GMAT prep books into JSON,
and a single-file web app is a mobile-friendly practice UI over that data.

> **Personal / fair-use only — not for distribution.** The source books are **not**
> in this repo. Questions are extracted verbatim; nothing is invented or altered, and
> anything unconfirmable is left `null` rather than guessed. Correctness over volume.

## Question banks

| File | Source | Questions | Answers confirmed |
|---|---|---:|---:|
| `questions.json` | Manhattan Prep — *All the Verbal* (6th ed.) | 64 (CR + RC) | 64 / 64 |
| `questions-og.json` | *GMAT Official Guide 2024-2025* (Focus Edition) | 346 (RC + CR) | 346 / 346 |

Every answer is verified against the book's own answer key and independently
cross-checked (PDF-vs-EPUB for Manhattan; numbered key vs answer-explanation marker
for the Official Guide). See [`COVERAGE.md`](COVERAGE.md) for the full validation
report and [`CLAUDE.md`](CLAUDE.md) for the parser architecture.

## Usage

```bash
pip install pdfplumber beautifulsoup4 lxml pymupdf

# Manhattan -> questions.json   (PDF is source of record; --epub adds cross-check)
python parser.py "<All the Verbal>.pdf" --epub "<All the Verbal>.epub"

# Official Guide -> questions-og.json
python parser.py --og "<official-guide-2024-2025>.pdf"

# Run the app (a local server is required; the page fetch()es the JSON)
python -m http.server 8000        # then open http://localhost:8000
```

In the app, the **source selector** switches between the two banks; filter by type
(CR/RC) and chapter/difficulty, and Reveal shows the correct answer plus the book's
explanation. Session-only stats — nothing is saved.
