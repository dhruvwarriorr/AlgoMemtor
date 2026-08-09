# AlgoMemtor

AlgoMemtor is an AI-assisted learning planner for Data Structures and Algorithms,
competitive programming, coding interviews, and algorithmic thinking.

Its central job is to understand a learner's goals and history, discover suitable
problems from supported external platforms, explain why each problem is useful,
and send the learner to the original platform to solve it.

AlgoMemtor is **not** a problem-hosting or code-execution platform. It does not
copy or persist external problem statements, examples, constraints, starter code,
editorials, hidden tests, or judge data. It does not embed Monaco, compile learner
code, or replace the source platform's editor and judge.

The repository now includes the external-metadata catalog and the first live
Codeforces provider gateway. React consumes the same normalized `/api/*`
contract in mocked and live modes; Express owns provider validation,
normalization, safe URLs, filtering, caching, rate handling, and freshness.

## Product principles

- Recommend with a reason: every suggestion should say why it fits the learner.
- Respect the source: show attribution and open the canonical external URL.
- Store metadata, not copied problem content.
- Prefer official or explicitly permitted APIs; do not scrape unsupported sites.
- Be honest about evidence: opening a problem is not the same as solving it.
- Keep AI optional: filtering and outbound links must still work if AI is down.
- Add providers through adapters so one provider cannot define the whole product.

## MVP scope

The MVP will support:

- registration, login, and learner onboarding;
- a normalized catalog of external problem metadata;
- search and filters for provider, difficulty, topic, and status;
- AI-ranked recommendations with short, user-facing reasons;
- canonical outbound links that open problems on their source platforms;
- outbound-click history, bookmarks, and manual completion status;
- optional provider-account linking when an official API permits public activity
  verification;
- evidence-backed learner preferences and progress; and
- graceful provider and AI failure states.

The MVP will not include:

- copied or locally authored problem statements and test cases;
- an embedded code editor or compiler;
- Judge0 or another code-execution service;
- code drafts or submission storage;
- scraping, browser automation, or unofficial private APIs;
- claims that a redirect proves a problem was solved; or
- real-time contests, duels, payments, or a marketplace.

## Core user flow

```text
Learner profile and goals
          |
          v
Express provider gateway ----> Supported external provider APIs
          |                         |
          |                         +-- metadata only
          v
Normalized candidate problems
          |
          v
FastAPI recommendation service
          |
          v
Ranked problem cards + explanations
          |
          v
Canonical external problem URL
          |
          v
Learner solves on the source platform
```

At product level, AlgoMemtor uses AI to find appropriate problems. At the
technical level, deterministic provider adapters fetch and normalize metadata;
the AI service ranks those candidates. The LLM does not invent URLs or call
arbitrary websites directly.

## Architecture

```text
Browser
  |
  +-- /api/* --> Express + TypeScript
  |                |
  |                +-- provider adapters and metadata cache
  |                +-- profiles, bookmarks, outbound events, progress
  |                +-- PostgreSQL (core schema)
  |
  +-- /ai/* --> FastAPI + Python
                   |
                   +-- recommendation ranking and explanations
                   +-- learner memory and embeddings
                   +-- PostgreSQL + pgvector (ai schema)
```

| Component         | Ownership                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| React             | Accessible catalog UI, filters, recommendations, and safe outbound navigation                      |
| Express           | Authentication-aware product APIs, provider adapters, normalization, caching, and progress records |
| FastAPI           | Recommendation ranking, explanations, learner memory, and embeddings                               |
| PostgreSQL        | Learner data, normalized metadata cache, bookmarks, recommendation history, and outbound events    |
| External provider | Canonical statement, examples, editor, submissions, judging, and authoritative solve status        |

The first provider should be one with a documented, permitted metadata API.
Codeforces is the reference integration because its official
`problemset.problems` endpoint exposes identifiers, names, ratings, tags, and
statistics that can be normalized into redirect cards. Additional providers are
added only after confirming their current API and usage terms.

## Data boundary

AlgoMemtor may cache:

