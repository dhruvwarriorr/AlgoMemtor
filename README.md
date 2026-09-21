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

The repository includes a unified Codeforces, CodeChef, LeetCode, and CSES
catalog. React consumes the same normalized `/api/*` contract in mocked and live
modes; Express owns provider validation, normalization, safe URLs, filtering,
caching, rate handling, account observations, and freshness. The current
implementation also adds bounded Gemini ranking and a personalized CP/DSA coach
through FastAPI, provider profiles/activity/contests, manual progress,
bookmarks, analytics, timers, learner-memory retrieval, an adaptive roadmap,
and in-app check-ins. Deterministic fallbacks keep recommendations, roadmap
assessment, and practice selection usable when AI or provider services are
unavailable.

## Product principles

- Recommend with a reason: every suggestion should say why it fits the learner.
- Respect the source: show attribution and open the canonical external URL.
- Store metadata, not copied problem content.
- Prefer official or explicitly permitted APIs for problem metadata. The narrow
  public solved-count and activity behavior is documented in the complete
  project documentation.
- Be honest about evidence: opening a problem is not the same as solving it.
- Keep AI optional: filtering and outbound links must still work if AI is down.
- Make coaching evidence-aware: the roadmap is deterministic, AI explanations
  are bounded by an authenticated context snapshot, and learner actions require
  explicit confirmation.
- Add providers through adapters so one provider cannot define the whole product.

## MVP scope

The MVP will support:

- registration, login, and learner onboarding;
- a normalized catalog of external problem metadata;
- search and filters for provider, difficulty, topic, and status;
- AI-ranked recommendations with short, user-facing reasons;
- canonical outbound links that open problems on their source platforms;
- outbound-click history, bookmarks, and manual completion status;
- optional provider-account linking and explicitly consented public solved-count
  refreshes for Codeforces, CodeChef, and LeetCode;
- bounded public submission/activity observations and provider tag enrichment
  for Codeforces, CodeChef, and LeetCode;
- CSES public problem catalog discovery; and
- evidence-backed learner preferences and progress; and
- a protected `/coach` workspace with saved conversations, progressive CP/DSA
  tutoring, an adaptive improvement roadmap, optional practice sets, and
  in-app check-ins; and
- graceful provider and AI failure states.

The MVP will not include:

- copied or locally authored problem statements and test cases;
- an embedded code editor or compiler;
- Judge0 or another code-execution service;
- code drafts or submission storage;
- unpermitted/private content scraping, browser automation, or unofficial private
  APIs;
- claims that a redirect proves a problem was solved; or
- real-time contests, duels, payments, or a marketplace.

## Core user flow

```text
Learner profile and goals
          |
          v
Express provider gateway ----> Supported external provider APIs
          |                         |
          |                         +-- validated metadata and permitted public observations
          v
Normalized candidate problems
          |
          v
Express -> FastAPI internal ranking call
          |
          v
FastAPI -> Gemini (bounded metadata only)
          |
          v
Ranked problem cards + explanations
          |
          v
Canonical external problem URL
          |
          v
Learner solves on the source platform
          |
          v
Coach context, roadmap assessment, and next practice step
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
  |                +-- coach conversations, roadmap, check-ins, safe actions
  |                +-- PostgreSQL (core schema)
                   +-- POST /internal/recommendations/rank
                   +-- POST /internal/coach/respond and check-in generation
                        -> FastAPI over a server-side token
                             |
                             +-- Gemini ranking, coaching, and explanations
                             +-- PostgreSQL (ai schema; audits, memories, vectors)
```

| Component         | Ownership                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| React             | Accessible catalog UI, filters, recommendations, coach workspace, and safe outbound navigation          |
| Express           | Authentication-aware product APIs, provider adapters, normalization, caching, progress, and coach state |
| FastAPI           | Internal bounded Gemini ranking, coaching explanations, learner memory, and vector retrieval            |
| PostgreSQL        | Learner data, normalized metadata cache, roadmap, chats, check-ins, bookmarks, history, and events      |
| External provider | Canonical statement, examples, editor, submissions, judging, and authoritative solve status             |

