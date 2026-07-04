#!/usr/bin/env python3
"""Retrieval eval harness: measures whether "similar" is actually similar.

Reads questions_embedded.json (unified index) and, for every question, ranks
its same-bank neighbors by cosine similarity (the same signal api.py serves).
No labels exist for "true similarity", so we score proxies:

  - type consistency@k   : % of top-k neighbors sharing the query's type
  - chapter consistency@k: % sharing the query's chapter/topic
  - top-1 score stats    : how confident the nearest neighbor is
  - weak queries         : questions whose best neighbor scores < WEAK
  - near-duplicates      : neighbor pairs scoring > DUP (book reprints, parser bugs)

Run after rebuilding the index: python eval_retrieval.py
"""

import json
import sys
from collections import defaultdict

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

K = 5
WEAK = 0.40
DUP = 0.95


def main():
    with open("questions_embedded.json", encoding="utf-8") as f:
        questions = json.load(f)

    qs = [q for q in questions if q.get("embedding")]
    print(f"Loaded {len(qs)}/{len(questions)} embedded questions\n")

    vecs = np.array([q["embedding"] for q in qs], dtype=np.float32)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    sims = vecs @ vecs.T
    np.fill_diagonal(sims, -1.0)

    banks = np.array([q.get("bank") or "?" for q in qs])
    types = np.array([q.get("type") or "?" for q in qs])
    chapters = np.array([q.get("chapter") or "?" for q in qs])

    stats = defaultdict(lambda: {"type_hits": 0, "chap_hits": 0, "n": 0, "top1": [], "weak": []})
    dups = []

    for i in range(len(qs)):
        mask = banks == banks[i]
        mask[i] = False
        idxs = np.where(mask)[0]
        if len(idxs) < K:
            continue
        order = idxs[np.argsort(-sims[i, idxs])][:K]

        s = stats[banks[i]]
        s["n"] += 1
        s["type_hits"] += int((types[order] == types[i]).sum())
        s["chap_hits"] += int((chapters[order] == chapters[i]).sum())
        top1 = float(sims[i, order[0]])
        s["top1"].append(top1)
        if top1 < WEAK:
            s["weak"].append(qs[i]["id"])
        if top1 > DUP and qs[i]["id"] < qs[order[0]]["id"]:
            dups.append((qs[i]["id"], qs[order[0]]["id"], top1))

    print(f"{'bank':<10} {'n':>4} {'type@5':>8} {'chapter@5':>10} {'top1 mean':>10} {'top1 med':>9} {'weak<0.4':>9}")
    for bank, s in stats.items():
        t1 = np.array(s["top1"])
        print(
            f"{bank:<10} {s['n']:>4} "
            f"{s['type_hits'] / (s['n'] * K):>7.1%} "
            f"{s['chap_hits'] / (s['n'] * K):>9.1%} "
            f"{t1.mean():>10.3f} {np.median(t1):>9.3f} {len(s['weak']):>9}"
        )

    print(f"\nNear-duplicate pairs (cosine > {DUP}):")
    if not dups:
        print("  none")
    for a, b, sc in sorted(dups, key=lambda x: -x[2]):
        print(f"  {sc:.4f}  {a}  <->  {b}")

    print("\nWeakest queries (top-1 < 0.4) per bank:")
    for bank, s in stats.items():
        if s["weak"]:
            print(f"  {bank}: {', '.join(s['weak'][:8])}{' ...' if len(s['weak']) > 8 else ''}")
        else:
            print(f"  {bank}: none")


if __name__ == "__main__":
    main()
