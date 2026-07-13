# GMAT Trainer

A personal, fair-use GMAT practice app covering **Verbal** (RC + CR) and
**Quantitative** (PS + DS). A Python pipeline extracts real, answer-verified
questions from GMAT prep books into JSON; a single-file web app (`index.html`)
is the study UI over that data — including fully in-browser semantic search
(transformers.js + precomputed embeddings), so it runs on any static host.

> **Personal / fair-use only — not for distribution.** The source books are **not**
> in this repo. Questions are extracted verbatim; nothing is invented or altered, and
> anything unconfirmable is left `null` rather than guessed. Correctness over volume.

## Repository layout

```
/                      the deployable static app (what Vercel serves)
├── index.html         the entire app — HTML/CSS/JS, no build step
├── questions*.json    3 question banks (910 questions total)
├── embeddings.json    precomputed 384-dim vectors for in-browser search
├── diagrams/          32 cropped figure PNGs for quant questions
├── start-app.bat      double-click launcher (serves over http + opens browser)
├── pipeline/          Python toolchain: parsers, embedding builder, eval, optional API
├── web/               Next.js (React + TS) migration in progress — `npm run dev` inside web/
├── tests/             pytest regression suite for the parsers + schema
├── docs/              design + reference docs (see docs/DESIGN.md)
└── prototypes/        earlier UI explorations (kept for reference)
```

## Question banks

| File | Source | Questions | Answers confirmed |
|---|---|---:|---:|
| `questions-og.json` | *GMAT Official Guide 2024-2025* (Focus Edition) | 346 (RC + CR) | 346 / 346 |
| `questions.json` | Manhattan Prep — *All the Verbal* (6th ed.) | 64 (CR + RC) | 64 / 64 |
| `questions-quant.json` | Manhattan Review — *Quant Question Bank* (6th ed.) | 500 (PS + DS) | 496 / 500* |

*4 genuine book conflicts shipped as `needs_review: true` with `correct_answer: null`.

Every answer is verified against the book's own answer key **and** independently
cross-checked (PDF-vs-EPUB for Manhattan; answer key vs explanation marker for the
OG and Quant books). See [docs/COVERAGE.md](docs/COVERAGE.md) for the validation
report and [CLAUDE.md](CLAUDE.md) for parser architecture.

## Run the app

```bash
# Easiest (Windows): double-click start-app.bat
# Or any static server from the repo root:
python -m http.server 8000        # then open http://localhost:8000
```

A local server is required — the app `fetch()`es its JSON, which browsers block
over `file://`. Progress is saved in localStorage; optional Supabase sign-in
syncs it across devices.

## Rebuild the data (needs the source books)

```bash
pip install -r requirements.txt

python pipeline/parser.py "<All the Verbal>.pdf" --epub "<All the Verbal>.epub"
python pipeline/parser.py --og "<official-guide-2024-2025>.pdf"
python pipeline/parse_quant.py "<MR-quant-question-bank>.pdf"

# Rebuild the vector index after any parser re-run
python pipeline/build_index.py    # writes questions_embedded.json + embeddings.json
```

## Architecture

See **[docs/DESIGN.md](docs/DESIGN.md)** for the high-level and low-level design,
[docs/TECH_STACK.md](docs/TECH_STACK.md) for the stack, and
[HANDOFF.md](HANDOFF.md) for current status.