Codeforces is the reference integration because its official
`problemset.problems` endpoint exposes identifiers, names, ratings, tags, and
statistics that can be normalized into redirect cards. CodeChef and LeetCode
use validated public JSON/GraphQL/HTML strategies with bounded activity; CSES
is currently catalog-only. Each provider capability remains subject to current
terms, attribution, rate limits, and an independent kill switch.

## AI ranking, progress, and learner memory (current local implementation)

For an authenticated recommendation request, Express obtains the normalized
configured provider snapshots, applies deterministic filtering rules, and sends
at most 40 unique metadata candidates to FastAPI. The browser never calls FastAPI. The
core service calls `POST /internal/recommendations/rank` with the shared
`X-Internal-Service-Token` only when its AI client is configured. FastAPI uses
`langchain-google-genai` and the configured Gemini model with Pydantic structured
output. It returns up to ten allowlisted provider IDs, scores, concise reasons,
fallback state, measured latency, optional token usage, estimated cost, and an
optional audit ID. Express validates the response again and resolves canonical
Codeforces URLs from its own provider snapshot.

The model payload contains only the expected count, structured learner fields,
the optional profile-scoped recommendation note, and provider metadata such as
Codeforces ID, title, rating, normalized difficulty, topics, and solved count.
It excludes request/learner service identifiers, canonical URLs,
`additionalConsiderations`, full problem content, and raw prompts. The note is
optional, trimmed, capped at 500 characters, and not used by the deterministic
fallback; structured profile choices remain authoritative.

If `INTERNAL_SERVICE_TOKEN` is empty in core, the HTTP client is replaced by a
local unavailable client. If FastAPI has no `LLM_API_KEY`, it returns a
`not_configured` fallback. Timeouts, provider errors, invalid model output,
unavailable HTTP responses, invalid JSON, and invalid response schemas all keep
the deterministic recommendation feed available. AI batches use
`ai-gemini-rag-v1`; fallback batches use
`ai-rag-v1-fallback-deterministic-v2`.

The internal endpoint requires the same non-empty token in the AI service. A
missing AI token configuration returns `503`, while a missing or wrong supplied
token returns `401`. Its audit repository is enabled only with AI-side
`DATABASE_URL`; it stores IDs, model/version, fallback state, latency, optional
pricing version, token/cost fields, and a keyed HMAC-SHA256 fingerprint of the
recommendation note, never raw prompts or note text. Audit persistence is
bounded so a slow database cannot block ranking. Generated reasons also reject
URLs, contact-like strings, UUIDs, and repeated four-word slices of the
preference note. Audit failures are non-fatal.

The evaluation dataset and runner live in `apps/core-api/evaluation/`. Use
`npx tsx apps/core-api/evaluation/run.ts --validate-only` to validate the 48
scenarios without calling Gemini. A live comparison is explicitly opt-in with
`ALGOMEMTOR_EVALUATION_ENABLED=true` plus an AI URL and internal token; it
reports relevance, difficulty, diversity, preference, p95 latency, and average
estimated cost against the deterministic baseline. The local harness does not
by itself establish live Gemini quality, latency, cost, or authenticated browser
acceptance.

The isolated Phase 10 memory harness is in
`apps/ai-api/app/evaluation/memory_rag_eval.py`. Its tests run with
`uv run --project apps/ai-api pytest apps/ai-api/tests/test_memory_rag_eval.py`
and enforce vector-vs-SQL recall@5, three-run median ranking improvement,
privacy/unknown-ID, p95 latency, and cost gates. A deployment adapter must
provide the database-backed store and ranker, explicit evidence/memory
fixtures, and at least three scenarios per memory category before these gates
can be used as live Gemini or PostgreSQL evidence. The top-level `run` helper
enables that strict matrix validation by default.

## Personalized coach and adaptive roadmap

Authenticated learners can open `/coach` for a persistent CP/DSA tutoring
workspace. Conversations are owner-scoped and retain sanitized chat text;
temporary code or copied problem context is sent only for the current request
and replaced by an omission marker in saved history. The coach teaches with
progressive hints by default, shows the evidence and freshness used for each
personalized conclusion, and never executes code or submits to a provider.