- provider key and external problem identifier;
- title, difficulty/rating, tags, and public statistics;
- canonical source URL;
- availability and last-fetched timestamps; and
- learner-owned bookmark, recommendation, open, and manual-status records.

AlgoMemtor must not cache:

- full problem statements, examples, constraints, or editorials;
- starter code, visible tests, or hidden tests;
- copied community solutions; or
- learner source code submitted on another platform.

Provider metadata remains attributed to its source and should be refreshed or
expired according to provider-specific policy.

## Repository structure

```text
.
├── apps/
│   ├── web/                  # React + Vite frontend
│   ├── core-api/             # Express product and provider-integration API
│   └── ai-api/               # FastAPI recommendation and memory service
├── packages/
│   └── shared-contracts/     # Shared TypeScript request/response schemas
├── docs/
│   ├── PROJECT_DOCUMENTATION.md
│   ├── ROADMAP.md
│   ├── AlgoMemtor_MVP_Blueprint.md
│   ├── CP_Mentor_AI_Project_Vision.md
│   └── adr/
├── docker-compose.yml
└── package.json
```

## Prerequisites

- Node.js 24.x;
- npm 11.x;
- Python 3.14;
- [uv](https://docs.astral.sh/uv/);
- Docker with Docker Compose; and
- an editor with TypeScript and Python support.

Verify the tools:

```bash
node --version
npm --version
python3 --version
uv --version
docker --version
docker compose version
```

## Setup

### 1. Install JavaScript dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
uv sync --project apps/ai-api
```

### 3. Create local environment files

```bash
cp apps/web/.env.example apps/web/.env
cp apps/core-api/.env.example apps/core-api/.env
cp apps/ai-api/.env.example apps/ai-api/.env
```

Never commit real secrets. Provider credentials, when required, belong in the
core API environment only. LLM credentials belong in the AI API environment
only.

### 4. Start PostgreSQL

```bash
npm run db:up
npm run db:logs
```

Stop it with:

```bash
npm run db:down
```

### 5. Start development

```bash
npm run dev
```

Or start services independently:

```bash
npm run dev:web
npm run dev:core
npm run dev:ai
```

| Service              | URL                            |
| -------------------- | ------------------------------ |
| React                | `http://localhost:5173`        |
| Express health check | `http://localhost:3001/health` |
| FastAPI health check | `http://localhost:8000/health` |

## Mock-first development

Frontend mocks should represent normalized external metadata, provider outages,
rate limits, stale cache states, AI fallback ranking, and outbound-link behavior.
Mocks must never contain copied problem statements or hidden tests.

## Quality commands

```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
uv run --project apps/ai-api ruff check apps/ai-api
uv run --project apps/ai-api ruff format --check apps/ai-api
```

## Documentation

- [Project documentation](docs/PROJECT_DOCUMENTATION.md)
- [Beginner roadmap](docs/ROADMAP.md)
- [MVP blueprint](docs/AlgoMemtor_MVP_Blueprint.md)
- [Long-term product vision](docs/CP_Mentor_AI_Project_Vision.md)
- [Foundational architecture ADR](docs/adr/0001-foundational-architecture.md)

## Security and compliance boundaries

- Do not scrape providers or use undocumented private endpoints.
- Confirm API terms, attribution rules, rate limits, and caching rules per provider.
- Construct or validate canonical URLs on the server; never trust an arbitrary URL
  supplied by the browser or an LLM.
- Allow only `https` links to approved provider hosts.
- Use `noopener` and `noreferrer` for new-tab navigation where appropriate.
- Never treat an outbound click as proof of completion.
- Never expose provider, database, Supabase, or LLM secrets to React.
- Validate browser, provider, and AI data at service boundaries.
- Keep AI-generated explanations clearly separate from provider-owned metadata.

## Official provider reference

- [Codeforces API](https://codeforces.com/apiHelp)
- [Codeforces `problemset.problems`](https://codeforces.com/apiHelp/methods#problemset.problems)

## License

Add a repository license before public distribution. External problem content and
metadata remain subject to their originating platforms' terms.
