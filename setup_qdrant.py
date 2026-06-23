#!/usr/bin/env python3
"""
Setup Qdrant locally and load embedded questions.
Creates an in-memory Qdrant instance for development.
For production, use Docker or Qdrant Cloud.
"""

import json
import time
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

print("Loading questions_embedded.json...")
with open("questions_embedded.json", "r", encoding="utf-8") as f:
    questions = json.load(f)

print(f"Loaded {len(questions)} embedded questions.")

print("\nInitializing in-memory Qdrant...")
client = QdrantClient(":memory:")

COLLECTION_NAME = "gmat_questions"
EMBEDDING_DIM = 384

print(f"Creating collection '{COLLECTION_NAME}' with {EMBEDDING_DIM}-dim vectors...")
client.recreate_collection(
    collection_name=COLLECTION_NAME,
    vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
)

print("\nPreparing points for upload...")
points = []
for idx, q in enumerate(questions):
    embedding = q.get("embedding")
    if not embedding:
        print(f"WARNING: Question {q['id']} has no embedding, skipping")
        continue

    payload = {
        "id": q["id"],
        "type": q.get("type"),
        "question": q.get("question", "")[:500],
        "chapter": q.get("chapter"),
        "subtype": q.get("subtype"),
        "difficulty": q.get("difficulty"),
        "correct_answer": q.get("correct_answer"),
    }

    point = PointStruct(
        id=idx,
        vector=embedding,
        payload=payload,
    )
    points.append(point)

print(f"Uploading {len(points)} points to Qdrant...")
start = time.time()
client.upsert(
    collection_name=COLLECTION_NAME,
    points=points,
)
elapsed = time.time() - start
print(f"Completed in {elapsed:.2f}s")

print(f"\n[OK] Collection '{COLLECTION_NAME}' created with {len(points)} questions.")

# Test similarity search (will test with API later)
print("\n" + "="*60)
print("VECTOR DB READY FOR TESTING")
print("="*60)
print("Collection is ready. Similarity search will be tested via API.")

# Export collection info
print("\n" + "="*60)
print("COLLECTION INFO")
print("="*60)
info = client.get_collection(COLLECTION_NAME)
print(f"Collection: {COLLECTION_NAME}")
print(f"Points count: {info.points_count}")
print(f"Vector size: {info.config.params.vectors.size}")
print(f"Distance metric: {info.config.params.vectors.distance}")

print("\n[OK] Qdrant setup complete!")
print("\nTo use in your app:")
print(f"  from qdrant_client import QdrantClient")
print(f"  client = QdrantClient(':memory:')")
print(f"  # ... recreate collection as shown above ...")
print(f"  results = client.search(collection_name='{COLLECTION_NAME}', query_vector=..., limit=5)")
