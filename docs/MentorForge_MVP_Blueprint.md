# MentorForge: Persistent AI Coding Coach

## Scalable MVP Product and Technical Blueprint

**Version 1.0 · July 2026**  
**Tagline:** *From first line of code to contest legend — a coach that never forgets.*

---

## 1. Executive Summary

MentorForge is a personalized learning platform for students and developers practicing Data Structures and Algorithms (DSA), competitive programming, coding interviews, debugging, and algorithmic thinking.

Its central idea is a **persistent AI mentor**. Instead of treating every interaction as a fresh conversation, MentorForge gradually builds a learner profile from attempts, submissions, hint requests, mistakes, topic mastery, solving speed, and long-term goals. It uses that profile to recommend suitable problems, provide progressive hints, and show meaningful progress.

The first release should validate this core promise without building a complex distributed system. The recommended approach is a **frontend-first modular application** with:

- React, TypeScript, and Vite for the user interface.
- Express.js for core application APIs, code submissions, contests, and future real-time features.
- FastAPI for AI hints, memory, recommendations, and streaming responses.
- One PostgreSQL database with pgvector.
- Supabase Auth for managed authentication.
- Hosted Judge0 for untrusted code execution.

The MVP deliberately avoids Kubernetes, Kafka, NATS, a separate vector database, custom code-execution infrastructure, and multi-agent frameworks. Each chosen component has a clear upgrade path, so simplicity now does not prevent scale later.

---

## 2. Product Vision

### 2.1 The problem

Current coding-learning tools have three recurring weaknesses:

1. **They forget the learner.** Guidance is useful in the moment but does not compound into a long-term understanding of strengths, weaknesses, or repeated mistakes.
2. **They provide generic learning paths.** Beginners and experienced learners often receive similar recommendations despite having very different needs.
3. **They can undermine authentic learning.** Complete generated solutions are easy to copy, while progressive guidance that preserves independent thinking is less common.

### 2.2 The solution

MentorForge turns learner activity into an evolving, inspectable profile. The system remembers evidence-backed patterns such as:

> The learner often selects the correct prefix-sum approach but misses integer-overflow edge cases.

The mentor then uses these memories to adapt:

- problem recommendations;
- hint depth and wording;
- revision suggestions;
- contest preparation;
- progress summaries; and
- future learning roadmaps.

The product principle is **“learning that remembers you.”**

### 2.3 Target users

**Complete beginner.** Needs a clear starting point, patient explanations, structured practice, and protection from information overload.

**Intermediate practitioner.** Can solve basic problems but needs targeted improvement, interview preparation, and diagnosis of recurring failure patterns.

**Serious competitive programmer.** Needs contest analysis, pressure practice, advanced recommendations, and insight into hidden weaknesses.

---

## 3. MVP Scope

### 3.1 Essential features

1. User registration, login, and onboarding.
2. Learner profile with goals, experience, and preferred language.
3. Searchable problem catalog with topic and difficulty filters.
4. Problem workspace with Monaco Editor.
5. Run and submit through Judge0.
6. Submission results and history.
7. Progressive AI hints that avoid revealing the full answer too early.
8. Basic long-term learner memory.
9. Personalized problem recommendations.
10. Basic progress dashboard.

### 3.2 Explicitly deferred

- Head-to-head duels.
- Public leaderboards.
- Complex virtual-contest generation.
- Advanced authenticity or keystroke analysis.
- Multi-agent orchestration.
- Native mobile applications.
- Kubernetes and microservices.
- NATS, Kafka, or RabbitMQ.
- Qdrant or another separate vector database.
- Custom code-execution containers.
- Advanced organization, mentor, or recruiter portals.

Deferred features should appear in the roadmap and data model only when a present requirement depends on them. Do not build speculative infrastructure.

---

## 4. Frontend-First Delivery Strategy

The first milestone is a polished, navigable React application using realistic mock data. Backend work begins only after the primary flows, contracts, and UI states are stable.

### Phase A — Frontend prototype

