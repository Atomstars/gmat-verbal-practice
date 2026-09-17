# Technology stack

## Production

| Layer | Choice | Role |
|---|---|---|
| UI | Next.js 16, React 19, TypeScript | Existing routes and visual experience; exported statically |
| Authentication | Supabase Auth | Issues user JWTs; the browser uses Supabase only for Auth |
| API | Java 21, Spring Boot 3.5 | Sessions, grading, progress, search, and tutor grounding |
| API security | Spring Security resource server | Validates Supabase JWTs from the configured JWKS endpoint |
| Relational data | PostgreSQL 16 | Questions, sessions, attempts, progress, and study state |
| Vector search | pgvector, HNSW cosine index | Stores/searches 384-dimensional corpus embeddings |
| Embeddings | LangChain4j all-MiniLM-L6-v2 ONNX | Generates query embeddings inside the Java process |
| Schema changes | Flyway | Versioned, additive relational database migration |
| Tutor transport | Java HTTP client, SSE | Keeps provider credentials and protected prompts server-side |
| Packaging | Maven + OCI Dockerfile | Reproducible Java build/deployment |
| Frontend hosting | Vercel static output | Publishes `web/out` without question banks or vectors |

## Content toolchain

The verified Python parsers remain the source-content generator until the
source-specific extraction heuristics have golden-fixture parity in Java. The Java
backend already includes PDFBox/jsoup extraction, shared normalization, the exact
embedding-text recipe, and the final transactional JSON-to-PostgreSQL publisher.

```text
source PDF/EPUB
  -> verified parser
  -> questions*.json
  -> embeddings.json
  -> Java validation/publisher
  -> PostgreSQL + pgvector
  -> Spring API
  -> static Next.js UI
```

The optional Python/FastAPI/Qdrant implementation in `pipeline/` is retained only as
a development/reference path. It is not used by the migrated web application.

See [PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md) for commands, security
decisions, environment variables, and deployment.
