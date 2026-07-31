# MentorForge

> From first line of code to contest legend — a coach that never forgets.

MentorForge is a learning platform for Data Structures and Algorithms,
competitive programming, coding interviews, and algorithmic thinking. Its core
idea is a persistent AI mentor that uses evidence from attempts, submissions,
hints, and goals to make future guidance more relevant.

The project is currently in the repository and UI foundation phase. The first
delivery target is a polished, mock-first React experience. Real authentication,
database persistence, Judge0 execution, and AI capabilities are introduced only
after the primary frontend flows and contracts are stable.

## Product principles

- Teach before revealing: hints should preserve independent thinking.
- Remember with evidence: learner memories must be inspectable and correctable.
- Stay useful without AI: ordinary practice and submissions must degrade safely.
- Keep one owner per capability: Express owns core behavior; FastAPI owns AI.
- Add infrastructure only after a measured requirement justifies it.

## MVP scope

The MVP will support:

- registration, login, and learner onboarding;
- a searchable, filterable problem catalog;
- a Monaco-based problem workspace;
- safe run and submit workflows through hosted Judge0;
- submission history and progress;
- progressive AI hints;
- evidence-backed learner memory; and
- personalized problem recommendations.

Real-time duels, public leaderboards, advanced contests, custom code-execution
infrastructure, separate vector databases, agent frameworks, Kubernetes, and
native mobile applications are intentionally deferred.

## Architecture

```text
React + TypeScript + Vite
    |
    +-- /api/* ----> Express + TypeScript
    |                   |
    |                   +-- PostgreSQL (core schema)
    |                   +-- Hosted Judge0
    |
    +-- /ai/* -----> FastAPI + Python
                        |
                        +-- PostgreSQL + pgvector (ai schema)
                        +-- LLM and embedding provider
```

MentorForge starts as one product with two specialized backend services:

| Component     | Ownership                                                        |
| ------------- | ---------------------------------------------------------------- |
| React         | Routes, accessible UI, API consumption, and mock-first workflows |
| Express       | Profiles, problems, attempts, submissions, progress, and Judge0  |
| FastAPI       | Hints, AI streaming, memories, embeddings, and recommendations   |
| PostgreSQL    | Durable source of truth with separate `core` and `ai` schemas    |
| Supabase Auth | Managed identity and access tokens                               |

Prisma will own migrations for `core` tables. SQLAlchemy and Alembic will own
`ai` tables. They must never manage the same table.

The rationale is recorded in
[ADR 0001](docs/adr/0001-foundational-architecture.md).

## Repository structure

```text
.
├── apps/
│   ├── web/                 # React, Vite, TypeScript
│   ├── core-api/            # Express, TypeScript
│   └── ai-api/              # FastAPI, Python, uv
├── packages/
│   └── shared-contracts/    # Stable cross-application API contracts
├── docs/
│   ├── adr/                 # Architecture decisions
│   ├── api/                 # API documentation
│   └── diagrams/            # Architecture and flow diagrams
├── docker-compose.yml       # Local PostgreSQL + pgvector
└── package.json             # Root development and quality scripts
```

Frontend code is organized by product feature. Server data belongs in TanStack
Query; temporary interface state belongs in component state or Zustand.

## Prerequisites

Install:

- Git;
- Node.js 22 or newer;
- npm;
- Python 3.14, matching `apps/ai-api/pyproject.toml`;
- [uv](https://docs.astral.sh/uv/);
- Docker with Docker Compose; and
- VS Code or another editor with TypeScript and Python support.

Verify the tools:

```bash
git --version
node --version
npm --version
python3 --version
uv --version
docker --version
docker compose version
```

## Setup

### 1. Install JavaScript dependencies

From the repository root:

```bash
npm install
```

The npm workspace includes the web app, core API, and shared contracts package.

### 2. Install Python dependencies

```bash
cd apps/ai-api
uv sync
cd ../..
```

VS Code is configured to use `apps/ai-api/.venv/bin/python`.

### 3. Create local environment files

```bash
cp apps/web/.env.example apps/web/.env
cp apps/core-api/.env.example apps/core-api/.env
cp apps/ai-api/.env.example apps/ai-api/.env
```

The committed examples contain development defaults and placeholders only.
Never commit real credentials. Variables beginning with `VITE_` are exposed to
browser code and must always be treated as public.

### 4. Start PostgreSQL

```bash
docker compose up -d
docker compose ps
```

The local database uses PostgreSQL 16 with pgvector on port `5432`.

### 5. Start development

Start all three applications:

```bash
npm run dev
```

Or start one service:

```bash
npm run dev:web
npm run dev:core
npm run dev:ai
```

| Service                   | URL                            |
| ------------------------- | ------------------------------ |
| React                     | `http://localhost:5173`        |
| Express health check      | `http://localhost:3001/health` |
| FastAPI health check      | `http://localhost:8000/health` |
| FastAPI API documentation | `http://localhost:8000/docs`   |

Set `VITE_USE_MOCKS=true` in `apps/web/.env` to start Mock Service Worker during
frontend development. Unhandled requests currently pass through until feature
handlers are added.

## Application providers

`apps/web/src/app/AppProviders.tsx` is the single composition root for:

- TanStack Query;
- React Router;
- authentication context;
- theme state;
- notifications; and
- development-only MSW startup.

The authentication provider is intentionally provider-neutral during the UI
foundation. Supabase session integration is introduced in the authentication
phase without changing the application composition point.

## Quality commands

Run from the repository root:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Apply frontend formatting with:

```bash
npm run format
```

The frontend uses strict TypeScript, ESLint flat configuration, Prettier, and
EditorConfig. Continuous integration runs frontend type-checking, linting,
format verification, and the production build.

## Git workflow

Keep `main` runnable, use short-lived feature branches, and use semantic commit
messages:

```text
feat(web): add problem catalog filters
fix(core): enforce submission ownership
docs: explain local authentication setup
chore(web): update lint configuration
ci: add frontend checks
```

Pull requests should explain what changed, why it changed, how it was tested,
and whether they introduce migrations or environment variables.

## Documentation

- [Project documentation](docs/PROJECT_DOCUMENTATION.md)
- [Development roadmap](docs/ROADMAP.md)
- [MVP technical blueprint](docs/MentorForge_MVP_Blueprint.md)
- [Product vision](docs/CP_Mentor_AI_Project_Vision.md)
- [Architecture decisions](docs/adr/)

The implementation order is intentionally frontend-first:

1. repository and UI foundation;
2. mocked catalog and coding workspace;
3. authentication and onboarding;
4. Express and PostgreSQL;
5. Judge0 submissions;
6. FastAPI hints;
7. learner memory, recommendations, and progress;
8. hardening and deployment.

## Security boundaries

- Never execute learner code inside Express or FastAPI.
- Never expose Supabase service-role, database, Judge0, or LLM secrets to React.
- Validate browser input again at API boundaries.
- Scope every learner record to the authenticated user.
- Treat problem statements, editorials, and retrieved content as untrusted.
- Keep mock mode disabled in production.

## License

This repository is licensed under the MIT License.
