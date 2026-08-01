# ADR 0001: Foundational application architecture

## Status

Accepted

## Date

2026-07-31

## Context

AlgoMemtor needs to deliver a beginner-maintainable MVP for DSA and competitive
programming practice. Its central product loop combines ordinary product
behavior—profiles, problems, attempts, submissions, and progress—with specialized
AI behavior—progressive hints, learner memory, embeddings, and recommendations.

The project must support a frontend-first, mock-driven workflow and later add
safe code execution, authentication, persistence, and AI streaming. It should
remain understandable to a small team and must not introduce distributed
infrastructure before real usage demonstrates a need.

Four foundational choices are coupled:

1. the browser application framework;
2. the core API runtime;
3. the AI service runtime; and
4. the primary durable database.

## Decision

### Use React with Vite rather than Next.js

The browser application will use React, TypeScript, and Vite with React Router.

AlgoMemtor is initially an authenticated application with a rich coding
workspace, not a content-heavy site whose MVP depends on server rendering or
framework-managed backend routes. Vite keeps the browser application explicit,
starts quickly, supports MSW-based development, and avoids coupling UI delivery
to either backend.

Next.js remains a valid option if measured product requirements later depend on
server rendering, framework-level routing, or server components. Those needs do
not currently justify the additional execution model.

### Use Express for core product APIs

Express with strict TypeScript will own:

- users and learner profiles;
- problems and topics;
- attempts, drafts, and submissions;
- progress calculations;
- hosted Judge0 integration; and
- future contest or real-time product behavior.

Express aligns with the frontend’s TypeScript contracts and provides a small,
transparent request pipeline. Controllers handle HTTP, services hold business
logic, repositories own database access, and integration clients isolate
external systems.

### Use FastAPI for AI capabilities

FastAPI with Python will own:

- progressive hints and streaming;
- LLM and embedding provider clients;
- learner-memory extraction and retrieval;
- recommendation reasoning;
- mistake classification; and
- AI evaluation utilities.

Python provides the strongest ecosystem for model providers, embeddings, and AI
evaluation. Pydantic gives typed API boundaries, while SQLAlchemy and Alembic
provide explicit ownership of AI data.

The split does not imply a general microservice architecture. AlgoMemtor starts
with exactly two backend services because they have distinct responsibilities
and ecosystems. Both communicate over authenticated HTTP. Agent frameworks and
message brokers are deferred until ordinary services become demonstrably
insufficient.

### Use PostgreSQL as the primary database

One PostgreSQL database will be the durable source of truth. It will use:

- a `core` schema managed only by Prisma and Express;
- an `ai` schema managed only by SQLAlchemy/Alembic and FastAPI; and
- pgvector for MVP learner-memory similarity search.

PostgreSQL supports relational product data, transactions, JSON where useful,
and vector search without requiring a second database during the MVP.

Express and FastAPI must never run migrations against the same table. A
dedicated vector database may be introduced only if measured vector workloads
materially harm primary database performance.

## Consequences

### Positive

- The frontend can be built and tested with mocks before either backend exists.
- Core contracts stay close to TypeScript consumers.
- AI implementation can use Python-native libraries without forcing the entire
  product backend into Python.
- PostgreSQL provides one operational data system for the MVP.
- Service and schema ownership are explicit.
- Each boundary has a scale-up path that does not require rewriting the UI.

### Negative

- Authentication and API contracts must remain consistent across two backends.
- The team must maintain both TypeScript and Python tooling.
- Internal HTTP calls introduce failure modes that must degrade safely.
- One PostgreSQL instance requires discipline around schema and migration
  ownership.

### Constraints

- AI analysis must never invalidate an otherwise successful submission.
- Learner code must run only through hosted Judge0, never inside an application
  process.
- Supabase service credentials, database credentials, internal service tokens,
  Judge0 credentials, and LLM keys must never enter browser bundles.
- Prisma and Alembic must not manage the same table.
- Kafka, NATS, Kubernetes, separate vector databases, custom code runners, and
  agent frameworks remain deferred until measured usage justifies them.

## Alternatives considered

### Next.js for the complete application

Rejected for the MVP because AlgoMemtor benefits more from an explicit SPA and
two stable backend boundaries than from framework-managed rendering and server
routes.

### A single Express service

Rejected because AI and embedding work benefits from Python’s ecosystem and
would either constrain implementation or introduce provider-specific scripts
inside the core service.

### A single FastAPI service

Rejected because the product API, Judge0 workflow, and frontend contracts are a
natural fit for strict TypeScript, while placing every capability in Python
would remove that alignment.

### Separate databases or a dedicated vector database

Rejected for the MVP because they increase operational complexity before data
volume or query performance demonstrates a need.

## Review triggers

Review this decision when:

- server-rendering becomes a measured product or acquisition requirement;
- internal AI work requires durable background jobs;
- vector queries materially affect transactional workloads;
- hosted Judge0 becomes unacceptable in cost, latency, or limits; or
- multiple real-time Express instances require shared coordination.
