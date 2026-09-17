# Java production architecture

## Result

The existing React/Next.js UI remains visually unchanged and is now a static client
of a Java 21 / Spring Boot API. Supabase Auth still issues user JWTs. Spring validates
those JWTs, performs every protected operation, and uses PostgreSQL plus pgvector as
the system of record.

```text
Next.js -- Supabase JWT --> API gateway/core :8080 --> PostgreSQL + pgvector
                                  |                    ^
                                  +--> RAG :8081 ------+--> model provider
                                  |
                                  +--> Progress :8082 -+

PDF/EPUB --> parser --> validated JSON --> embeddings --> Java publisher --> database
```

Before this migration, the browser downloaded the three answer-bearing question
banks and all corpus vectors, chose its own sessions, graded answers locally, and
treated `gmat_verbal_v1` localStorage as authoritative. Those public data files are
no longer copied into `web/public`; the browser receives only `StudentQuestion`
records, and `/api/answers` returns protected answer data only after a valid session
submission.

## Components and security boundary

- `web/` is the unchanged Next.js/React presentation layer. `web/lib/api.ts` forwards
  a Supabase access token to `NEXT_PUBLIC_API_BASE_URL` when one exists.
- `backend/` is the public API gateway and practice/question service. It owns safe
  question delivery, sessions, grading, immutable attempts, tutor authorization,
  Flyway migrations, and content publishing.
- `rag-service/` owns hybrid retrieval, scope classification, corrective retrieval,
  teacher/question prompts, and model-provider communication.
- `progress-service/` owns progress projections, study state, history reads, and
  idempotent consumption of `ANSWER_SUBMITTED` integration events.
- PostgreSQL stores normalized relational data. `question_embeddings.vector(384)` is
  indexed with HNSW cosine distance through pgvector.
- `questions`, embeddings, answers, attempts, and progress have RLS enabled with no
  browser policy. Supabase `anon` and `authenticated` table grants are explicitly
  revoked when those roles exist. Only the Java JDBC role accesses application data.
- Public/guest sessions can practice and receive post-submit grading, but only signed-
  in users persist attempts and cloud progress. A session UUID is capability-like and
  expires after 24 hours; signed-in sessions are also bound to their JWT subject.
- Tutor grounding verifies that session/question relationship. Hidden answer context
  is added only after that question is recorded as submitted.

## Relational model

Flyway migration `backend/src/main/resources/db/migration/V1__production_schema.sql`
creates:

- `questions` and `question_embeddings`
- `app_users`, keyed by the Supabase JWT `sub`
- `practice_sessions` for bounded question delivery and submission state
- immutable, idempotent `question_attempts` keyed by `client_attempt_id`
- legacy progress tables retained during the zero-data-loss transition

Migration `V2` adds the RAG knowledge store. Migration `V3` adds a transactional
outbox and the progress service's schema-owned tables. Saving an authenticated
answer and publishing `ANSWER_SUBMITTED` occur in one database transaction. The
progress consumer leases events with `FOR UPDATE SKIP LOCKED`, records processed
business keys, retries failures with exponential backoff, dead-letters repeatedly
failing events, and prevents an older event from replacing newer last-answer data.

The migration is additive and runs automatically when Spring starts. It supports a
Supabase-hosted PostgreSQL database or any PostgreSQL 16 server with pgvector.

## Data migration

From `backend/`, validate the full source corpus without connecting to a database:

```bash
mvn -q exec:java -Dexec.mainClass=com.gmattrainer.migration.ContentMigrationMain -Dexec.args="--dry-run"
```

After Flyway has run, set the JDBC environment variables and publish:

```bash
mvn -q exec:java -Dexec.mainClass=com.gmattrainer.migration.ContentMigrationMain
mvn -q exec:java -Dexec.mainClass=com.gmattrainer.migration.EmbeddingParityMain
```