- Implement all main routes and responsive layouts.
- Use Mock Service Worker (MSW) for API simulation.
- Create reusable components and typed fixtures.
- Include loading, empty, error, disabled, and success states.
- Simulate code runs, submissions, hints, and recommendations.
- Validate complete flows with Playwright.

### Phase B — Core backend integration

- Add authentication.
- Replace mock problem, profile, submission, and progress endpoints with Express APIs.
- Integrate hosted Judge0.
- Persist core records in PostgreSQL.
- Keep the existing frontend API interface unchanged.

### Phase C — AI integration

- Add FastAPI endpoints for hints, memory, and recommendations.
- Stream AI output to React.
- Store learner memories with embeddings in PostgreSQL and pgvector.
- Add clear failure handling and AI request budgets.

### Phase D — Real-time and social features

- Add Socket.IO only when contests, presence, or duels require it.
- Begin with one Express instance and no Redis.
- Add a Redis adapter only when multiple Express instances are deployed.

---

## 5. Recommended Technology Stack

| Area | MVP choice | Responsibility |
|---|---|---|
| Frontend | React + TypeScript + Vite | Application UI |
| Routing | React Router | Client-side navigation |
| UI system | Tailwind CSS + shadcn/ui | Styling and accessible components |
| Server state | TanStack Query | API caching, mutations, invalidation |
| Local UI state | Zustand | Editor and workspace state |
| Code editor | Monaco Editor | Coding workspace |
| Core backend | Express.js + TypeScript | Product and submission APIs |
| AI backend | FastAPI + Python | Hints, memory, recommendations |
| Database | PostgreSQL | Durable product data |
| Vector search | pgvector | Learner-memory similarity search |
| Core ORM | Prisma | Express-owned schema and queries |
| AI ORM | SQLAlchemy + Alembic | FastAPI-owned schema and migrations |
| Authentication | Supabase Auth | Managed identity and JWTs |
| Execution | Hosted Judge0 | Sandboxed code execution |
| AI streaming | Fetch streaming or SSE | Progressive mentor output |
| Real-time later | Socket.IO | Contest and duel events |
| Local environment | Docker Compose | Reproducible development |
| Testing | Vitest, Pytest, Playwright | Unit, API, and end-to-end tests |

---

## 6. System Architecture

```text
React + Vite
    |
    +-- /api/* ------> Express.js
    |                    |
    |                    +-- PostgreSQL (core schema)
    |                    +-- Hosted Judge0
    |                    +-- Socket.IO (later)
    |
    +-- /ai/* -------> FastAPI
                         |
                         +-- PostgreSQL + pgvector (ai schema)
                         +-- LLM provider
```

Development ports:

```text
React:   http://localhost:5173
Express: http://localhost:3001
FastAPI: http://localhost:8000
```

Vite should proxy `/api` and `/socket.io` to Express and `/ai` to FastAPI. The browser therefore calls stable relative paths rather than environment-specific hostnames.

### 6.1 Express ownership

Express is the main application backend. It owns:

- users and learner-profile records;
- problems, topics, and test cases;
- attempts and submissions;
- Judge0 integration and verdict persistence;
- progress statistics;
- contests, future duels, and social features; and
- Socket.IO connections when real-time features are introduced.

Representative endpoints:

```http
GET    /api/problems
GET    /api/problems/:problemId
POST   /api/submissions/run
POST   /api/submissions
GET    /api/submissions/:submissionId
GET    /api/users/me/progress
GET    /api/users/me/submissions
```

### 6.2 FastAPI ownership

FastAPI is the AI intelligence service. It owns:

- progressive hints;
- learner-memory extraction and retrieval;
- embeddings;
- personalized recommendations;
- mistake classification;
- roadmap generation; and
- streamed AI responses.

Representative endpoints:

```http
POST /ai/hints/stream
POST /ai/submissions/analyze
POST /ai/memories/extract
GET  /ai/memories/search
GET  /ai/recommendations
POST /ai/roadmaps/generate
```

### 6.3 Service communication

For the MVP, services communicate through ordinary authenticated HTTP requests.

```text
Express saves Judge0 verdict
    -> Express calls POST /ai/submissions/analyze
    -> FastAPI identifies mistake patterns
    -> FastAPI creates or updates learner memories
```

