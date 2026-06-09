# Coverage note — GMAT Verbal extraction

> **Two books, two files.** `questions.json` is the Manhattan extraction (below).
> `questions-og.json` is the **GMAT Official Guide 2024-2025 (Focus Edition)**
> extraction — see the dedicated section at the end. The app switches between them.

---

## Manhattan "All the Verbal"

**Source book:** *GMAT All the Verbal* (Manhattan Prep, 6th ed.).
The same book is present on this machine as **both** a 799‑page PDF and an EPUB.
`parser.py` parses the **PDF** (the file in the brief) and uses the EPUB as an
independent **cross‑check** — two separate extractions agreeing is the strongest
guarantee that no question or answer was hallucinated.

## What shipped in `questions.json`

**64 problems — every one with a verified‑correct answer:**

| Section | Chapters | Questions | Confirmed answers |
|---|---|---:|---:|
| Critical Reasoning (CR) | 18–22 | 32 | 32 / 32 |
| Reading Comprehension (RC) | 13–15 | 32 | 32 / 32 |
| **Total** | | **64** | **64 / 64** |

Each record has the full prompt, 5 answer choices (A–E), the correct answer,
the prose explanation, and — for RC — the reading passage. RC questions carry
their passage (7 unique passages across the 32 questions).

## How answers were inferred (never guessed)

- **CR** — the book's solution states *"\<Title\>: The correct answer is (X)."*
  Read verbatim; this is the book's own answer key.
- **RC** — the answer analysis marks one labelled choice *"(X) … CORRECT."*
  The marked choice is the answer. Where the per‑chapter CORRECT‑marker count
  matched the question count, answers were also assigned positionally and the
  two methods agreed.
- If a signal was missing or ambiguous, the answer was left `null` (the item is
  then excluded), rather than guessed.

## Validation performed

1. **Self‑consistency** — every CR answer matches the "correct answer is (X)"
   line in its own explanation; every RC answer's option text is the one
   immediately followed by `CORRECT` in the solution. 64/64 pass, 0 wrong.
2. **Cross‑source** — PDF vs EPUB agreed on **50** shared answers with **one**
   discrepancy: `rc-ch15-q9` (PDF = **C**, EPUB = E). Checked against the book:
   the solution reads *"(C) support a general contention with a specific example
   **CORRECT.**"* → **C is correct; the EPUB extraction was wrong.** The shipped
   file uses the PDF value (C). The cross‑check did its job and caught a real error.

## What was deliberately **excluded**

- **Sentence Correction (Ch. 2–9, ~27 drills).** Two reasons:
  1. **It is no longer on the GMAT.** The current exam (GMAT Focus Edition, the
     sole format since Feb 2024) dropped SC entirely; Verbal is now **only CR
     and RC**. (Heads‑up, since the brief targeted SC practice.)
  2. The book's SC items are 2–3 option teaching drills whose *prose* solutions
     have **no reliable answer key**, so answers couldn't be confirmed without
     guessing. Per the brief, correctness beats volume.
- **Open‑ended teaching exercises** ("circle the redundant words", etc.) — no
  answer key and they don't fit a multiple‑choice practice flow.
- **Chapters 1, 10, 16, 17** — instructional / open‑ended only, no clean MC set.

## Running the parser

```bash
pip install pdfplumber beautifulsoup4 lxml
python parser.py "….../GMAT All the Verbal.pdf" \
  --epub "….../GMAT All the Verbal.epub"      # --epub optional (enables cross-check)
```

Prints a coverage summary + the cross‑validation report and writes
`questions.json`. (The EPUB‑only path also works: `python parser.py book.epub`.)

## Running the app

```bash
python -m http.server 8000      # from this folder
# open http://localhost:8000  (a server is needed so the page can fetch questions.json)
```

---

# GMAT Official Guide 2024-2025 (Focus Edition) — `questions-og.json`

**Source book:** *GMAT Official Guide 2024-2025* (Wiley/GMAC, ISBN 978-1-394-26002-7),
the 1,084-page Focus Edition PDF. Verbal lives entirely in **Chapter 8**. Parsed by
`parse_og` in `parser.py` using **PyMuPDF** (pdfplumber mangles this file's
ligatures and smart punctuation; fitz does not).

## What shipped in `questions-og.json`

**346 problems — every one with a verified-correct answer:**

| Section | Book Q# | Questions | Confirmed answers |
|---|---|---:|---:|
| Reading Comprehension (RC) | 456–619 | 164 | 164 / 164 |
| Critical Reasoning (CR) | 620–801 | 182 | 182 / 182 |
| **Total** | | **346** | **346 / 346** |

Each record has the full prompt, 5 answer choices (A–E), the correct answer, the
book's prose explanation, a `difficulty` band (Easy/Medium/Hard, from the book's own
headers), the book `number`, and — for RC — the reading passage (36 unique passages
mapped to their question ranges via "Questions X–Y refer to the passage").

## How answers were inferred (never guessed)

Two **independent** signals inside the one PDF, cross-checked against each other:

1. **Numbered Answer Key** (§8.5 / §8.8) — `NNN. X` lines; the book's authoritative
   key, complete and contiguous over both ranges. This is the shipped answer.
2. **Answer-explanation marker** (§8.6 / §8.9) — the correct choice is tagged
   `(X)… Correct.`, and CR explanations also end `The correct answer is X.`

If the two disagreed, the answer would be set to `null` and reported as a conflict —
nothing is guessed. (The key/marker reconciliation mirrors the Manhattan book's
PDF-vs-EPUB cross-check, but here both signals come from the same file.)

## Validation performed

- **Intra-file cross-validation:** numbered key vs explanation marker —
  **346 present in both, 346 agree, 0 conflicts, 0 left null.**
- **Structural checks:** every question has exactly options A–E; every shipped
  answer letter is one of that question's options; RC question numbers 456–619 and
  CR 620–801 are contiguous and match the key 1:1 (no gaps, no duplicates); every RC
  question is covered by exactly one passage; no page-furniture leaked into
  question/option/explanation/passage text.
- **App check:** loads in `index.html` via the source selector; reveal flow, scoring
  by type, passage display, and switching between the two banks all verified.

## What was deliberately **excluded**

- **Sentence Correction** — not in the Official Guide's Verbal section at all (the
  Focus Edition removed SC from the exam). Verbal here is **only RC and CR**.
- **The online question bank** — out of scope; only the printed Chapter 8 Verbal
  questions (whose answers are confirmable from the book's key) are extracted.

## Running the OG parser

```bash
pip install pymupdf                      # in addition to the Manhattan deps
python parser.py --og "…/gmat-official-guide-2024-2025-…compress.pdf"
```

Prints the coverage + intra-file cross-validation report and writes
`questions-og.json`. Leaves `questions.json` untouched.
