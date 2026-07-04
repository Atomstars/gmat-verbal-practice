#!/usr/bin/env python3
"""Unified index builder: embed ALL question banks into questions_embedded.json.

Reads questions-og.json, questions.json, questions-quant.json; tags each record
with its bank; embeds any question that lacks an embedding (all-MiniLM-L6-v2);
writes the merged questions_embedded.json consumed by api.py.
"""

import json
import os
import time

from sentence_transformers import SentenceTransformer

BANKS = [
    ("questions-og.json", "og"),
    ("questions.json", "manhattan"),
    ("questions-quant.json", "quant"),
]

OUT_FILE = "questions_embedded.json"


def embed_text(q):
    """Same recipe as parser.embed_questions: title + question + passage + options."""
    parts = []
    if q.get("title"):
        parts.append(q["title"])
    if q.get("question"):
        parts.append(q["question"])
    if q.get("passage"):
        parts.append(q["passage"][:500])
    options_text = " ".join(opt.get("text", "") for opt in q.get("options", []))
    if options_text:
        parts.append(options_text[:300])
    return " ".join(parts)[:1000]


def main():
    all_questions = []
    for path, bank in BANKS:
        if not os.path.exists(path):
            print(f"[WARN] {path} not found - skipping bank '{bank}'")
            continue
        with open(path, encoding="utf-8") as f:
            qs = json.load(f)
        for q in qs:
            q["bank"] = bank
        have = sum(1 for q in qs if q.get("embedding"))
        print(f"Loaded {path}: {len(qs)} questions ({have} already embedded)")
        all_questions.extend(qs)

    if not all_questions:
        raise SystemExit("No question banks found.")

    missing = [q for q in all_questions if not q.get("embedding")]
    if missing:
        print(f"\nEmbedding {len(missing)} questions with all-MiniLM-L6-v2...")
        model = SentenceTransformer("all-MiniLM-L6-v2")
        texts = [embed_text(q) for q in missing]
        start = time.time()
        embeddings = model.encode(texts, show_progress_bar=True)
        print(f"Done in {time.time() - start:.1f}s")
        for q, emb in zip(missing, embeddings):
            q["embedding"] = emb.tolist()
    else:
        print("\nAll questions already embedded - nothing to compute.")

    # sanity: ids unique across banks
    ids = [q["id"] for q in all_questions]
    assert len(ids) == len(set(ids)), "Duplicate question ids across banks!"

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False)

    size_mb = os.path.getsize(OUT_FILE) / 1024 / 1024
    print(f"\n[OK] Wrote {OUT_FILE}: {len(all_questions)} questions, {size_mb:.1f} MB")
    by_bank = {}
    for q in all_questions:
        by_bank[q["bank"]] = by_bank.get(q["bank"], 0) + 1
    for bank, n in by_bank.items():
        print(f"  {bank}: {n}")


if __name__ == "__main__":
    main()