Express builds a bounded context snapshot from the learner profile, goals,
preferences, deterministic roadmap, 30/90-day activity trends where available,
provider activity and completeness, submissions, solves, ratings, contests,
progress, reflections, recommendation feedback, bookmarks, dismissals, and up
to five query-relevant active memories. FastAPI combines that private snapshot
with up to eight versioned CP/DSA knowledge chunks using hybrid keyword/vector
retrieval. A relevance router may make one de-identified Gemini Google Search
grounding call for current/public questions; names, handles, ratings,
conversations, and private history never enter that search query. The model
cannot query the core database, invent URLs, or perform writes. For practice
requests, the de-identified search may include up to three roadmap topic names.
Gemini can surface direct problem pages only by selecting exact citation IDs
returned in Google Search grounding metadata; Express revalidates those public
HTTPS sources before rendering them as attributed web-grounded problem cards.
Roadmap placement comes from the versioned deterministic `topic-assessment-v1`
engine (30% smoothed success, 25% breadth, 20% target difficulty, 15% recent
submission accuracy, and 10% recency); Gemini explains the result but does not
assign mastery. Manual topic statuses always determine the displayed lane.

The roadmap uses the curated prerequisite taxonomy, and Express selects at most
two foundation, two target, and one stretch problem per topic from trusted
catalog records. Solved and actively dismissed problems are excluded by
default. Any coach proposal that would change roadmap status, progress,
bookmarks, or learner memory is persisted as `proposed` and applied only after
an authenticated, idempotent confirmation.

The coach also provides in-app check-ins. Learners can choose a local weekly
review day/time and separately enable event nudges. The memory worker
periodically queues due owner-scoped refreshes through the durable PostgreSQL
outbox. Event check-ins are capped at two per rolling seven days and
deduplicated for 72 hours. Gemini outages leave the deterministic roadmap and
trusted practice selection available while the chat presents a concise retry
message without exposing internal fallback state.

Assistant messages persist a validated `coach-rich-v2` snapshot when useful:
metrics, accessible line/bar/stacked-bar charts with tabular fallbacks,
timelines, comparison tables, trusted catalog problem cards, web-grounded
problem sources, citations, and clickable
follow-up questions. Gemini selects only from the dataset IDs supplied for the
turn; Express hydrates chart values and canonical
problem links from trusted datasets. Internet-discovered problems use only
grounding metadata URLs and cannot create progress, bookmark, or roadmap
actions until they also exist in the trusted catalog. Existing messages without
rich content remain readable. Consent is versioned as
`personalized-coaching-rag-v2`; older coaching/memory consent must be renewed.

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
│   └── PROJECT_DOCUMENTATION.md
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

For the local AI and learner-memory path, set these server-side variables (the
example files contain local defaults/placeholders):

Core API:

```text
AI_API_URL=http://localhost:8000
CORE_API_URL=http://localhost:3001
AI_RANKING_TIMEOUT_MS=8000
INTERNAL_SERVICE_TOKEN=
PROGRESS_ENABLED=true
MEMORY_GENERATION_ENABLED=true
MEMORY_RAG_ENABLED=true
```

AI API:

```text
LLM_API_KEY=
LLM_MODEL=gemini-3.5-flash
LLM_TIMEOUT_SECONDS=90
LLM_MAX_OUTPUT_TOKENS=4096
COACH_THINKING_LEVEL=high
LLM_INPUT_PRICE_PER_MILLION_USD=1.50
LLM_OUTPUT_PRICE_PER_MILLION_USD=9.00
LLM_PRICING_VERSION=gemini-3.5-flash-standard-2026-09
AI_RANKING_VERSION=ai-gemini-rag-v1
COACH_VERSION=coach-gemini-rag-v2
CONSENT_POLICY_VERSION=personalized-coaching-rag-v2
DATABASE_URL=postgresql+psycopg://algomemtor:algomemtor_local@localhost:5432/algomemtor
AI_AUDIT_TIMEOUT_SECONDS=0.5
INTERNAL_SERVICE_TOKEN=
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
EMBEDDING_TIMEOUT_SECONDS=4
MEMORY_GENERATION_VERSION=memory-gemini-v1
MEMORY_MIN_CONFIDENCE=0.75
MEMORY_MIN_EVIDENCE_STRENGTH=0.75
MEMORY_SIMILARITY_THRESHOLD=0.75
MEMORY_RETRIEVAL_LIMIT=5
MEMORY_AUDIT_TIMEOUT_SECONDS=0.5
MEMORY_GENERATION_ENABLED=true
MEMORY_RAG_ENABLED=true
COACH_KNOWLEDGE_RAG_ENABLED=true
COACH_WEB_GROUNDING_ENABLED=true
COACH_WEB_GROUNDING_TIMEOUT_SECONDS=20
```

