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
implementation also adds bounded provider-neutral AI ranking and a personalized CP/DSA coach
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
- bookmarks and manual completion status;
- optional provider-account linking and explicitly consented public solved-count
  refreshes for Codeforces, CodeChef, and LeetCode;
- bounded public submission/activity observations and provider tag enrichment
  for Codeforces, CodeChef, and LeetCode;
- CSES public problem catalog discovery; and
- evidence-backed learner preferences and progress; and
- a protected `/coach` workspace with saved conversations, progressive CP/DSA
  tutoring, an adaptive improvement roadmap, and optional practice sets; and
- a Test Case Visualizer (`/visualizer`) that runs the learner's own C++,
  Java or Python code on their own input inside the browser, animates its data
  structures step by step, and has an AI Debugger that points at the line and
  step where it goes wrong; and
- graceful provider and AI failure states.

The MVP will not include:

- copied or locally authored problem statements and test cases;
- an embedded IDE (such as Monaco) or a server-side compiler;
- Judge0 or another server-side code-execution service;
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
FastAPI -> local Qwen in development / OpenRouter in production
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
                             +-- routed ranking, coaching, and explanations
                             +-- PostgreSQL (ai schema; audits, memories, vectors)
```

| Component         | Ownership                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| React             | Accessible catalog UI, filters, recommendations, coach workspace, and safe outbound navigation          |
| Express           | Authentication-aware product APIs, provider adapters, normalization, caching, progress, and coach state |
| FastAPI           | Internal routed AI ranking, coaching explanations, learner memory, and vector retrieval                 |
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
Pydantic-validated structured output through one provider-neutral layer.
Every environment, local development included, uses OpenRouter with three
models: `openai/gpt-oss-20b` for fast structured work (ranking, memory
extraction, classification, summaries, simple Coach turns),
`deepseek/deepseek-v4-flash-0731` for reasoning and code (deep Coach turns,
Doubt Helper, Solution Explorer, debugging, contest analysis, long context),
and `qwen/qwen3-embedding-8b` for embeddings only, plus the hosted
`openrouter:web_search` tool with the `parallel` engine. Each turn uses a
bounded task-specific context and output budget. The Coach reads text only;
transient code and page text are not saved in chat history or audits. The ranking
response returns up to ten allowlisted provider IDs, scores, concise reasons,
fallback state, measured latency, optional token usage, estimated cost, and an
optional audit ID. Express validates the response again and resolves canonical
Codeforces URLs from its own provider snapshot.

The model payload contains only the expected count, structured learner fields,
the optional profile-scoped recommendation note, and provider metadata such as
Codeforces ID, title, rating, normalized difficulty, topics, and solved count.
It also includes bounded counts of unique observed attempted and solved
problems by topic from manual statuses and permitted provider activity; these
counts are partial evidence, not a mastery score, and require current
personalized-AI consent before they are sent to the configured generation model.
It excludes request/learner service identifiers, canonical URLs,
`additionalConsiderations`, full problem content, and raw prompts. The note is
optional, trimmed, capped at 500 characters, and not used by the deterministic
fallback; structured profile choices remain authoritative.

If `INTERNAL_SERVICE_TOKEN` is empty in core, the HTTP client is replaced by a
local unavailable client. If `OPENROUTER_API_KEY` is missing, FastAPI returns a
`not_configured` fallback. Timeouts, provider errors, invalid model output,
unavailable HTTP responses, invalid JSON, and invalid response schemas all keep
the deterministic recommendation feed available. AI batches use
`ai-provider-router-v4`; fallback batches use
`ai-rag-v2-fallback-deterministic-v2`.

The internal endpoint requires the same non-empty token in the AI service. A
missing AI token configuration returns `503`, while a missing or wrong supplied
token returns `401`. Its audit repository is enabled only with AI-side
`DATABASE_URL`; it stores IDs, model/version, fallback state, latency, optional
pricing version, token/cost fields, and a keyed HMAC-SHA256 fingerprint of the
recommendation note, never raw prompts or note text. Audit persistence is
bounded so a slow database cannot block ranking. Generated reasons also reject
URLs, contact-like strings, UUIDs, and repeated four-word slices of the
preference note. Audit failures are non-fatal.

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
retrieval. A relevance router may make one de-identified OpenRouter web-search
call for current/public questions; names, handles, ratings,
conversations, and private history never enter that search query. The model
cannot query the core database, invent URLs, or perform writes. For practice
requests, the de-identified search may include up to three roadmap topic names.
The model can surface direct problem pages only by selecting exact citation IDs
returned by web search; Express revalidates those public
HTTPS sources before rendering them as attributed web-grounded problem cards.
Roadmap placement comes from the versioned deterministic `topic-assessment-v1`
engine (30% smoothed success, 25% breadth, 20% target difficulty, 15% recent
submission accuracy, and 10% recency); AI explains the result but does not
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
deduplicated for 72 hours. AI outages leave the deterministic roadmap and
trusted practice selection available while the chat presents a concise retry
message without exposing internal fallback state.

Assistant messages persist a validated `coach-rich-v2` snapshot when useful:
metrics, accessible line/bar/stacked-bar charts with tabular fallbacks,
timelines, comparison tables, trusted catalog problem cards, web-grounded
problem sources, citations, and clickable
follow-up questions. AI selects only from the dataset IDs supplied for the
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
- learner-owned bookmark, recommendation, and manual-status records.

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
AI_RANKING_TIMEOUT_MS=60000
INTERNAL_SERVICE_TOKEN=
PROGRESS_ENABLED=true
MEMORY_GENERATION_ENABLED=true
MEMORY_RAG_ENABLED=true
```