Slow analysis can later move to a background queue without changing the public frontend contract.

---

## 7. Data Ownership and Core Model

Use one managed PostgreSQL database with two schemas:

| Schema | Owner | Example tables |
|---|---|---|
| `core` | Express + Prisma | users, learner_profiles, problems, topics, submissions, attempts |
| `ai` | FastAPI + SQLAlchemy/Alembic | learner_memories, memory_evidence, recommendations, ai_requests |

**Migration rule:** Express and FastAPI must never manage migrations for the same table.

FastAPI may read selected `core` tables, while Express may read published AI recommendations. Writes remain with the owning service.

### Learner-memory record

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai.learner_memories (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    memory_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    topic VARCHAR(100),
    confidence REAL NOT NULL DEFAULT 0.5,
    evidence_count INTEGER NOT NULL DEFAULT 1,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Every memory should link to evidence, include confidence, and be correctable by the learner. Low-confidence observations must not be presented as facts.

---

## 8. Primary User Experience

### 8.1 Main routes

```text
/
/login
/onboarding
/dashboard
/problems
/problems/:problemId
/submissions
/progress
/profile
/settings
```

### 8.2 Problem workspace

The problem workspace is the core screen. It should include:

- problem statement and examples;
- topic and difficulty metadata;
- Monaco Editor with language selector;
- Run and Submit actions;
- console output and verdict details;
- progressive hint panel;
- previous attempts; and
- responsive mobile/tablet behavior.

Required states:

- initial editor;
- unsaved draft;
- running;
- compiling;
- accepted;
- wrong answer;
- time limit exceeded;
- runtime error;
- Judge0 unavailable;
- hint streaming;
- hint complete;
- AI unavailable; and
- authentication expired.

### 8.3 Progressive hint policy

Hints should preserve independent thinking:

1. **Level 1 — Direction:** identify the relevant concept or question.
2. **Level 2 — Strategy:** outline an approach without implementation.
3. **Level 3 — Pseudocode:** provide structured steps.
4. **Level 4 — Debug assistance:** inspect the learner’s current code.
5. **Level 5 — Explanation:** reveal a complete approach only after explicit confirmation.

The system records hint depth so later recommendations can distinguish independent solutions from heavily assisted ones.

---

## 9. Frontend Structure and Contracts

```text
mentorforge/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── components/
│   │       ├── features/
│   │       ├── pages/
│   │       ├── routes/
│   │       ├── api/
│   │       ├── hooks/
│   │       ├── stores/
│   │       └── mocks/
│   ├── core-api/
│   │   ├── src/
│   │   └── prisma/
│   └── ai-api/
│       ├── app/
│       └── alembic/
├── packages/
│   └── shared-contracts/
├── docker-compose.yml
└── README.md
```

Feature folders:

```text
features/
├── auth/
├── onboarding/
├── dashboard/
├── problems/
├── editor/
├── submissions/
├── hints/
├── recommendations/
└── progress/
```

Use TanStack Query for server data and Zustand for temporary UI state.

```text
Server state -> TanStack Query
UI state     -> Zustand
```

Do not copy fetched API responses into Zustand. Define all API request and response types in `shared-contracts`, or generate the TypeScript client from OpenAPI once the APIs stabilize.

---

## 10. Authentication and Security

React obtains a Supabase access token and sends it to both backends:

```http
Authorization: Bearer <access-token>
```

Both services validate the token and derive the user identity from its claims.

Security requirements:

- Never expose the Supabase service-role key in React.
- Never execute user code inside Express or FastAPI containers.
- Send code only to hosted Judge0.
- Apply per-user and per-IP rate limits.
- Limit source size, output size, runtime, memory, and supported languages.
- Do not send secrets or database credentials to Judge0.
- Store only the telemetry required for learning features.
- Require explicit consent before collecting sensitive authenticity signals.
- Treat retrieved editorials and community content as untrusted input.

Initial languages should be limited to C++17/20, Python 3, Java, and JavaScript.

---

## 11. Testing and Quality

### Frontend

- Vitest and React Testing Library for components and hooks.
- MSW for deterministic API scenarios.
- Playwright for onboarding, problem solving, submission, hints, and progress flows.
- Automated accessibility checks for forms, dialogs, keyboard navigation, and color contrast.

### Express

- Unit tests for services and validation.
- Integration tests for routes and Prisma queries.
- Contract tests for Judge0 mapping and FastAPI calls.

### FastAPI

- Pytest for memory retrieval, prompt assembly, and endpoint behavior.
- Evaluation datasets for hint helpfulness, answer leakage, and mistake classification.
- Deterministic tests using mocked LLM responses.

### Required mock scenarios

```text
beginner-new-user
intermediate-stagnating
accepted-first-attempt
wrong-answer-edge-case
judge-timeout
ai-stream-interrupted
no-recommendations
expired-session
```

---

## 12. Delivery Plan

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| 1. UI foundation | Design system, routing, layouts, mock services | All primary routes work responsively |
| 2. Core learning flow | Catalog, editor, simulated run/submit, history | Complete mocked problem-solving journey |
| 3. Core backend | Auth, Express APIs, PostgreSQL, Judge0 | Real submissions persist with verdicts |
| 4. AI mentor | FastAPI hints, memory, recommendations | Personalized streamed hints work end to end |
| 5. Progress | Dashboard and topic analytics | Learner can understand improvement areas |
| 6. Beta hardening | Tests, monitoring, rate limits, deployment | Stable closed beta with measurable usage |

### Suggested first four development sprints

1. **Foundation:** repository, React shell, navigation, design tokens, MSW, authentication screens.
2. **Practice flow:** catalog, filters, problem page, Monaco Editor, result panels, responsive states.
3. **Data integration:** Express, Prisma, PostgreSQL, real authentication, core API contracts.
4. **Submission and mentor:** Judge0 integration, FastAPI streaming hints, first memory and recommendation loop.

---

## 13. Scale-Up Path

| MVP design | Upgrade trigger | Later change |
|---|---|---|
| One PostgreSQL database | Vector queries measurably hurt OLTP | Add Qdrant |
| Hosted Judge0 | Cost, limits, or latency become material | Self-host isolated Judge0 workers |
| Direct HTTP between services | Slow jobs affect request latency | Add a background task queue |
| One Express instance | Multiple real-time instances required | Add Redis and Socket.IO adapter |
| Direct Python AI services | Workflows need branching and recovery | Introduce LangGraph selectively |
| PostgreSQL analytics | Reporting workloads affect product queries | Add read replica or ClickHouse |
| Managed deployments | Operational demands justify orchestration | Consider containers/Kubernetes |

The interfaces between React, Express, FastAPI, PostgreSQL, and Judge0 are intentional boundaries. Scaling should happen behind these boundaries rather than through a rewrite.

---

## 14. Success Measures

The MVP succeeds if learners repeatedly use the core loop and report that guidance becomes more relevant over time.

Track:

- weekly active learners;
- problems attempted and completed;
- independent acceptance rate;
- hint requests per solved problem;
- return rate after seven and thirty days;
- recommendation click and completion rate;
- AI time to first token;
- Judge0 submission latency and failure rate;
- memory retrieval latency; and
- learner correction or deletion of memories.

Avoid vanity metrics that do not demonstrate learning value.

---

## 15. Final Architecture Decision

```text
Frontend
  React + TypeScript + Vite
  React Router
  Tailwind CSS + shadcn/ui
  Monaco Editor
  TanStack Query
  Zustand

Core application
  Express.js + TypeScript
  Prisma
  Judge0 integration
  Socket.IO later

AI intelligence
  FastAPI
  Pydantic
  SQLAlchemy + Alembic
  Direct LLM SDK calls
  Streaming responses

Data and identity
  PostgreSQL
  pgvector
  Supabase Auth
```

MentorForge should begin as **one product with two specialized backend services**, not as a microservice platform. This is small enough for a beginner team to understand, practical enough for a polished MVP, and structured enough to evolve when real usage proves which parts need to scale.
