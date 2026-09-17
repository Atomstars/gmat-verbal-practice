# GMAT Trainer

A personal, fair-use GMAT practice app covering **Verbal** (RC + CR) and
**Quantitative** (PS + DS). The existing Next.js UI is backed by a Java 21 / Spring
Boot API and relational PostgreSQL with pgvector. The proven Python extraction
pipeline remains available while its source-specific parsing rules are ported and
verified in Java.

> **Personal / fair-use only — not for distribution.** The source books are **not**
> in this repo. Questions are extracted verbatim; nothing is invented or altered, and
> anything unconfirmable is left `null` rather than guessed. Correctness over volume.

## Repository layout

```
/                      source data and content-generation pipeline
├── index.html         legacy local-only app (kept for reference)
├── questions*.json    3 question banks (910 questions total)
├── embeddings.json    source vectors published to pgvector (not deployed publicly)
├── diagrams/          32 cropped figure PNGs for quant questions
├── start-app.bat      double-click launcher (serves over http + opens browser)
├── pipeline/          Python toolchain: parsers, embedding builder, eval, optional API
├── web/               static Next.js/React frontend (existing visual design)
├── backend/           Spring Boot API, Flyway schema, Java publisher/parsing ports
├── rag-service/       separate Spring Boot retrieval + tutor generation service
├── progress-service/  separate Spring Boot progress projection + history service
├── compose.yaml       local PostgreSQL 16 + pgvector
├── tests/             pytest regression suite for the parsers + schema
├── docs/              design + reference docs (see docs/DESIGN.md)
└── prototypes/        earlier UI explorations (kept for reference)
```

## Question banks

| File | Source | Questions | Answers confirmed |
|---|---|---:|---:|
| `questions-og.json` | *GMAT Official Guide 2024-2025* (Focus Edition) | 346 (RC + CR) | 346 / 346 |
| `questions.json` | Manhattan Prep — *All the Verbal* (6th ed.) | 64 (CR + RC) | 64 / 64 |
| `questions-quant.json` | Manhattan Review — *Quant Question Bank* (6th ed.) | 500 (PS + DS) | 496 / 500* |

*4 genuine book conflicts shipped as `needs_review: true` with `correct_answer: null`.

Every answer is verified against the book's own answer key **and** independently
cross-checked (PDF-vs-EPUB for Manhattan; answer key vs explanation marker for the
OG and Quant books). See [docs/COVERAGE.md](docs/COVERAGE.md) for the validation
report and [CLAUDE.md](CLAUDE.md) for parser architecture.

## Run the Java full stack

```bash
docker compose up -d postgres

cd backend
mvn test
mvn spring-boot:run                  # if environment variables are already loaded

cd ../rag-service
mvn test
mvn spring-boot:run                  # second terminal

cd ../progress-service
mvn test
mvn spring-boot:run                  # third terminal

cd web
npm install
npm run dev
```

Configure the placeholders in `.env.example` first. PostgreSQL is authoritative for
signed-in progress; local storage remains a guest store, UI cache, and one-time
migration source.

The public API gateway runs on `8080`; internal RAG and progress services run on
`8081` and `8082`. The browser never calls an internal service or model provider
directly. Gateway/service pairs share their corresponding internal token; only the
RAG service receives `NVIDIA_API_KEY`. On local Windows development, run
`node scripts/run-java-local.mjs backend`, `node scripts/run-java-local.mjs rag-service`,
and `node scripts/run-java-local.mjs progress-service` in separate terminals. The
runner loads `backend/.env.local` into each child process without exposing it to the browser.

## Rebuild the data (needs the source books)

```bash
pip install -r requirements.txt

python pipeline/parser_verbal.py "<All the Verbal>.pdf" --epub "<All the Verbal>.epub"
python pipeline/parser_verbal.py --og "<official-guide-2024-2025>.pdf"
python pipeline/parse_quant.py "<MR-quant-question-bank>.pdf"

# Rebuild the vector index after any parser re-run
python pipeline/build_index.py    # writes questions_embedded.json + embeddings.json
```

The Java source trees are organized by technical layer. The public backend uses:

```text
com/gmattrainer/
├── client/       outbound service clients
├── config/       Spring and security configuration
├── controller/   HTTP API endpoints
├── dto/          request and response contracts
├── enums/        shared bounded values
├── exception/    API errors and exception mapping
├── migration/    offline publishing entry points
├── repository/   database access
├── security/     authenticated identity
├── service/      application/business logic
└── util/         stateless parsing and embedding helpers
```

## Architecture

See **[docs/PRODUCTION_ARCHITECTURE.md](docs/PRODUCTION_ARCHITECTURE.md)** for database,
import, environment, local-development, and deployment instructions. See
**[docs/DESIGN.md](docs/DESIGN.md)** for the earlier high-level and low-level design,
[docs/TECH_STACK.md](docs/TECH_STACK.md) for the stack, and
[HANDOFF.md](HANDOFF.md) for current status.