AI API:

```text
APP_ENV=development
AI_PROVIDER=openrouter
# A key with a small credit limit is enough for development.
OPENROUTER_API_KEY=
AI_FAST_MODEL=openai/gpt-oss-20b
AI_STRONG_MODEL=deepseek/deepseek-v4-flash-0731
AI_EMBEDDING_MODEL=qwen/qwen3-embedding-8b
DATABASE_URL=postgresql+psycopg://algomemtor:algomemtor_local@127.0.0.1:5433/algomemtor
INTERNAL_SERVICE_TOKEN=
MEMORY_MIN_CONFIDENCE=0.75
MEMORY_MIN_EVIDENCE_STRENGTH=0.75
MEMORY_SIMILARITY_THRESHOLD=0.75
MEMORY_RETRIEVAL_LIMIT=15
MEMORY_GENERATION_ENABLED=true
MEMORY_RAG_ENABLED=true
COACH_KNOWLEDGE_RAG_ENABLED=true
COACH_WEB_GROUNDING_ENABLED=true
```

The core URL must be HTTPS or an HTTP loopback URL and cannot contain
credentials, query parameters, or fragments. `DATABASE_URL` enables the AI
audit, memory, and vector tables. Development and production both need
`OPENROUTER_API_KEY`; production also sets `APP_ENV=production`. Model
configuration is listed in `apps/ai-api/.env.example`. Reflection notes are
sent to AI only after the learner enables the separate AI note sharing choice.
Structured progress signals remain separate from raw notes.

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

To enable **Continue with Google** (login and signup):

1. In **Google Cloud Console → APIs & Services → Credentials**, create an
   OAuth client ID of type **Web application** and add
   `<SUPABASE_URL>/auth/v1/callback` as an authorized redirect URI.
2. In **Supabase Dashboard → Authentication → Sign In / Providers → Google**,
   enable Google and paste the client ID and client secret.

Google returns to the same allowlisted `/dashboard` redirect URL, so no new
environment variables are needed. The client secret stays in Supabase and
never goes in a `VITE_*` variable.

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
Docker publishes PostgreSQL on loopback port `5433` so a separate Homebrew
instance on `5432` cannot silently receive API traffic. Keep the core and AI
`DATABASE_URL` values pointed at the same database; override them deliberately
if using Homebrew instead.
Linking a provider queues its first sync immediately. There are no worker
processes: queued syncs and learner-memory jobs run inside the core API while
a signed-in page is open (the page wakes `POST /api/jobs/pump`) or right after
a connector upload. With every tab closed, queued work waits for the next
visit.

Stop it with:

```bash
npm run db:down
```

### 6. Start development

There are no local models: add `OPENROUTER_API_KEY` to `apps/ai-api/.env`
first. Keep manual AI testing short; every request is billed.

After applying the AI migration, or when a database holds vectors from an
older embedding model (such as the removed local Qwen3-Embedding-0.6B), rebuild
the versioned 1024-dimensional vector columns. The command is restartable and
skips rows already written with the active embedding version.

```bash
npm run db:migrate:ai
npm run ai:embeddings:reindex
```

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

## Production deployment

The repository ships production Dockerfiles for the core API (which also runs
the Prisma migrations), the AI API, and the web app (served by nginx, which
proxies `/api/`), plus `docker-compose.prod.yml` with PostgreSQL + pgvector and
one-shot migration jobs. No background-worker service is needed, so the APIs
can run as ordinary (including free-tier) web services with a managed
PostgreSQL such as Neon; queued work pauses while nobody is using the site
(see "Request-driven job pump" in the project documentation):

```bash
cp deploy/compose.env.example .env
cp deploy/core.env.example deploy/core.env
cp deploy/ai.env.example deploy/ai.env
docker compose -f docker-compose.prod.yml up -d --build
```

Only the web container publishes a port; terminate TLS in front of it and use
that HTTPS origin as `PUBLIC_SITE_URL`.

## Quality commands

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Security and compliance boundaries

- Do not scrape problem content or use undocumented private endpoints. The
  narrow public solved-count and consented Codeforces activity exceptions are
  user-triggered, size-limited, and subject to provider review.
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
