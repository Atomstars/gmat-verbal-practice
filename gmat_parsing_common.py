"""
gmat_parsing_common.py — Shared text-processing and embedding utilities.

Imported by both parser.py (Verbal) and parse_quant.py (Quant) so that
clean()/norm()/clean_paras() and embed_questions() have exactly one
implementation.  Each parser also has its own PDF-specific helpers that
live only in that file (e.g. parse_quant's _clean() strips TeX control
characters that are specific to the Quant PDF).
"""

from __future__ import annotations

import re

# --------------------------------------------------------------------------- #
# Smart-quote / ligature / dash normalisation map
# --------------------------------------------------------------------------- #

SMART: dict[str, str] = {
    "‘": "'",  # left single quotation mark
    "’": "'",  # right single quotation mark
    "‚": ",",  # single low-9 quotation mark
    "‛": "'",  # single high-reversed-9 quotation mark
    "“": '"',  # left double quotation mark
    "”": '"',  # right double quotation mark
    "„": '"',  # double low-9 quotation mark
    "–": "-",  # en dash
    "—": "-",  # em dash
    "…": "...",  # horizontal ellipsis
    "−": "-",  # minus sign
    " ": " ",  # non-breaking space
    "​": "",  # zero-width space
    "﻿": "",  # BOM / zero-width no-break space
    "": "->",  # private-use arrow (some PDF fonts)
    "ﬁ": "fi",  # fi ligature
    "ﬂ": "fl",  # fl ligature
    "­": "",  # soft hyphen
}


def clean(text: str | None) -> str:
    """Normalise smart quotes/dashes/ligatures and collapse whitespace."""
    if not text:
        return ""
    for k, v in SMART.items():
        text = text.replace(k, v)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def norm(s: str | None) -> str:
    """Strip punctuation, collapse whitespace, lowercase — for fuzzy matching."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w ]", "", s or "")).strip().lower()


def clean_paras(paras: list[str]) -> str:
    """clean() each paragraph and join with a blank line, dropping empties.

    Preserves paragraph structure that clean() alone would flatten.
    Used for RC passages and explanation blocks.
    """
    out = [clean(p) for p in paras]
    return "\n\n".join(p for p in out if p)


# --------------------------------------------------------------------------- #
# Embedding (shared by both parsers and api.py)
# --------------------------------------------------------------------------- #


def embed_questions(questions: list[dict]) -> list[dict]:
    """Add an 'embedding' field (384-dim all-MiniLM-L6-v2) to each question.

    Gracefully skips with a warning if sentence-transformers is not installed
    so the parser's core JSON output is unaffected.

    Input text per question: title + question + passage[:500] + options[:300],
    capped at 1000 chars.  The model's internal truncation handles overflow.
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("WARNING: sentence-transformers not installed. Skipping embeddings.")
        print("Install with: pip install sentence-transformers")
        return questions

    print("\nEmbedding questions with all-MiniLM-L6-v2...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    texts: list[str] = []
    for q in questions:
        parts: list[str] = []
        if q.get("title"):
            parts.append(q["title"])
        if q.get("question"):
            parts.append(q["question"])
        if q.get("passage"):
            parts.append(q["passage"][:500])
        options_text = " ".join(opt.get("text", "") for opt in q.get("options", []))
        if options_text:
            parts.append(options_text[:300])
        texts.append(" ".join(parts)[:1000])

    embeddings = model.encode(texts, show_progress_bar=True)
    for q, emb in zip(questions, embeddings):
        q["embedding"] = emb.tolist()

    print(f"Embedded {len(questions)} questions.")
    return questions
