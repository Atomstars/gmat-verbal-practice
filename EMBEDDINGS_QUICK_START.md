# Vector DB Quick Start (5 minutes)

## What We Built

✅ **Free, open-source vector search** for GMAT questions using:
- **all-MiniLM-L6-v2** (384-dim embeddings, 26MB model, no API keys)
- **Qdrant** (semantic search, zero storage limits, production-ready)
- **FastAPI** (3 endpoints for search + question lookup)

## 30-Second Setup

```bash
# 1. Install
pip install sentence-transformers qdrant-client fastapi uvicorn

# 2. Generate embeddings (one time, 15 seconds for 346 questions)
python test_embeddings.py

# 3. Start API server
python api.py

# 4. Test
curl http://127.0.0.1:8000/health
```

## Use Cases

### 1. Find Similar Questions
```bash
curl http://127.0.0.1:8000/search-similar/og-rc-q456?limit=5
```
Returns 5 questions most semantically similar to RC question 456.

### 2. Semantic Search
```bash
curl 'http://127.0.0.1:8000/search?q=economic+policy&limit=10'
```
Returns 10 questions matching "economic policy" by meaning (not keywords).

### 3. Get Question Details
```bash
curl http://127.0.0.1:8000/questions/og-rc-q456
```
Returns full question, passage, options, explanation, difficulty.

## Files Created

| File | Purpose |
|------|---------|
| `test_embeddings.py` | Embed questions.json (generates questions_embedded.json) |
| `setup_qdrant.py` | Load embeddings into Qdrant |
| `api.py` | FastAPI backend (3 endpoints) |
| `questions_embedded.json` | Questions + 384-dim embeddings (5.1 MB) |
| `VECTOR_DB_GUIDE.md` | Full reference guide |

## Next Steps

### Immediate (Today)
1. ✅ Run `test_embeddings.py` → generates embeddings
2. ✅ Run `setup_qdrant.py` → load into Qdrant
3. ✅ Run `api.py` → start API server
4. ✅ Test endpoints with curl

### Soon (This Week)
- Update `index.html` to call `/search-similar` endpoint
- Add "Similar questions" panel below answer feedback
- Add semantic search bar to dashboard

### Later (Nice-to-have)
- Deploy API to Render/Railway (free tier)
- Switch from in-memory Qdrant to Docker/persistent
- Use embeddings for weak-spot analytics

## FAQ

**Q: Do I need an API key for embeddings?**
A: No. all-MiniLM-L6-v2 runs locally. No OpenAI/Claude fees.

**Q: Can I run this offline?**
A: Yes. Everything is local (model, vector DB, API).

**Q: What if I regenerate questions.json?**
A: Run `test_embeddings.py` again (15 seconds). Embeddings are auto-included when using the updated parser.

**Q: Can this scale to 10,000+ questions?**
A: Yes. 5.1 MB for 346 questions = ~0.015 MB/question. 10K questions ≈ 150 MB (still free on any tier).

**Q: How similar is "similar"?**
A: Cosine distance on 384-dim vectors. Two RC passages with the same topic typically score 0.75-0.85. Unrelated questions score 0.3-0.5.

## Verify It Works

```bash
# 1. Check embeddings file exists
ls -lh questions_embedded.json

# 2. Start API (opens http://127.0.0.1:8000/docs for interactive testing)
python api.py

# 3. In another terminal:
curl http://127.0.0.1:8000/health
# Should output:
# {"status":"ok","collection":"gmat_questions","questions_count":346}
```

## See Also

- `VECTOR_DB_GUIDE.md` — full reference
- `parser.py` — updated with `embed_questions()` function
- `api.py` — source code (easy to customize)
