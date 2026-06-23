# GMAT Vector DB Setup Guide

## Overview

This guide covers the setup and usage of embeddings + Qdrant vector database for semantic search over GMAT questions.

**Stack:**
- **Embedding Model:** all-MiniLM-L6-v2 (384-dim, free, local)
- **Vector DB:** Qdrant (open-source, free)
- **Backend:** FastAPI with CORS
- **Questions:** 346 Official Guide questions + 64 Manhattan questions

## Quick Start

### 1. Generate Embeddings (Phase 1)

If you already have `questions-og.json` or `questions.json` and want to generate embeddings:

```bash
# Install dependencies
pip install sentence-transformers qdrant-client fastapi uvicorn

# Generate embeddings for Official Guide
python test_embeddings.py
# Output: questions_embedded.json (5.1 MB)

# Or manually embed any JSON:
python -c "
from test_embeddings import *
import json
with open('your_questions.json', 'r') as f:
    questions = json.load(f)
# Run embedding...
"
```

**Performance:** ~22 questions/second (16s for 346 questions)

### 2. Load Into Qdrant (Phase 2 & 3)

```bash
# Load questions_embedded.json into in-memory Qdrant
python setup_qdrant.py
```

Output:
```
[OK] Collection 'gmat_questions' created with 346 questions.
Points count: 346
Vector size: 384
Distance metric: Cosine
```

### 3. Start Backend API (Phase 4)

```bash
# Run FastAPI server
python api.py

# Server runs on http://127.0.0.1:8000
# API docs: http://127.0.0.1:8000/docs
```

### 4. Test API Endpoints

```bash
# Health check
curl http://127.0.0.1:8000/health

# Find similar questions
curl http://127.0.0.1:8000/search-similar/og-rc-q456?limit=5

# Semantic search
curl 'http://127.0.0.1:8000/search?q=economic+policy'

# Get full question details
curl http://127.0.0.1:8000/questions/og-rc-q456
```

## Detailed Architecture

### File Structure

```
parser.py                      # Updated with embed_questions() function
test_embeddings.py             # Test/generate embeddings from questions.json
questions_embedded.json        # Questions + 384-dim embeddings (5.1 MB)
setup_qdrant.py                # Load embeddings into Qdrant
api.py                         # FastAPI backend (search endpoints)
index.html                     # (Will be updated for Phase 5)
```

### Data Pipeline

```
questions-og.json (346 Q)  \
                            > parser.py (with embed_questions)
questions.json (64 Q)      /
         |
         v
all-MiniLM-L6-v2 (local)
         |
         v
questions_embedded.json (5.1 MB)
         |
         v
Qdrant (in-memory or Docker)
         |
         v
FastAPI Backend
         |
         v
index.html (frontend)
```

### API Endpoints

#### GET `/health`
Health check and stats.

```json
{
  "status": "ok",
  "collection": "gmat_questions",
  "questions_count": 346
}
```

#### GET `/search-similar/{question_id}?limit=5`
Find N semantically similar questions.

```json
{
  "query_id": "og-rc-q456",
  "query_text": "The primary purpose...",
  "results": [
    {
      "question_id": "og-rc-q500",
      "score": 0.87,
      "type": "RC",
      "difficulty": "Easy",
      "subtype": "Main Idea"
    }
  ]
}
```

#### GET `/search?q=<query>&limit=10`
Semantic search by text query.

```json
{
  "query_text": "economic policy",
  "results": [
    {
      "question_id": "og-rc-q512",
      "score": 0.75,
      "type": "RC",
      "difficulty": "Medium",
      "subtype": "Supporting Idea"
    }
  ]
}
```

#### GET `/questions/{question_id}`
Get full question details.

```json
{
  "id": "og-rc-q456",
  "type": "RC",
  "question": "The primary purpose of the passage is to...",
  "passage": "In recent years...",
  "chapter": "Reading Comprehension — Easy",
  "subtype": "Main Idea",
  "difficulty": "Easy",
  "correct_answer": "A",
  "explanation": "The passage primarily..."
}
```

## Configuration & Deployment

### Development (In-Memory Qdrant)

Used by `setup_qdrant.py` and `api.py` by default:

```python
client = QdrantClient(":memory:")
```

**Pros:** Zero setup, fast for 346 questions
**Cons:** Data lost on restart

### Production (Docker)

For persistent storage on Render, Railway, or your own server:

```bash
# Start Qdrant container
docker pull qdrant/qdrant
docker run -p 6333:6333 qdrant/qdrant

# Update api.py to point to the container:
client = QdrantClient(url="http://localhost:6333")
```

Or use **Qdrant Cloud** (free tier available):

```python
client = QdrantClient(
    url="https://<cluster-id>.api.qdrant.io",
    api_key="<api-key>",
)
```

## Integration with Parser

### Automatic Embedding (Recommended)

The parser now automatically embeds questions when generating JSON:

```bash
# For Official Guide
python parser.py --og "<path-to>/official-guide.pdf"
# Outputs: questions-og.json (with embeddings)

# For Manhattan
python parser.py "<path-to>/manhattan.pdf" --epub "<path-to>/manhattan.epub"
# Outputs: questions.json (with embeddings)
```

### Manual Embedding

If you already have `questions.json` without embeddings:

```python
from parser import embed_questions
import json

with open("questions.json", "r") as f:
    questions = json.load(f)

embedded = embed_questions(questions)

with open("questions-embedded.json", "w") as f:
    json.dump(embedded, f)
```

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Load model | ~2s | One-time, cached after first load |
| Embed 346 Q | ~16s | ~22 q/sec with all-MiniLM-L6-v2 |
| Load Qdrant | <1s | In-memory collection creation |
| Upload 346 points | ~0.3s | Batch upsert |
| Similarity search | ~50ms | Single vector search |
| Text embedding | ~200ms | Per-query (text → vector) |
| Semantic search | ~250ms | Embed query + vector search |

## Troubleshooting

### "ModuleNotFoundError: No module named 'sentence_transformers'"

```bash
pip install sentence-transformers
```

### "ModuleNotFoundError: No module named 'qdrant_client'"

```bash
pip install qdrant-client
```

### API won't start (port 8000 in use)

```bash
# Use a different port
python api.py  # Or edit api.py to change port
```

### Embeddings file not found

Make sure to run `test_embeddings.py` first to generate `questions_embedded.json`:

```bash
python test_embeddings.py
```

## Next Steps (Phase 5)

Frontend integration (not yet implemented):

1. **Add "Similar Questions" panel** to the practice UI
   - Show 3-5 semantically similar questions after user answers
   - Link to those questions for review

2. **Add semantic search bar** to dashboard
   - Let user search by concept/keyword
   - Display results with relevance scores

3. **Embedding-based analytics**
   - Group weak-performing questions by semantic cluster
   - Show "weakest concept" recommendation (vs current difficulty-only)

4. **RAG for AI explanations** (future)
   - Use top-5 similar questions' explanations as context
   - Generate AI summaries of key insights

## Cost & Licensing

| Component | Cost | License |
|-----------|------|---------|
| all-MiniLM-L6-v2 | Free | Apache 2.0 |
| Qdrant | Free | AGPL 3.0 / Commercial |
| FastAPI | Free | MIT |
| Sentence-transformers | Free | Apache 2.0 |

**Storage:** 5.1 MB for 346 questions (embeddings + metadata). No ongoing fees for self-hosted.

## References

- [Qdrant Docs](https://qdrant.tech/documentation/)
- [Sentence-Transformers](https://www.sbert.net/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [all-MiniLM-L6-v2 Model](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
