# Microservices architecture

## Current service boundaries

```text
Browser
  |
  | HTTPS + Supabase JWT
  v
API gateway / practice-question service (:8080)
  |-- internal token --> RAG service (:8081) --> model provider
  |-- internal token --> Progress service (:8082)
  |
  +-- answer transaction --> question_attempts + integration_outbox
                                      |
                                      +--> progress consumer --> progress_service.*
```

The gateway deliberately preserves the existing browser URLs. `/api/progress` and
`/api/history` are public gateway routes, while `/internal/...` routes are private
service contracts. This lets services move or scale without coupling the frontend
to the internal topology.

The Java services use a consistent layer-first package layout: `controller`,
`service`, `client`, `repository`, `dto`, `enums`, `config`, and `exception`.
Controllers translate HTTP, services coordinate use cases, clients own outbound
HTTP, repositories own SQL, DTOs define contracts, and enums replace unvalidated
strings in business logic. Offline import entry points live in `migration`, reusable
stateless helpers in `util`, and authentication identity code in `security`.

## Reliability model

- Answer persistence and outbox publication are atomic. A database failure commits
  neither, so progress cannot silently miss a successful attempt.
- Consumers lease work with `FOR UPDATE SKIP LOCKED`, allowing multiple replicas.
- Both event UUID and business aggregate identity are idempotent.
- Failures retry with bounded exponential backoff and dead-letter after 10 attempts.
- Out-of-order events increase totals but cannot overwrite newer last-answer state.
- Internal endpoints require a service credential; end-user JWT validation remains
  at the public gateway.

## Database ownership

This stage uses one Supabase PostgreSQL cluster to avoid an unsafe big-bang data
move, but ownership is separated by schema: the progress service writes only
`progress_service.*` plus its outbox acknowledgements. That is a transitional
schema-per-service pattern, not shared-table business logic. In production, use
separate database roles and grants so ownership is enforced by PostgreSQL. A later
move to a separate progress database can replace the polling outbox with a broker
without changing the browser API.

## Scaling without needless fragmentation

The extracted boundaries are RAG (compute/provider isolation) and progress
(asynchronous, read-heavy projection). Questions, sessions, and grading remain
together because grading needs a short, strongly consistent transaction across
those concepts. Split the question/content service later when its load or release
cycle is independently measurable; splitting every table now would add network
failures without adding capacity.

For local Supabase session-pool use, the default cross-service connection budget is
5 gateway + 3 RAG + 3 progress = 11 connections, leaving headroom under a 15-client
limit. For production traffic, budget `replica count × maximum-pool-size` against the
actual database/pooler limit, run stateless replicas behind a load balancer, add gateway/provider rate limiting,
monitor HTTP latency/error rate and outbox lag/dead letters, and enable PostgreSQL
backups and point-in-time recovery.