The core URL must be HTTPS or an HTTP loopback URL and cannot contain
credentials, query parameters, or fragments. `LLM_API_KEY` enables Gemini; the
two price variables calculate an estimate from reported token usage and are not
live billing data. `LLM_PRICING_VERSION` labels the price assumptions in audit
rows. `DATABASE_URL` enables the AI audit, memory, and vector tables. Reflection
notes are sent to Gemini only after the learner enables the separate AI note
sharing choice. Structured progress signals remain separate from raw notes.

### 4. Configure Supabase authentication

Create a Supabase project with email/password authentication enabled, then set:

- `VITE_SITE_URL`, `VITE_SUPABASE_URL`, and
  `VITE_SUPABASE_PUBLISHABLE_KEY` in `apps/web/.env`;
- `SUPABASE_URL` and `SUPABASE_JWT_ISSUER` in both API environment files; and
- `SUPABASE_JWT_ISSUER` to `<SUPABASE_URL>/auth/v1`.

In **Supabase Dashboard → Authentication → URL Configuration**:

1. set **Site URL** to the production frontend origin when it exists;
2. add `http://localhost:5173/dashboard` as a local redirect URL; and
3. add `https://<production-frontend-host>/dashboard` as the exact production
   redirect URL.

During local-only development, the Site URL can be `http://localhost:5173`.
`VITE_SITE_URL` must use the matching frontend origin in each environment. The
signup confirmation flow explicitly redirects to its `/dashboard` path.

Only a Supabase publishable key belongs in the Vite environment. Secret and
service-role keys must remain server-side and are not required for JWT
verification.

### 5. Start PostgreSQL

```bash
npm run db:up
npm run db:migrate
npm run db:seed
npm run db:logs
```

`db:migrate` applies Prisma's `core` migrations first, then Alembic's `ai`
baseline. Keep that order for a new database. Prisma records its history in
`public._prisma_migrations`; Alembic uses the distinct
`public.ai_alembic_version` table and owns only objects in the `ai` schema.
`db:seed` safely upserts the normalized topic vocabulary and can be run again.

The compose database uses the `pgvector/pgvector` image. If Docker Desktop is
unavailable, use a local PostgreSQL installation with the pgvector extension
instead. Install `postgresql@18` and `pgvector` with Homebrew, start the
PostgreSQL service, and run `CREATE EXTENSION IF NOT EXISTS vector` once as a
database administrator before running `npm run db:migrate`.

Stop it with:

```bash
npm run db:down
```

### 6. Start development

```bash
npm run dev
```

Or start services independently:

```bash
npm run dev:web
npm run dev:core
npm run dev:ai
npm run dev:worker
```

| Service              | URL                                       |
| -------------------- | ----------------------------------------- |
| React                | `http://localhost:5173`                   |
| Express health check | `http://localhost:3001/health`            |
| FastAPI health check | `http://localhost:8000/health`            |
| Memory worker        | durable outbox consumer; no HTTP endpoint |

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
uv run --project apps/ai-api pytest apps/ai-api/tests
uv run --project apps/ai-api ruff check apps/ai-api
uv run --project apps/ai-api ruff format --check apps/ai-api
```

Week 11 focused checks are:

```bash
uv run --project apps/ai-api pytest apps/ai-api/tests/test_internal_ranking.py
npm --prefix apps/core-api exec vitest run \
  src/config/ai-config.test.ts \
  src/integrations/ai/ai-recommendation-client.test.ts \
  src/recommendation-api.test.ts
npx tsx apps/core-api/evaluation/run.ts --validate-only
```

The evaluation validation is local-only. A live AI-vs-baseline run is opt-in and
requires a configured Gemini-backed AI service; these checks do not replace
authenticated browser acceptance.

## Documentation

- [Complete project documentation](docs/PROJECT_DOCUMENTATION.md)

## Security and compliance boundaries

- Do not scrape problem content or use undocumented private endpoints. The
  narrow public solved-count and consented Codeforces activity exceptions are
  documented in the complete project documentation and remain user-triggered,
  size-limited, and subject to provider review.
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
