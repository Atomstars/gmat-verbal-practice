#!/usr/bin/env python3
"""
FastAPI backend for GMAT vector search.
Provides semantic search endpoints for questions.
"""

import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)
from sentence_transformers import SentenceTransformer

app = FastAPI(
    title="GMAT Vector Search API",
    description="Semantic search over GMAT questions",
    version="1.0",
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
client: QdrantClient | None = None
model: SentenceTransformer | None = None
questions_map: dict = {}
COLLECTION_NAME = "gmat_questions"


def init_qdrant():
    """Initialize Qdrant client and load questions."""
    global client, model, questions_map

    # Initialize embedding model
    print("Loading all-MiniLM-L6-v2...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Initialize Qdrant (in-memory for now)
    print("Initializing Qdrant...")
    client = QdrantClient(":memory:")

    # Load embedded questions
    if not os.path.exists("questions_embedded.json"):
        raise FileNotFoundError("questions_embedded.json not found. Run test_embeddings.py first.")

    print("Loading embedded questions...")
    with open("questions_embedded.json", encoding="utf-8") as f:
        questions = json.load(f)

    # Create collection
    print(f"Creating collection '{COLLECTION_NAME}'...")
    client.recreate_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    )

    # Prepare and upload points
    print(f"Uploading {len(questions)} questions...")
    points = []
    for idx, q in enumerate(questions):
        embedding = q.get("embedding")
        if not embedding:
            continue

        payload = {
            "id": q["id"],
            "bank": q.get("bank"),
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
        questions_map[q["id"]] = q

    client.upsert(collection_name=COLLECTION_NAME, points=points)
    print(f"[OK] Qdrant initialized with {len(points)} questions")


@app.on_event("startup")
async def startup():
    """Initialize on server startup."""
    init_qdrant()


# Request/Response models
class Question(BaseModel):
    id: str
    type: str
    question: str
    bank: str | None = None
    passage: str | None = None
    chapter: str | None = None
    subtype: str | None = None
    difficulty: str | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    diagram: str | None = None


class SearchResult(BaseModel):
    question_id: str
    score: float
    type: str
    bank: str | None = None
    chapter: str | None = None
    stem: str | None = None
    difficulty: str | None = None
    subtype: str | None = None


def build_filter(
    bank: str | None = None,
    qtype: str | None = None,
    chapter: str | None = None,
    difficulty: str | None = None,
) -> Filter | None:
    """Build a Qdrant payload filter from optional metadata constraints."""
    conditions = []
    if bank:
        conditions.append(FieldCondition(key="bank", match=MatchValue(value=bank)))
    if qtype:
        conditions.append(FieldCondition(key="type", match=MatchValue(value=qtype)))
    if chapter:
        conditions.append(FieldCondition(key="chapter", match=MatchValue(value=chapter)))
    if difficulty:
        conditions.append(FieldCondition(key="difficulty", match=MatchValue(value=difficulty)))
    return Filter(must=conditions) if conditions else None


class SearchResponse(BaseModel):
    query_id: str | None = None
    query_text: str | None = None
    results: list[SearchResult]


# Endpoints
@app.get("/health")
async def health():
    """Health check."""
    return {
        "status": "ok",
        "collection": COLLECTION_NAME,
        "questions_count": len(questions_map),
    }


def _to_result(point) -> SearchResult:
    return SearchResult(
        question_id=point.payload.get("id"),
        score=point.score,
        type=point.payload.get("type"),
        bank=point.payload.get("bank"),
        chapter=point.payload.get("chapter"),
        stem=(point.payload.get("question") or "")[:140],
        difficulty=point.payload.get("difficulty"),
        subtype=point.payload.get("subtype"),
    )


@app.get("/search-similar/{question_id}")
async def search_similar(
    question_id: str,
    limit: int = 5,
    same_bank: bool = True,
    same_type: bool = True,
    bank: str | None = None,
    chapter: str | None = None,
    difficulty: str | None = None,
    min_score: float = 0.25,
) -> SearchResponse:
    """
    Find questions semantically similar to a given question ID.
    Defaults to the same bank and same type so neighbors are usable practice;
    ?bank=og|manhattan|quant overrides the bank explicitly.
    """
    if question_id not in questions_map:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found")

    question = questions_map[question_id]
    embedding = question.get("embedding")
    if not embedding:
        raise HTTPException(status_code=400, detail=f"Question {question_id} has no embedding")

    query_filter = build_filter(
        bank=bank or (question.get("bank") if same_bank else None),
        qtype=question.get("type") if same_type else None,
        chapter=chapter,
        difficulty=difficulty,
    )

    # query_points (qdrant-client v1.7+); +1 to exclude the query itself
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=embedding,
        query_filter=query_filter,
        limit=limit + 1,  # +1 to exclude the query itself
        with_payload=True,
    )

    results = []
    for point in response.points:
        if point.payload.get("id") == question_id:
            continue
        if point.score < min_score:
            continue
        results.append(_to_result(point))
        if len(results) >= limit:
            break

    return SearchResponse(
        query_id=question_id,
        query_text=question.get("question", "")[:100],
        results=results,
    )


@app.get("/search")
async def semantic_search(
    q: str,
    limit: int = 10,
    bank: str | None = None,
    type: str | None = None,
    chapter: str | None = None,
    difficulty: str | None = None,
) -> SearchResponse:
    """
    Semantic search: find questions matching a query string,
    optionally constrained by bank / type / chapter / difficulty.
    """
    if not q or len(q) < 3:
        raise HTTPException(status_code=400, detail="Query must be at least 3 characters")

    query_embedding = model.encode(q).tolist()
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        query_filter=build_filter(bank=bank, qtype=type, chapter=chapter, difficulty=difficulty),
        limit=limit,
        with_payload=True,
    )

    return SearchResponse(
        query_text=q,
        results=[_to_result(p) for p in response.points],
    )


@app.get("/chapters")
async def list_chapters(bank: str | None = None) -> dict:
    """Chapters (topics) with question counts, optionally for one bank."""
    counts: dict[str, dict[str, int]] = {}
    for q in questions_map.values():
        if bank and q.get("bank") != bank:
            continue
        b = q.get("bank") or "unknown"
        ch = q.get("chapter") or "Uncategorized"
        counts.setdefault(b, {})
        counts[b][ch] = counts[b].get(ch, 0) + 1
    return {"banks": counts}


@app.get("/questions/{question_id}")
async def get_question(question_id: str) -> Question:
    """Get the full details of a question by ID."""
    if question_id not in questions_map:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found")

    q = questions_map[question_id]
    return Question(
        id=q["id"],
        type=q.get("type"),
        question=q.get("question"),
        bank=q.get("bank"),
        passage=q.get("passage"),
        chapter=q.get("chapter"),
        subtype=q.get("subtype"),
        difficulty=q.get("difficulty"),
        correct_answer=q.get("correct_answer"),
        explanation=q.get("explanation"),
        diagram=q.get("diagram"),
    )


# Serve the web app (index.html, the JSON banks, diagram PNGs) from the SAME origin
# as the API, so the vector features are always available with no separate file server
# and no cross-origin/port juggling. Mounted LAST so the API routes registered above
# take precedence over static-file matching for /health, /search, /search-similar, etc.
from fastapi.staticfiles import StaticFiles  # noqa: E402

app.mount("/", StaticFiles(directory=".", html=True), name="app")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
