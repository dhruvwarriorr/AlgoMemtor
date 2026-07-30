# MentorForge Project Documentation

> A beginner-friendly, implementation-ready guide for building MentorForge from scratch.

**Project:** MentorForge — Your Persistent AI Coding Coach  
**Tagline:** *From first line of code to contest legend — a coach that never forgets.*  
**Document version:** 1.0  
**Last updated:** July 2026  
**Companion file:** [`ROADMAP.md`](./ROADMAP.md)

---

## Table of Contents

1. [How to Use This Document](#1-how-to-use-this-document)
2. [Product Overview](#2-product-overview)
3. [MVP Scope](#3-mvp-scope)
4. [Important Concepts for a Beginner](#4-important-concepts-for-a-beginner)
5. [Technology Stack](#5-technology-stack)
6. [System Architecture](#6-system-architecture)
7. [Development Prerequisites](#7-development-prerequisites)
8. [Create the Project from Scratch](#8-create-the-project-from-scratch)
9. [Repository Structure](#9-repository-structure)
10. [Environment Variables](#10-environment-variables)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Screens, Routes, and User Experience](#12-screens-routes-and-user-experience)
13. [Mock-First Development](#13-mock-first-development)
14. [Express Core API](#14-express-core-api)
15. [FastAPI AI Service](#15-fastapi-ai-service)
16. [Authentication](#16-authentication)
17. [Database Design](#17-database-design)
18. [Code Execution with Judge0](#18-code-execution-with-judge0)
19. [AI Hint System](#19-ai-hint-system)
20. [Learner Memory](#20-learner-memory)
21. [Recommendation System](#21-recommendation-system)
22. [Progress Dashboard](#22-progress-dashboard)
23. [API Design Standards](#23-api-design-standards)
24. [Validation and Error Handling](#24-validation-and-error-handling)
25. [Testing Strategy](#25-testing-strategy)
26. [Security and Privacy](#26-security-and-privacy)
27. [Logging and Observability](#27-logging-and-observability)
28. [Deployment](#28-deployment)
29. [Git Workflow](#29-git-workflow)
30. [Coding Conventions](#30-coding-conventions)
31. [Definition of Done](#31-definition-of-done)
32. [Common Beginner Mistakes](#32-common-beginner-mistakes)
33. [Troubleshooting](#33-troubleshooting)
34. [Glossary](#34-glossary)
35. [Official References](#35-official-references)

---

# 1. How to Use This Document

This document is the technical reference for the project. Read it once from sections 1–10 before writing code. After that, use it as a lookup guide while following the implementation sequence in `ROADMAP.md`.

Do not try to understand or implement everything at once. MentorForge contains several independent ideas:

- a normal React web application;
- a normal Express REST API;
- a PostgreSQL database;
- an external code-execution service;
- a small FastAPI AI service; and
- an AI memory and recommendation layer.

You will build them in that order. At every stage, the application should still run.

## Rules for the project

1. Build the smallest working version before improving it.
2. Complete one vertical feature at a time.
3. Keep the frontend working with mocks before the real API exists.
4. Do not add infrastructure until a feature requires it.
5. Never store secrets in Git.
6. Never execute user code inside your own API containers.
7. Write down unexpected technical decisions in an Architecture Decision Record.
8. A feature is not finished until loading, empty, error, and success states work.

---

# 2. Product Overview

## 2.1 What MentorForge is

MentorForge is a learning and competitive-programming platform for students and developers practicing:

- Data Structures and Algorithms;
- competitive programming;
- coding interview questions;
- debugging;
- algorithmic thinking;
- contest strategy; and
- consistent, independent problem-solving.

Its main differentiator is a **persistent AI mentor**. A normal chatbot answers the current question. MentorForge also remembers useful evidence from earlier work, such as:

- topics the learner understands;
- repeated mistakes;
- preferred programming language;
- average solving time;
- recent hint usage;
- unsuccessful approaches;
- confidence by topic;
- learning goals; and
- problems that should be revised.

## 2.2 The core product loop

```mermaid
flowchart TD
    A["Choose recommended problem"] --> B["Write and run code"]
    B --> C{"Need help?"}
    C -- "Yes" --> D["Receive progressive hint"]
    D --> B
    C -- "No" --> E["Submit solution"]
    E --> F["Store result and analyze attempt"]
    F --> G["Update learner profile"]
    G --> A
```

The loop is more important than contests, duels, leaderboards, or social features. If the loop is not useful, extra features will not save the product.

## 2.3 Target users

### Complete beginner

Needs a clear learning path, approachable explanations, small wins, and protection from advanced content arriving too early.

### Intermediate learner

Can solve easy problems but needs targeted revision, interview preparation, and help identifying recurring mistakes.

### Competitive programmer

Needs contest-oriented practice, advanced problem selection, speed analysis, and insight into weaknesses that are hard to notice manually.

## 2.4 Product principles

- **Teach before revealing.** Hints should preserve independent thinking.
- **Remember with evidence.** Memories must link to attempts, hints, or submissions.
- **Personalize carefully.** Low-confidence observations are suggestions, not facts.
- **Show the learner their data.** Users should be able to inspect and correct memories.
- **Stay useful without AI.** Problem browsing, submissions, and progress must still work if the AI provider is unavailable.
- **Prefer clarity over cleverness.** Beginner maintainers should understand the code.

---

# 3. MVP Scope

## 3.1 Features included in the MVP

### Account and onboarding

- Email-based registration and login.
- Goal selection: DSA, interviews, competitive programming, or mixed.
- Experience level.
- Preferred programming language.
- Topics already studied.
- Weekly practice target.

### Problem catalog

- Problem cards.
- Search by title.
- Filter by difficulty and topic.
- Solved/attempted status.
- Bookmarking may be added if time permits.

### Problem workspace

- Problem statement.
- Constraints and examples.
- Monaco code editor.
- Language selection.
- Run with custom input.
- Submit against hidden test cases.
- Verdict, output, execution time, and compiler/runtime errors.
- Progressive AI hint panel.

### Learner intelligence

- Basic learner profile.
- Evidence-backed learner memories.
- Personalized problem recommendations.
- Topic-level progress.
- Recent activity and submission history.

## 3.2 Features not included in the MVP

Do not implement these during the initial roadmap:

- real-time duels;
- friends, circles, and messaging;
- public leaderboards;
- advanced contests;
- custom Judge0 infrastructure;
- custom Docker execution;
- typing-pattern authenticity scoring;
- recruiter or mentor dashboards;
- Qdrant;
- Kafka, NATS, or RabbitMQ;
- Kubernetes;
- ClickHouse;
- LangGraph, CrewAI, or another agent framework;
- native mobile apps; or
- payments.

Add these only after the MVP is deployed and used by real learners.

## 3.3 MVP success criteria

The MVP is ready for a small beta when a user can:

1. create an account;
2. finish onboarding;
3. browse a realistic problem list;
4. open a problem;
5. write and run code;
6. submit and receive a verdict;
7. request progressive hints;
8. see the attempt in history;
9. receive a new recommendation; and
10. inspect their basic progress.

---

# 4. Important Concepts for a Beginner

## 4.1 Frontend

The frontend is the code that runs in the browser. It displays pages, buttons, forms, editor panels, loading indicators, and errors. MentorForge uses React for this.

## 4.2 Backend

A backend receives requests, validates them, talks to databases or other services, and returns responses. MentorForge has two backends with different jobs:

- Express owns normal product behavior.
- FastAPI owns AI behavior.

## 4.3 REST API

A REST API exposes URLs such as:

```http
GET /api/problems
POST /api/submissions
```

The HTTP method describes the action:

- `GET`: read data;
- `POST`: create something or start an action;
- `PATCH`: partially update something;
- `DELETE`: remove something.

## 4.4 Database

The database stores durable information. If the server restarts, database records remain. PostgreSQL stores users, problems, submissions, memories, and recommendations.

## 4.5 ORM

An Object-Relational Mapper lets application code work with database records through typed functions instead of writing raw SQL for every operation.

- Express uses Prisma.
- FastAPI uses SQLAlchemy.

## 4.6 Migration

A migration is a versioned database change. For example, adding a `difficulty` column creates a migration that can be applied consistently on every developer machine and deployment.

## 4.7 Authentication and authorization

- **Authentication:** Who is the user?
- **Authorization:** Is this user allowed to perform this action?

A valid login does not automatically permit access to another user’s submissions.

## 4.8 Server state and UI state

**Server state** comes from the API: problems, submissions, profile, recommendations. TanStack Query manages this.

**UI state** exists only to control the current interface: selected tab, panel width, unsaved code, editor theme. Zustand or component state manages this.

## 4.9 Embedding and vector search

An embedding converts text into a numeric vector. Similar meanings produce nearby vectors. MentorForge uses embeddings to find relevant learner memories.

You do not need to understand the mathematics to build the first version. You need to understand the flow:

```text
Memory text -> embedding model -> vector -> pgvector column
Current problem -> embedding model -> query vector -> nearest memories
```

## 4.10 Streaming

AI text may arrive one small piece at a time instead of waiting for the entire answer. This improves perceived speed. Use `fetch()` with a streaming response or Server-Sent Events for FastAPI output.

---

# 5. Technology Stack

| Layer | Technology | Why it is used |
|---|---|---|
| Web UI | React + TypeScript | Component-based UI with type safety |
| Build tool | Vite | Fast local development and simple builds |
| Routing | React Router | Page navigation |
| Styling | Tailwind CSS + shadcn/ui | Consistent, accessible components |
| Remote state | TanStack Query | Fetching, caching, retries, invalidation |
| Local state | Zustand | Small editor/workspace state |
| Code editor | Monaco Editor | VS Code-like coding experience |
| Mock API | MSW | Frontend-first development |
| Core API | Express.js + TypeScript | Product logic and Judge0 integration |
| Core ORM | Prisma | Typed PostgreSQL access |
| AI API | FastAPI + Python | AI, memory, and streaming |
| AI ORM | SQLAlchemy + Alembic | AI-owned tables and migrations |
| Database | PostgreSQL | Reliable relational source of truth |
| Vector extension | pgvector | MVP semantic search |
| Authentication | Supabase Auth | Managed users and tokens |
| Code execution | Hosted Judge0 | Sandboxed code compilation/execution |
| Frontend tests | Vitest + Testing Library | Components and hooks |
| API tests | Vitest/Supertest + Pytest | Express and FastAPI |
| End-to-end tests | Playwright | Browser workflows |
| Local services | Docker Compose | Reproducible PostgreSQL setup |

## Why there are two backends

The two-backend split is an explicit project choice:

| Express owns | FastAPI owns |
|---|---|
| users and profiles | LLM provider calls |
| problems and topics | progressive hints |
| attempts and submissions | learner-memory extraction |
| Judge0 | embeddings and retrieval |
| progress data | recommendation generation |
| contests later | AI response streaming |
| Socket.IO later | AI evaluation utilities |

Do not implement the same feature in both services.

---

# 6. System Architecture

```mermaid
flowchart TD
    UI["React + Vite"] -->|"/api/*"| CORE["Express Core API"]
    UI -->|"/ai/*"| AI["FastAPI AI API"]
    CORE --> DB[("PostgreSQL")]
    AI --> DB
    CORE --> JUDGE["Hosted Judge0"]
    AI --> LLM["LLM + Embedding Provider"]
    CORE -->|Internal HTTP| AI
```

## 6.1 Development URLs

| Service | Default URL |
|---|---|
| React | `http://localhost:5173` |
| Express | `http://localhost:3001` |
| FastAPI | `http://localhost:8000` |
| PostgreSQL | `localhost:5432` |
| FastAPI Swagger UI | `http://localhost:8000/docs` |

## 6.2 Request examples

### Load a problem

```text
React -> GET /api/problems/:id -> Express -> PostgreSQL -> React
```

### Submit code

```text
React
  -> POST /api/submissions
  -> Express validates request
  -> Express creates pending submission
  -> Express sends code to Judge0
  -> Express polls Judge0
  -> Express stores verdict
  -> Express returns result
```

### Request a hint

```text
React
  -> POST /ai/hints/stream
  -> FastAPI verifies user
  -> FastAPI loads problem and relevant memories
  -> FastAPI calls LLM
  -> FastAPI streams hint
  -> FastAPI records hint metadata
```

## 6.3 Beginner-friendly scaling rule

Start with:

- one React deployment;
- one Express process;
- one FastAPI process;
- one PostgreSQL database; and
- external Judge0 and LLM providers.

Scale only after measuring a problem.

---

# 7. Development Prerequisites

## 7.1 Required knowledge

You do not need to be an expert, but you should understand:

- variables, functions, arrays, and objects;
- JavaScript promises and `async/await`;
- basic TypeScript types;
- React components, props, and hooks;
- HTTP requests and JSON;
- basic SQL;
- basic Python functions and classes;
- Git commits and branches.

If one of these is unfamiliar, spend a focused day learning it before implementing the related phase.

## 7.2 Required software

Install:

- Git;
- Node.js 22 LTS or another version supported by current Vite;
- npm;
- Python 3.12 or a current supported Python version;
- `uv` for Python dependency management;
- Docker Desktop or Docker Engine with Compose;
- VS Code;
- a PostgreSQL client such as DBeaver, TablePlus, or the `psql` CLI;
- an API client such as Bruno, Insomnia, or Postman.

Check installations:

```bash
git --version
node --version
npm --version
python --version
uv --version
docker --version
docker compose version
```

## 7.3 Recommended VS Code extensions

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Prisma
- Python
- Pylance
- Ruff
- Docker
- Error Lens

## 7.4 Accounts needed later

Do not create every account on day one. Create them when the roadmap reaches the feature:

- GitHub;
- Supabase;
- hosted Judge0 provider;
- LLM/embedding provider;
- frontend hosting provider;
- Node/Python API hosting provider.

---

# 8. Create the Project from Scratch

The commands below create a monorepo. A monorepo keeps the frontend and both backends in one Git repository.

## 8.1 Create the root

```bash
mkdir mentorforge
cd mentorforge
git init
npm init -y
mkdir apps packages docs
```

Create the first files:

```text
mentorforge/
├── apps/
├── packages/
├── docs/
├── .gitignore
├── README.md
├── PROJECT_DOCUMENTATION.md
├── ROADMAP.md
└── package.json
```

## 8.2 Create the React application

```bash
npm create vite@latest apps/web -- --template react-ts
cd apps/web
npm install
npm run dev
```

Visit `http://localhost:5173`.

Install initial frontend dependencies:

```bash
npm install react-router-dom @tanstack/react-query zustand zod
npm install @supabase/supabase-js
npm install -D msw vitest @testing-library/react @testing-library/jest-dom
```

Install Tailwind and shadcn/ui using their current official setup instructions. Their setup commands may change, so do not copy an old tutorial blindly.

Add Monaco only when beginning the problem-workspace milestone:

```bash
npm install @monaco-editor/react
```

## 8.3 Create the Express application

```bash
mkdir -p apps/core-api/src
cd apps/core-api
npm init -y
npm install express cors helmet zod dotenv
npm install -D typescript tsx @types/node @types/express @types/cors
npx tsc --init
```

Recommended scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `src/server.ts`:

```ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "core-api" });
});

app.listen(port, () => {
  console.log(`Core API listening on http://localhost:${port}`);
});
```

Run:

```bash
npm run dev
```

## 8.4 Create the FastAPI application

From the repository root:

```bash
cd apps
uv init ai-api --bare
cd ai-api
uv add "fastapi[standard]" pydantic-settings sqlalchemy alembic psycopg
uv add --dev pytest pytest-asyncio ruff
mkdir -p app/api app/core app/services app/repositories app/schemas
```

Create `app/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(title="MentorForge AI API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-api"}
```

Run:

```bash
uv run fastapi dev app/main.py --port 8000
```

Visit:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

## 8.5 Add PostgreSQL with Docker Compose

Create `docker-compose.yml` at the repository root:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: mentorforge
      POSTGRES_PASSWORD: mentorforge_local
      POSTGRES_DB: mentorforge
    ports:
      - "5432:5432"
    volumes:
      - mentorforge_postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mentorforge -d mentorforge"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  mentorforge_postgres:
```

Start and inspect:

```bash
docker compose up -d
docker compose ps
docker compose logs postgres
```

Do not add the database until the mock frontend is usable. This setup is documented early so the final structure is clear.

## 8.6 Root development scripts

Install a simple process runner at the root:

```bash
npm install -D concurrently
```

Example root scripts:

```json
{
  "scripts": {
    "dev:web": "npm --prefix apps/web run dev",
    "dev:core": "npm --prefix apps/core-api run dev",
    "dev:ai": "cd apps/ai-api && uv run fastapi dev app/main.py --port 8000",
    "dev": "concurrently -n WEB,CORE,AI -c cyan,green,magenta \"npm:dev:web\" \"npm:dev:core\" \"npm:dev:ai\""
  }
}
```

---

# 9. Repository Structure

```text
mentorforge/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── assets/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   ├── layouts/
│   │   │   ├── lib/
│   │   │   ├── mocks/
│   │   │   ├── pages/
│   │   │   ├── routes/
│   │   │   ├── stores/
│   │   │   ├── styles/
│   │   │   └── types/
│   │   └── package.json
│   ├── core-api/
│   │   ├── prisma/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── controllers/
│   │   │   ├── errors/
│   │   │   ├── integrations/
│   │   │   ├── middleware/
│   │   │   ├── repositories/
│   │   │   ├── routes/
│   │   │   ├── schemas/
│   │   │   ├── services/
│   │   │   └── utils/
│   │   ├── tests/
│   │   └── package.json
│   └── ai-api/
│       ├── alembic/
│       ├── app/
│       │   ├── api/
│       │   ├── core/
│       │   ├── models/
│       │   ├── prompts/
│       │   ├── repositories/
│       │   ├── schemas/
│       │   └── services/
│       ├── tests/
│       ├── pyproject.toml
│       └── uv.lock
├── packages/
│   └── shared-contracts/
├── docs/
│   ├── adr/
│   ├── api/
│   └── diagrams/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── PROJECT_DOCUMENTATION.md
└── ROADMAP.md
```

## 9.1 Layer responsibilities

### Controller

Reads the HTTP request, calls a service, and returns an HTTP response. It should not contain database queries or large business rules.

### Service

Contains business logic. Example: create a pending submission, send it to Judge0, map the verdict, and save the result.

### Repository

Contains database queries. Example: `findProblemById` or `createSubmission`.

### Integration/client

Talks to external services. Example: Judge0, Supabase JWKS, or an LLM provider.

### Schema

Defines and validates request/response shapes.

---

# 10. Environment Variables

Create a committed `.env.example` without real secrets. Each application may use its own `.env`.

## 10.1 Frontend

```dotenv
VITE_CORE_API_URL=http://localhost:3001
VITE_AI_API_URL=http://localhost:8000
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_USE_MOCKS=true
```

Only variables beginning with `VITE_` are available to browser code. Anything available to the browser must be treated as public.

## 10.2 Express

```dotenv
NODE_ENV=development
PORT=3001
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://mentorforge:mentorforge_local@localhost:5432/mentorforge
SUPABASE_URL=
SUPABASE_JWT_ISSUER=
JUDGE0_BASE_URL=
JUDGE0_API_KEY=
AI_API_URL=http://localhost:8000
INTERNAL_SERVICE_TOKEN=replace-in-production
```

## 10.3 FastAPI

```dotenv
APP_ENV=development
PORT=8000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql+psycopg://mentorforge:mentorforge_local@localhost:5432/mentorforge
SUPABASE_URL=
SUPABASE_JWT_ISSUER=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_MODEL=
INTERNAL_SERVICE_TOKEN=replace-in-production
```

## 10.4 `.gitignore`

At minimum:

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
coverage/
playwright-report/
test-results/
.DS_Store
```

---

# 11. Frontend Architecture

## 11.1 Feature-based organization

Group code by product feature, not only by file type:

```text
src/features/problems/
├── api/
├── components/
├── hooks/
├── schemas/
├── types/
└── utils/
```

This keeps all problem-related logic near each other.

## 11.2 Application providers

Create one `AppProviders` component that configures:

- TanStack Query;
- React Router;
- authentication context;
- theme provider;
- toast/notification provider; and
- development mocks.

## 11.3 State ownership

| State | Owner |
|---|---|
| Problem list | TanStack Query |
| Problem details | TanStack Query |
| Submission history | TanStack Query |
| Recommendations | TanStack Query |
| User session | Supabase client + auth context |
| Current unsaved code | Zustand |
| Selected language | Zustand |
| Editor theme | Zustand |
| Active workspace tab | Component state or Zustand |
| Dialog open/closed | Component state |
| URL filters | React Router search parameters |

## 11.4 API client

Create one wrapper around `fetch`:

```ts
type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, options);

  if (!response.ok) {
    const body = (await response.json()) as ApiErrorBody;
    throw new Error(body.error.message);
  }

  return (await response.json()) as T;
}
```

Later, add the access token automatically.

## 11.5 Reusable component categories

### Foundation

- `Button`
- `Input`
- `Select`
- `Dialog`
- `Tabs`
- `Badge`
- `Tooltip`
- `Skeleton`
- `EmptyState`
- `ErrorState`
- `PageHeader`

### Domain components

- `ProblemCard`
- `DifficultyBadge`
- `TopicBadge`
- `ProblemFilters`
- `CodeEditor`
- `LanguageSelector`
- `RunResultPanel`
- `SubmissionVerdict`
- `HintPanel`
- `HintLevelIndicator`
- `RecommendationCard`
- `TopicProgressCard`
- `RecentActivityList`

Do not create a component for a single `div` merely to create more files. Extract a component when it has a clear responsibility, is reused, or is difficult to read inline.

---

# 12. Screens, Routes, and User Experience

## 12.1 Route map

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page |
| `/login` | Public | Login and sign-up |
| `/auth/callback` | Public | Supabase callback |
| `/onboarding` | Authenticated | Initial learner setup |
| `/dashboard` | Authenticated | Main personalized overview |
| `/problems` | Authenticated | Catalog and filters |
| `/problems/:problemId` | Authenticated | Coding workspace |
| `/submissions` | Authenticated | Submission history |
| `/submissions/:submissionId` | Authenticated | Submission detail |
| `/progress` | Authenticated | Topic analytics |
| `/profile` | Authenticated | Learner profile |
| `/settings` | Authenticated | Account and preferences |
| `*` | Any | Not-found page |

## 12.2 Every page must support

- loading state;
- empty state when applicable;
- error state with retry;
- normal data state;
- narrow mobile layout;
- keyboard navigation;
- readable focus indicators; and
- useful page title.

## 12.3 Dashboard

Display:

- greeting and weekly target;
- recommended next problem;
- topic progress;
- recent submissions;
- current practice streak;
- “continue problem” action;
- weak-topic suggestion; and
- AI mentor summary.

Do not make the dashboard a collection of decorative charts. Each card should lead to an action.

## 12.4 Problem catalog

Filters:

- search text;
- difficulty;
- topic;
- status: not started, attempted, solved;
- source, if multiple sources exist later.

Keep filters in URL query parameters:

```text
/problems?difficulty=easy&topic=arrays&status=unsolved
```

This makes filter states bookmarkable and shareable.

## 12.5 Problem workspace

Desktop layout:

```text
+----------------------+--------------------------------+
| Statement / Hints    | Monaco Editor                  |
| Examples / Attempts  | Language + Run + Submit        |
|                      | Console / Verdict              |
+----------------------+--------------------------------+
```

Mobile layout should use tabs rather than two narrow columns.

Workspace states:

- draft loaded;
- draft save failed;
- running;
- run completed;
- submitting;
- accepted;
- wrong answer;
- compile error;
- runtime error;
- time limit exceeded;
- service unavailable;
- hint streaming;
- hint stopped;
- hint failed; and
- unauthenticated/expired session.

## 12.6 Onboarding

Use a short multi-step form:

1. primary goal;
2. experience level;
3. preferred language;
4. known topics;
5. weekly target;
6. summary and confirmation.

Save progress locally so a refresh does not erase the form.

---

# 13. Mock-First Development

## 13.1 Why mocks come first

The frontend should not wait for database or AI work. Mocking allows you to:

- validate navigation;
- improve layouts;
- agree on API shapes;
- build loading/error states;
- test complete workflows; and
- avoid debugging three systems simultaneously.

## 13.2 MSW scenarios

Create handlers for:

```text
GET  /api/users/me
GET  /api/problems
GET  /api/problems/:id
POST /api/submissions/run
POST /api/submissions
GET  /api/submissions
GET  /api/progress
GET  /ai/recommendations
POST /ai/hints/stream
```

Required fixtures:

- `beginner-new-user`;
- `intermediate-stagnating`;
- `advanced-contest-user`;
- `accepted-first-attempt`;
- `wrong-answer-edge-case`;
- `judge-timeout`;
- `ai-unavailable`;
- `empty-submission-history`; and
- `expired-session`.

## 13.3 Keep mock and real contracts identical

If the mock returns:

```json
{
  "data": {
    "id": "problem_1",
    "title": "Two Sum",
    "difficulty": "easy"
  }
}
```

the real API must return the same shape. A mock is a temporary implementation of a permanent contract.

---

# 14. Express Core API

## 14.1 Responsibilities

Express owns:

- profile and onboarding;
- problems and topics;
- attempts and submissions;
- Judge0;
- history and progress;
- core authorization;
- contests and Socket.IO later.

Express does not generate hints or embeddings.

## 14.2 Request lifecycle

```mermaid
flowchart LR
    R["Route"] --> M["Middleware"]
    M --> C["Controller"]
    C --> S["Service"]
    S --> P["Repository"]
    P --> D[("PostgreSQL")]
```

## 14.3 Core endpoints

### User

```http
GET   /api/users/me
PATCH /api/users/me
POST  /api/users/me/onboarding
GET   /api/users/me/progress
```

### Problems

```http
GET /api/problems
GET /api/problems/:problemId
GET /api/topics
```

### Drafts and attempts

```http
PUT  /api/problems/:problemId/draft
GET  /api/problems/:problemId/draft
POST /api/attempts
```

### Submissions

```http
POST /api/submissions/run
POST /api/submissions
GET  /api/submissions
GET  /api/submissions/:submissionId
```

## 14.4 Submission service pseudocode

```ts
async function submitSolution(input: SubmitSolutionInput) {
  const problem = await problemRepository.findById(input.problemId);
  authorizeProblemAccess(input.userId, problem);

  const submission = await submissionRepository.createPending(input);

  try {
    const judgeToken = await judgeClient.createSubmission({
      sourceCode: input.sourceCode,
      language: input.language,
      testBundle: problem.testBundle,
    });

    const result = await judgeClient.waitForResult(judgeToken);
    const saved = await submissionRepository.complete(submission.id, result);

    void aiClient.analyzeSubmission(saved.id);
    return saved;
  } catch (error) {
    await submissionRepository.markSystemError(submission.id);
    throw error;
  }
}
```

The AI analysis is best-effort. A successful judge result must not be lost because the AI service is temporarily unavailable.

---

# 15. FastAPI AI Service

## 15.1 Responsibilities

FastAPI owns:

- prompt construction;
- hint generation;
- streaming;
- memory extraction;
- embedding generation;
- semantic retrieval;
- recommendation reasoning; and
- AI usage metadata.

## 15.2 Structure

```text
app/
├── main.py
├── api/
│   ├── dependencies.py
│   ├── hints.py
│   ├── memories.py
│   └── recommendations.py
├── core/
│   ├── config.py
│   ├── database.py
│   ├── logging.py
│   └── security.py
├── models/
├── schemas/
├── repositories/
├── services/
│   ├── hint_service.py
│   ├── llm_service.py
│   ├── memory_service.py
│   ├── embedding_service.py
│   └── recommendation_service.py
└── prompts/
```

## 15.3 Endpoints

```http
POST /ai/hints/stream
POST /ai/submissions/analyze
GET  /ai/memories
PATCH /ai/memories/:memoryId
DELETE /ai/memories/:memoryId
GET  /ai/recommendations
POST /ai/recommendations/refresh
```

## 15.4 Do not start with agents

Use plain services:

```python
class HintService:
    def __init__(
        self,
        memory_service: MemoryService,
        llm_service: LLMService,
    ) -> None:
        self.memory_service = memory_service
        self.llm_service = llm_service

    async def stream_hint(self, request: HintRequest):
        memories = await self.memory_service.find_relevant(
            user_id=request.user_id,
            query=request.problem_summary,
            limit=5,
        )
        async for token in self.llm_service.stream_hint(request, memories):
            yield token
```

Introduce a workflow framework only when you have demonstrated branching, retries, checkpointing, or long-running jobs that are difficult to manage with normal functions.

---

# 16. Authentication

## 16.1 Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as React
    participant S as Supabase Auth
    participant A as Express/FastAPI
    U->>W: Enter email or credentials
    W->>S: Sign in
    S-->>W: Session and access token
    W->>A: Request with Bearer token
    A->>A: Verify signature and claims
    A-->>W: User-specific response
```

## 16.2 Frontend behavior

- Keep session logic in one auth provider.
- Add the bearer token to API requests.
- Redirect unauthenticated users to `/login`.
- Redirect authenticated but incomplete users to `/onboarding`.
- Handle expired sessions by attempting refresh and then returning to login.

## 16.3 Backend behavior

- Verify token signature using the configured issuer/signing keys.
- Read the user ID from verified claims.
- Never trust a `userId` sent in a request body.
- Check record ownership in repositories or services.

## 16.4 Database user mapping

Supabase owns identity records. Your `core.users` table stores application-specific fields and references the Supabase user ID.

---

# 17. Database Design

## 17.1 Schema ownership

Use one PostgreSQL database with two logical schemas:

```text
core -> Express/Prisma migrations
ai   -> FastAPI/Alembic migrations
```

Never let Prisma and Alembic modify the same table.

## 17.2 Core tables

### `core.users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Application user ID |
| `auth_user_id` | UUID | Unique Supabase identity ID |
| `display_name` | text | Learner-visible name |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update |

### `core.learner_profiles`

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID | Primary/foreign key |
| `goal` | enum/text | DSA, interview, CP, mixed |
| `experience_level` | text | beginner/intermediate/advanced |
| `preferred_language` | text | cpp/python/java/javascript |
| `weekly_target` | integer | Problems per week |
| `onboarding_completed` | boolean | Route guard |

### `core.topics`

Examples: arrays, strings, hashing, recursion, trees, graphs, dynamic programming.

### `core.problems`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `slug` | text | Unique URL-safe identifier |
| `title` | text | Display name |
| `statement` | text | Markdown content |
| `difficulty` | text | easy/medium/hard |
| `constraints` | jsonb | Structured constraints |
| `examples` | jsonb | Inputs, outputs, explanations |
| `starter_code` | jsonb | Language-to-code mapping |
| `is_published` | boolean | Visibility |

### `core.problem_topics`

Many-to-many link between problems and topics.

### `core.attempts`

Represents a practice session, including open time, close time, and hint count.

### `core.submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner |
| `problem_id` | UUID | Problem |
| `source_code` | text | Submitted code |
| `language` | text | Language key |
| `status` | text | pending/accepted/etc. |
| `judge_token` | text | External reference |
| `execution_time_ms` | integer | Nullable |
| `memory_kb` | integer | Nullable |
| `stdout` | text | Size-limited |
| `stderr` | text | Size-limited |
| `compiler_output` | text | Size-limited |
| `submitted_at` | timestamptz | Submission time |

### `core.code_drafts`

Unique by `user_id + problem_id + language`.

## 17.3 AI tables

### `ai.hint_requests`

Store problem, hint level, timestamps, model identifier, and completion status. Avoid storing unnecessary raw prompts indefinitely.

### `ai.learner_memories`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | Learner |
| `memory_type` | text | weakness/strength/preference/goal |
| `content` | text | Human-readable memory |
| `topic` | text | Optional topic |
| `confidence` | real | 0–1 |
| `evidence_count` | integer | Supporting events |
| `embedding` | vector | Embedding |
| `status` | text | active/superseded/deleted |
| `created_at` | timestamptz | Created |
| `updated_at` | timestamptz | Revised |

### `ai.memory_evidence`

Links memories to submission IDs, attempt IDs, or hint request IDs.

### `ai.recommendations`

Stores the recommended problem, score, explanation, generation time, and whether the user acted on it.

## 17.4 Indexes

At minimum:

- unique index on `users.auth_user_id`;
- unique index on `problems.slug`;
- index on `submissions(user_id, submitted_at desc)`;
- index on `submissions(problem_id, status)`;
- index on `learner_memories(user_id, status)`;
- vector index only after enough records exist to justify it.

## 17.5 Seed data

Start with 20–30 curated problems across:

- arrays;
- strings;
- hashing;
- two pointers;
- binary search;
- recursion;
- linked lists;
- stacks/queues;
- trees;
- basic graphs.

Every seed problem needs:

- statement;
- examples;
- constraints;
- topics;
- difficulty;
- starter code;
- visible sample cases; and
- hidden judge cases.

---

# 18. Code Execution with Judge0

## 18.1 Safety boundary

Never run learner code using:

- Node `child_process`;
- Python `subprocess`;
- `eval`;
- a shell command;
- the Express container; or
- the FastAPI container.

Use hosted Judge0 for the MVP.

## 18.2 Run versus submit

### Run

- Uses user-provided custom input.
- Does not affect solved status.
- Returns output and errors.

### Submit

- Uses hidden test cases.
- Creates a durable submission.
- Updates solved/progress data.
- May trigger asynchronous AI analysis.

## 18.3 Status mapping

Map provider statuses to stable internal statuses:

```text
pending
processing
accepted
wrong_answer
compile_error
runtime_error
time_limit_exceeded
memory_limit_exceeded
system_error
```

The frontend should depend on internal statuses, not Judge0’s raw numeric IDs.

## 18.4 Polling

For a beginner MVP:

1. create Judge0 submission;
2. receive token;
3. poll with a short delay;
4. stop at terminal status;
5. enforce a maximum wait time;
6. save final result.

Do not poll forever.

## 18.5 Important limits

- allowed language IDs;
- maximum source length;
- maximum custom-input length;
- maximum stdout/stderr stored;
- per-user rate limit;
- request timeout;
- retry limit for temporary provider failures.

---

# 19. AI Hint System

## 19.1 Hint levels

| Level | Purpose | Must not include |
|---|---|---|
| 1. Nudge | Ask a guiding question or name a concept | Algorithm steps |
| 2. Strategy | Describe the approach | Complete pseudocode |
| 3. Pseudocode | Give structured logic | Copy-ready code |
| 4. Debug | Analyze current learner code | Unrelated full solution |
| 5. Explanation | Explain complete solution after confirmation | Pretending it was independent |

## 19.2 Hint request

```json
{
  "problemId": "problem_uuid",
  "language": "cpp",
  "sourceCode": "...",
  "hintLevel": 2,
  "observedOutput": "...",
  "learnerQuestion": "I do not know how to reduce the time complexity."
}
```

## 19.3 Prompt inputs

The prompt may include:

- problem summary;
- constraints;
- current source code;
- recent run or verdict;
- requested hint level;
- top relevant memories;
- previous hints for this attempt;
- explicit anti-answer-leakage instruction.

Do not include the learner’s entire history.

## 19.4 Streaming event model

```text
event: metadata
data: {"requestId":"...","hintLevel":2}

event: token
data: {"text":"Think about what information..."}

event: completed
data: {"finishReason":"stop"}
```

Also support `error` and `warning`.

## 19.5 Failure behavior

If AI fails:

- show a clear retry option;
- keep the editor content;
- do not mark the hint complete;
- do not break submissions;
- log the request ID, not secrets.

---

# 20. Learner Memory

## 20.1 Memory types

- strength;
- weakness;
- recurring mistake;
- learning preference;
- goal;
- pace pattern;
- revision need.

## 20.2 Write pipeline

```mermaid
flowchart TD
    E["Submission or attempt evidence"] --> X["Extract candidate memory"]
    X --> D{"Duplicate or contradiction?"}
    D -- "Duplicate" --> U["Update confidence/evidence"]
    D -- "Contradiction" --> R["Revise or supersede"]
    D -- "New" --> N["Create memory"]
    U --> V["Generate/update embedding"]
    R --> V
    N --> V
```

## 20.3 Safeguards

- Every memory links to evidence.
- A memory includes confidence.
- A single failed attempt should rarely create a high-confidence weakness.
- Contradictory new evidence should revise old memories.
- Users can inspect, correct, and delete memories.
- Sensitive telemetry requires explicit consent.
- Memory extraction should not delay the submission verdict.

## 20.4 Retrieval

Start with:

1. filter by current user and active status;
2. optionally filter by topic;
3. retrieve top semantic matches;
4. combine similarity with confidence and recency;
5. return at most 3–5 memories.

Simple score:

```text
final_score =
  semantic_similarity
  * confidence
  * recency_weight
  * topic_relevance
```

---

# 21. Recommendation System

## 21.1 Start without AI

The first recommendation engine should be deterministic:

1. exclude solved problems;
2. prefer topics matching current weaknesses;
3. keep difficulty near current ability;
4. include occasional revision problems;
5. avoid repeating recently skipped problems.

Example score:

```text
score =
  0.35 * topic_need
  + 0.25 * difficulty_fit
  + 0.20 * revision_value
  + 0.10 * freshness
  + 0.10 * goal_alignment
```

Then use the LLM only to produce a friendly explanation, not to control all ranking.

## 21.2 Recommendation response

```json
{
  "data": [
    {
      "problemId": "problem_uuid",
      "score": 0.87,
      "reason": "Recommended because binary-search boundary cases caused difficulty in two recent attempts.",
      "reasonCodes": ["WEAK_TOPIC", "DIFFICULTY_FIT"]
    }
  ]
}
```

Reason codes make the system testable even if explanation wording changes.

---

# 22. Progress Dashboard

## 22.1 MVP metrics

- problems attempted;
- problems solved;
- acceptance rate;
- problems solved this week;
- current streak;
- average attempts before acceptance;
- hint usage by level;
- topic mastery estimate;
- recent activity.

## 22.2 Avoid misleading metrics

Do not label a learner “80% expert in graphs” without explaining the calculation. Prefer:

```text
Graph practice confidence: Developing
Evidence: 7 recent attempts, 4 accepted, frequent shortest-path mistakes
```

## 22.3 Topic confidence

Start with a transparent heuristic. For example:

```text
confidence =
  accepted_weight
  - failed_attempt_penalty
  - heavy_hint_penalty
  + recent_practice_bonus
```

Document the calculation and keep it easy to change.

---

# 23. API Design Standards

## 23.1 Success response

```json
{
  "data": {},
  "meta": {
    "requestId": "request_uuid"
  }
}
```

## 23.2 Error response

```json
{
  "error": {
    "code": "PROBLEM_NOT_FOUND",
    "message": "The requested problem does not exist.",
    "details": null
  },
  "meta": {
    "requestId": "request_uuid"
  }
}
```

## 23.3 Pagination

```http
GET /api/problems?page=1&pageSize=20
```

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 84,
    "totalPages": 5
  }
}
```

## 23.4 Naming

- JSON fields: `camelCase`.
- Database columns: `snake_case`.
- URLs: plural nouns and kebab-free identifiers.
- Dates: ISO 8601 UTC strings.
- IDs: UUIDs or consistent prefixed IDs.

## 23.5 Versioning

Do not add `/v1` before you need external compatibility. Keep internal contracts documented and change mocks, frontend, and backend together.

---

# 24. Validation and Error Handling

## 24.1 Validate at boundaries

- React validates forms for fast feedback.
- Express validates every request with Zod.
- FastAPI validates every request with Pydantic.
- PostgreSQL enforces final integrity with constraints.

Frontend validation is not security; requests can bypass the browser.

## 24.2 Error categories

- validation error;
- authentication error;
- authorization error;
- not found;
- conflict;
- rate limit;
- external provider error;
- internal error.

## 24.3 HTTP status examples

| Status | Use |
|---|---|
| 200 | Successful read/update |
| 201 | Created |
| 204 | Successful deletion with no body |
| 400 | Invalid request |
| 401 | Missing/invalid authentication |
| 403 | Authenticated but forbidden |
| 404 | Resource not found |
| 409 | Conflict |
| 422 | Schema validation, especially FastAPI |
| 429 | Rate limited |
| 500 | Unexpected server error |
| 502/503 | External dependency unavailable |

Never send stack traces to the browser in production.

---

# 25. Testing Strategy

## 25.1 Testing pyramid

Write many fast unit tests, fewer integration tests, and a small number of valuable end-to-end tests.

## 25.2 Frontend unit/integration tests

Test:

- problem filters;
- loading/error/empty states;
- form validation;
- verdict rendering;
- hint-level controls;
- query invalidation after submission;
- protected routes;
- editor draft state.

## 25.3 Express tests

Test:

- request validation;
- ownership checks;
- status mapping;
- submission service;
- Judge0 timeout;
- database queries;
- standard error format.

Use a test database. Never run tests against production.

## 25.4 FastAPI tests

Test:

- hint-level prompt rules;
- memory retrieval filters by user;
- deduplication;
- recommendation scoring;
- streaming completion/error events;
- LLM failure handling.

Mock provider responses in normal automated tests.

## 25.5 End-to-end tests

Critical Playwright flows:

1. login and onboarding;
2. browse and filter problems;
3. open problem and preserve draft;
4. run code and view output;
5. submit wrong answer;
6. request hint;
7. submit accepted solution;
8. see history and updated progress.

## 25.6 Manual QA checklist

- Desktop, tablet, and mobile widths.
- Keyboard-only navigation.
- Slow network.
- Offline API.
- Empty account.
- Expired session.
- Long compiler error.
- Long problem statement.
- Large code draft.
- Streaming interruption.

---

# 26. Security and Privacy

## 26.1 Essential controls

- Use HTTPS in production.
- Verify JWTs in both APIs.
- Enforce resource ownership.
- Use parameterized ORM queries.
- Configure CORS to the actual frontend origin.
- Apply rate limits.
- Limit JSON and code payload sizes.
- Store secrets only in deployment secret settings.
- Do not log access tokens, source code by default, or LLM secrets.
- Keep dependencies updated.

## 26.2 Untrusted code

Judge workers must not receive:

- database credentials;
- Supabase service credentials;
- LLM API keys;
- internal service tokens; or
- unrestricted network access under your control.

## 26.3 Prompt injection

Problem statements, editorials, and community resources are data, not instructions. When sending them to an LLM:

- clearly separate system instructions from retrieved content;
- do not provide secret-bearing tools;
- keep tool access allowlisted;
- validate structured model output;
- limit token and tool budgets.

## 26.4 Learner privacy

- Explain what is remembered.
- Allow memory inspection and deletion.
- Minimize telemetry.
- Set retention rules.
- Do not collect keystroke/authenticity telemetry in the MVP.
- Add consent before introducing sensitive behavior analysis.

---

# 27. Logging and Observability

## 27.1 Structured logs

Log JSON fields such as:

```json
{
  "level": "info",
  "service": "core-api",
  "requestId": "request_uuid",
  "route": "/api/submissions",
  "durationMs": 342,
  "statusCode": 201
}
```

## 27.2 Never log

- passwords;
- access tokens;
- API keys;
- full authorization headers;
- Supabase service keys;
- complete hidden test cases;
- complete raw prompts containing private data.

## 27.3 MVP metrics

- API response time;
- submission queue/wait time;
- Judge0 failure rate;
- AI time to first token;
- AI failure rate;
- database query time;
- hint requests per problem;
- accepted submissions;
- recommendation usage.

Start with provider logs and a simple error tracker. Add complex observability only when needed.

---

# 28. Deployment

## 28.1 Suggested beginner deployment

| Component | Deployment type |
|---|---|
| React | Static hosting |
| Express | Managed Node web service |
| FastAPI | Managed Python web service |
| PostgreSQL/Auth | Supabase |
| Judge | Hosted Judge0 |
| AI | Managed API provider |

Choose providers based on current pricing and regional availability when you are ready to deploy.

## 28.2 Deployment order

1. Create production PostgreSQL/Supabase project.
2. Apply database migrations.
3. Seed public problem data.
4. Deploy Express and verify `/health`.
5. Deploy FastAPI and verify `/health`.
6. Configure backend URLs and allowed origins.
7. Deploy React.
8. Configure Supabase redirect URLs.
9. Run smoke tests.

## 28.3 Production checks

- All secrets are configured.
- Development mock mode is disabled.
- CORS contains only production/development origins.
- Database backups are enabled.
- Migrations run once, not on every random instance startup.
- Health endpoints work.
- Error tracking works.
- Rate limits are active.
- Judge0 and AI timeouts are configured.
- Test user can complete the core loop.

## 28.4 Rollback

Before each deployment:

- tag or identify the previous Git commit;
- keep backward-compatible migrations when possible;
- avoid dropping columns in the same release that stops using them;
- know how to redeploy the previous version.

---

# 29. Git Workflow

## 29.1 Branches

For a solo beginner:

- `main` should always run;
- create a short-lived feature branch;
- open a pull request even if reviewing your own work;
- merge after checks pass.

Example:

```bash
git switch -c feat/problem-catalog
git add .
git commit -m "feat(web): add problem catalog filters"
git push -u origin feat/problem-catalog
```

## 29.2 Commit types

```text
feat: new behavior
fix: bug fix
docs: documentation
test: tests
refactor: code change without behavior change
chore: tooling or maintenance
```

## 29.3 Pull request checklist

- What changed?
- Why?
- Screenshots for UI work.
- How was it tested?
- Any migration?
- Any new environment variable?
- Any follow-up work?

## 29.4 Architecture Decision Records

Create `docs/adr/0001-use-two-backends.md`:

```markdown
# ADR 0001: Use Express and FastAPI

## Status
Accepted

## Context
The project requires TypeScript product APIs and Python AI workflows.

## Decision
Express owns core product data; FastAPI owns AI behavior.

## Consequences
Authentication and contracts must be shared carefully.
```

---

# 30. Coding Conventions

## TypeScript

- Enable strict mode.
- Avoid `any`.
- Prefer named domain types.
- Keep functions small.
- Use `async/await`.
- Validate external data.
- Do not place fetch calls directly throughout UI components.

## Python

- Add type hints.
- Use Pydantic at API boundaries.
- Format/lint with Ruff.
- Keep provider-specific logic inside clients.
- Prefer explicit service classes/functions over “agent” abstractions.

## React

- Use functional components and hooks.
- Keep server data in TanStack Query.
- Avoid effects for values that can be calculated during render.
- Make forms accessible.
- Use semantic HTML.
- Do not optimize with memoization until a real rendering issue exists.

## Database

- Use migrations.
- Add constraints.
- Use UTC timestamps.
- Never edit production tables manually as the normal workflow.
- Avoid deleting evidence records without a retention reason.

---

# 31. Definition of Done

A feature is done only when:

- requirements are clear;
- normal behavior works;
- request data is validated;
- loading state works;
- empty state works;
- error state works;
- mobile layout works;
- keyboard navigation works;
- authorization is enforced;
- tests cover important logic;
- logs do not leak secrets;
- documentation is updated;
- environment changes are documented;
- code is reviewed;
- main branch checks pass.

“The happy path works on my computer” is not done.

---

# 32. Common Beginner Mistakes

## Building every feature at once

Finish one vertical slice. Do not create empty folders for ten future services.

## Starting with the AI

Build problem browsing and submissions first. AI needs trustworthy product data.

## Mixing Express and FastAPI responsibilities

Use the ownership table. One capability has one owner.

## Duplicating server data in Zustand

TanStack Query already manages fetched data.

## Skipping mock error states

If errors are not designed during mock development, production errors will create a broken interface.

## Committing secrets

Use `.env.example`, secret storage, and immediate key rotation if a secret is exposed.

## Running code locally

Never use `eval`, `exec`, `child_process`, or `subprocess` on learner code.

## Adding WebSockets early

The core MVP does not require WebSockets. Add them only for proven real-time features.

## Trusting AI output

Validate JSON output, limit the prompt, and keep deterministic business rules outside the model.

## Ignoring database ownership

Prisma and Alembic must never compete over the same tables.

---

# 33. Troubleshooting

## React cannot call Express

Check:

- Express is running on port 3001.
- `VITE_CORE_API_URL` is correct.
- CORS allows `http://localhost:5173`.
- Browser Network panel shows the actual failing URL.

## FastAPI returns 422

The request body does not match the Pydantic schema. Open `/docs`, inspect the expected body, and compare field names and types.

## Prisma cannot connect

Check:

```bash
docker compose ps
docker compose logs postgres
```

Verify `DATABASE_URL`, port 5432, username, password, and database name.

## Migration disagreement

Identify whether the table belongs to `core` or `ai`. Use only the owning migration tool.

## Supabase login redirects incorrectly

Check:

- local and production redirect URLs;
- frontend environment variables;
- callback route;
- browser URL after login;
- session events.

## Judge0 stays pending

- enforce a maximum poll duration;
- inspect provider status;
- verify language ID;
- verify API authentication;
- store the token for later reconciliation;
- return a retryable service error instead of polling forever.

## AI stream stops

- preserve partial text;
- show retry;
- propagate request cancellation;
- check proxy buffering/timeouts;
- inspect server request ID;
- do not clear editor state.

## “It works locally but not in production”

Compare:

- environment variables;
- CORS origins;
- HTTPS URLs;
- database migrations;
- case-sensitive paths;
- build output;
- Supabase redirect URLs;
- provider egress/network rules.

---

# 34. Glossary

| Term | Meaning |
|---|---|
| API | Interface through which software systems communicate |
| Backend | Server-side application |
| CORS | Browser rule controlling cross-origin requests |
| Embedding | Numeric representation of meaning |
| JWT | Signed token containing identity claims |
| Migration | Versioned database schema change |
| Mock | Simulated implementation used during development/tests |
| Monorepo | One repository containing multiple applications/packages |
| ORM | Library mapping code objects to database records |
| pgvector | PostgreSQL extension for vector storage/search |
| REST | Common HTTP API style |
| SSE | One-way server-to-browser event stream |
| Vertical slice | Complete thin feature through UI, API, and data |
| WebSocket | Long-lived two-way client/server connection |

---

# 35. Official References

Use official documentation when setup commands or APIs change:

- [Vite Getting Started](https://vite.dev/guide/)
- [React Documentation](https://react.dev/)
- [React Router](https://reactrouter.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Express Installing Guide](https://expressjs.com/en/starter/installing/)
- [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/getting-started)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgvector](https://github.com/pgvector/pgvector)
- [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Judge0 CE API](https://ce.judge0.com/)
- [MSW Documentation](https://mswjs.io/docs/)
- [Playwright Documentation](https://playwright.dev/docs/intro)

---

## Final reminder

The correct beginner architecture is not the architecture with the most tools. It is the architecture whose behavior you can explain, test, and debug.

Build the mocked React experience first. Add Express and PostgreSQL next. Add Judge0 after the core data model is stable. Add FastAPI and AI only when the ordinary product loop already works.
