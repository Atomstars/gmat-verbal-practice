#!/usr/bin/env python3
"""Test script to embed questions-og.json with all-MiniLM-L6-v2."""

import json
import time
from sentence_transformers import SentenceTransformer

print("Loading questions-og.json...")
with open("questions-og.json", "r", encoding="utf-8") as f:
    questions = json.load(f)

print(f"Loaded {len(questions)} questions.")

print("\nInitializing all-MiniLM-L6-v2 model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

print("\nPreparing text for embedding...")
texts_to_embed = []
for q in questions:
    parts = []
    if q.get("title"):
        parts.append(q["title"])
    if q.get("question"):
        parts.append(q["question"])
    if q.get("passage"):
        parts.append(q["passage"][:500])
    options_text = " ".join(
        opt.get("text", "") for opt in q.get("options", [])
    )
    if options_text:
        parts.append(options_text[:300])

    text = " ".join(parts)
    texts_to_embed.append(text[:1000])

print(f"Prepared {len(texts_to_embed)} texts.")
print(f"Sample text length: {len(texts_to_embed[0])} chars")

print("\nEmbedding questions...")
start = time.time()
embeddings = model.encode(texts_to_embed, show_progress_bar=True)
elapsed = time.time() - start
print(f"Completed in {elapsed:.2f}s ({len(questions)/elapsed:.1f} q/s)")

print("\nAdding embeddings to questions...")
for q, emb in zip(questions, embeddings):
    q["embedding"] = emb.tolist()

print(f"Sample embedding shape: {len(questions[0]['embedding'])} dimensions")
print(f"First 5 embedding values: {questions[0]['embedding'][:5]}")

print("\nSaving to questions_embedded.json...")
with open("questions_embedded.json", "w", encoding="utf-8") as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f"\nSuccess! Saved {len(questions)} questions with embeddings.")
print(f"File size: {(len(open('questions_embedded.json', 'rb').read()) / 1024 / 1024):.1f} MB")

# Verify by loading back
print("\nVerifying by loading back...")
with open("questions_embedded.json", "r", encoding="utf-8") as f:
    verify = json.load(f)
print(f"Loaded {len(verify)} questions with embeddings.")
print(f"First question has embedding: {'embedding' in verify[0]}")