The Java publisher reads `questions-og.json`, `questions.json`,
`questions-quant.json`, and `embeddings.json`; preserves IDs; validates types,
options, keyed answers, duplicates, finite 384-dimensional vectors, and foreign-key
coverage; then upserts questions and vectors in one transaction. It reports read,
imported, skipped, and error totals and is safe to rerun.

The deterministic general parsing layer also has Java implementations for text
normalization, PDF page extraction (PDFBox), EPUB text extraction (jsoup), and exact
embedding-input construction. The highly source-specific question-boundary and
answer-key heuristics remain in Python until golden-fixture parity is complete. This
honors the existing rule that the proven extraction pipeline is not removed before
its replacement is verified; Python is not part of the production runtime or publish
step.

## Environment variables

Frontend:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL`, for example `http://localhost:8080`

Java backend:

- `DATABASE_URL` — JDBC URL, e.g. `jdbc:postgresql://localhost:5432/gmat`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `SUPABASE_JWKS_URI`
- `FRONTEND_ORIGIN`
- `DB_POOL_SIZE` (optional, default 10)
- `RAG_SERVICE_URL`, `RAG_INTERNAL_TOKEN`
- `PROGRESS_SERVICE_URL`, `PROGRESS_INTERNAL_TOKEN`

RAG service:

- the database variables above
- `RAG_INTERNAL_TOKEN`
- `NVIDIA_API_KEY`, `NVIDIA_MODEL`

Progress service:

- the database variables above
- `PROGRESS_INTERNAL_TOKEN`
- `PROGRESS_DB_POOL_SIZE`, `OUTBOX_POLL_DELAY_MS`, `OUTBOX_BATCH_SIZE` (optional)

Only the three intentionally public frontend variables use `NEXT_PUBLIC_`. No
database password or tutor credential is exposed to the browser.

## Local development

```bash
docker compose up -d postgres

cd backend
mvn test
mvn spring-boot:run

cd ../rag-service
mvn test
mvn spring-boot:run

cd ../progress-service
mvn test
mvn spring-boot:run

cd ../web
npm install
npm run dev
```

The local database credentials are declared in `compose.yaml`; use them only for
local development. Supply a real Supabase JWKS URI so bearer tokens can be verified.
The frontend continues to serve diagrams from static assets, but not source JSON or
embeddings.

## Deployment

1. Provision PostgreSQL with pgvector (Supabase PostgreSQL is supported).
2. Deploy the API gateway/core, RAG service, and progress service independently.
   Give internal services private networking and distinct production credentials.
   Only the gateway is internet-facing. Gateway startup runs Flyway.
3. Run the Java publisher once; reruns are idempotent.
4. Deploy the static frontend to Vercel using `vercel.json`; set its three public
   variables and set `FRONTEND_ORIGIN` on the backend to the deployed origin.
5. Verify question-bank and embedding URLs return 404, then test sign-in, practice,
   refresh/history, search, similar questions, and tutor behavior.

For internet-facing use, add infrastructure-level rate limits for session creation,
grading, search, and tutor requests. Database backups and point-in-time recovery are
deployment concerns and should be enabled before production traffic.

## Old versus new flow

| Concern | Old | Java migration |
|---|---|---|
| Question delivery | Browser downloads complete JSON banks | Spring returns safe DTOs for a server session |
| Grading | Browser compares `correct_answer` | Transactional Java endpoint grades in PostgreSQL flow |
| Answers/explanations | Present before submission | Returned only after valid submission |
| Semantic search | All vectors + brute-force browser scan | Java MiniLM query embedding + pgvector top-k |
| Similar questions | Browser vector comparison | Stored-vector SQL query, current ID excluded |
| Progress | localStorage authoritative | Event-driven progress service authoritative when signed in |
| Tutor context | Browser assembles protected prompt | Java verifies session/submission and grounds server-side |
| Production runtime | Static app plus optional Python API | Static UI plus Spring Boot API |
