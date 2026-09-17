# Java backend

Spring Boot 3.5 / Java 21 service for question delivery, grading, progress,
semantic search, similar questions, and the AI tutor. PostgreSQL is the system of
record; pgvector stores the existing 384-dimensional MiniLM embeddings.

## Run locally

```bash
docker compose up -d postgres
cd backend
mvn test
mvn spring-boot:run
```

Set `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and
`SUPABASE_JWKS_URI` before starting Spring. The local compose database URL is
`jdbc:postgresql://localhost:5432/gmat` with username `gmat` and password
`local-development-only`. Flyway applies the schema automatically.

Validate and publish the existing corpus with Java:

```bash
mvn -q exec:java -Dexec.mainClass=com.gmattrainer.content.ContentMigrationMain -Dexec.args="--dry-run"
mvn -q exec:java -Dexec.mainClass=com.gmattrainer.content.ContentMigrationMain
mvn -q exec:java -Dexec.mainClass=com.gmattrainer.content.EmbeddingParityMain
```

Run those commands from `backend/`; the publisher reads the four source JSON files
from the repository root. It validates all 910 IDs and 384-dimensional vectors and
performs transactional upserts. It never logs database credentials.

`TextNormalizer`, `PdfPageExtractor`, `EpubTextExtractor`, and
`EmbeddingTextBuilder` are Java ports of the deterministic parsing/extraction layer.
The source-specific question boundary and answer-key heuristics remain in the Python
pipeline until fixture-by-fixture parity is proven; the production application and
database publishing path no longer require Python.
