# Tutor RAG architecture

The app intentionally has two tutor modes with different retrieval and disclosure rules.

## Runtime boundaries

```text
Browser
  -> public Spring API :8080
       - validates the request
       - verifies the practice session and user
       - withholds protected answers before submission
  -> internal RAG service :8081
       - enforces topic scope
       - retrieves and ranks trusted context
       - constructs the teaching prompt
       - streams the model provider response
```

`RAG_INTERNAL_TOKEN` authenticates API-to-service traffic. The RAG service should not
be publicly routed in production.

## Question tutor

The question tutor uses deterministic contextual retrieval. The public API loads the
exact question identified by the authorized practice session. Before submission it
sends no answer or explanation to the RAG service. After submission it may include the
official answer and explanation. This mode never searches unrelated knowledge chunks.

## Main-board teacher

The teacher uses hybrid corrective RAG:

1. Embed the latest user question with `all-MiniLM-L6-v2`.
2. Retrieve approximate nearest chunks with pgvector/HNSW.
3. Retrieve lexical candidates with PostgreSQL full-text search/GIN.
4. Merge and rerank both candidate sets.
5. Refuse clearly unrelated requests or weak retrievals.
6. Give the model only the selected trusted chunks and require source labels.

Flyway V2 creates `knowledge_chunks` and initially seeds one worked-question chunk for
each published question, using its verified official explanation and existing vector.
Future lesson, strategy, and reference content should be chunked and inserted into the
same table with its own embedding.

## Configuration

Public API:

- `RAG_SERVICE_URL` (default `http://localhost:8081`)
- `RAG_INTERNAL_TOKEN`

RAG service:

- database variables shared with the public API
- `RAG_INTERNAL_TOKEN`
- `NVIDIA_API_KEY`, `NVIDIA_MODEL`, and optional `TUTOR_BASE_URL`
- `RAG_MINIMUM_SCORE` (default `0.28`)
- `RAG_CANDIDATES` (default `20`)
- `RAG_CONTEXT_LIMIT` (default `5`)

Run the public API first once after adding a migration so Flyway applies V2. Then run
the RAG service and the web app. Do not edit an already-applied migration; add V3 and
later migrations for future schema changes.
