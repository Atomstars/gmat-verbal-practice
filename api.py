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
from qdrant_client.models import Distance, PointStruct, VectorParams
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
    passage: str | None = None
    chapter: str | None = None
    subtype: str | None = None
    difficulty: str | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class SearchResult(BaseModel):
    question_id: str
    score: float
    type: str
    difficulty: str | None = None
    subtype: str | None = None


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


@app.get("/search-similar/{question_id}")
async def search_similar(
    question_id: str,
    limit: int = 5,
) -> SearchResponse:
    """
    Find questions semantically similar to a given question ID.
    """
    if question_id not in questions_map:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found")

    question = questions_map[question_id]
    embedding = question.get("embedding")
    if not embedding:
        raise HTTPException(status_code=400, detail=f"Question {question_id} has no embedding")

    # Search in Qdrant using query_points (qdrant-client v1.7+)
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=embedding,
        limit=limit + 1,  # +1 to exclude the query itself
        with_payload=True,
    )
    points = response.points

    results = []
    for point in points:
        if point.payload.get("id") == question_id:
            continue
        q_id = point.payload.get("id")
        results.append(
            SearchResult(
                question_id=q_id,
                score=point.score,
                type=point.payload.get("type"),
                difficulty=point.payload.get("difficulty"),
                subtype=point.payload.get("subtype"),
            )
        )
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
) -> SearchResponse:
    """
    Semantic search: find questions matching a query string.
    """
    if not q or len(q) < 3:
        raise HTTPException(status_code=400, detail="Query must be at least 3 characters")

    # Embed the query and search using query_points (qdrant-client v1.7+)
    query_embedding = model.encode(q).tolist()
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        limit=limit,
        with_payload=True,
    )
    points = response.points

    results = [
        SearchResult(
            question_id=point.payload.get("id"),
            score=point.score,
            type=point.payload.get("type"),
            difficulty=point.payload.get("difficulty"),
            subtype=point.payload.get("subtype"),
        )
        for point in points
    ]

    return SearchResponse(
        query_text=q,
        results=results,
    )


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
        passage=q.get("passage"),
        chapter=q.get("chapter"),
        subtype=q.get("subtype"),
        difficulty=q.get("difficulty"),
        correct_answer=q.get("correct_answer"),
        explanation=q.get("explanation"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
