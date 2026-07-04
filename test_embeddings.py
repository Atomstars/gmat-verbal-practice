#!/usr/bin/env python3
"""Build questions_embedded.json — the vector-search index over ALL THREE banks.

Reads questions-og.json + questions.json + questions-quant.json, tags each
record with its `bank` key (matching the SOURCES map in index.html so the app
can resolve results to the right file), re-embeds every question with the
shared recipe in gmat_parsing_common.embed_questions (which includes quant
diagram_description text), and writes the merged questions_embedded.json that
api.py loads at startup.

Run this after re-generating any of the three bank files.
"""

import json
import os

from gmat_parsing_common import embed_questions

# bank key -> file; keys MUST match the SOURCES map in index.html
BANKS = {
    "og": "questions-og.json",
    "manhattan": "questions.json",
    "quant": "questions-quant.json",
}

all_q = []
for bank, path in BANKS.items():
    if not os.path.exists(path):
        print(f"WARNING: {path} not found — skipping bank '{bank}'")
        continue
    with open(path, encoding="utf-8") as f:
        qs = json.load(f)
    for q in qs:
        q["bank"] = bank
    print(f"{path}: {len(qs)} questions (bank='{bank}')")
    all_q.extend(qs)

ids = [q["id"] for q in all_q]
assert len(ids) == len(set(ids)), "duplicate question ids across banks"

# Re-embed everything so all banks share one uniform text recipe (title +
# question + diagram_description + passage + options) regardless of which
# parser version produced the bank file.
for q in all_q:
    q.pop("embedding", None)
all_q = embed_questions(all_q)

out = "questions_embedded.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(all_q, f, ensure_ascii=False)

embedded = sum(1 for q in all_q if q.get("embedding"))
size_mb = os.path.getsize(out) / 1024 / 1024
print(f"Saved {len(all_q)} questions ({embedded} embedded) to {out} ({size_mb:.1f} MB)")
