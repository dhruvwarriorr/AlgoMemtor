# AlgoMemtor Agent Guide

This file is the persistent working context for coding agents in this repository.
Read it before planning, reviewing, or changing the project. Then inspect the
current checkout: this guide explains the intended system, but the source tree and
working tree may have moved since it was last updated.

## Start every task here

1. Run `git status --short --branch` before editing.
2. Read the relevant section of `docs/PROJECT_DOCUMENTATION.md` and the files/tests that own the
   behavior.
3. Inspect package scripts, shared contracts, environment examples, and local
   conventions before introducing a new pattern.
4. Preserve unrelated modified and untracked files. The repository is often used
   with substantial work in progress.
5. Keep the requested scope explicit. Do not implement later roadmap phases,
   broad refactors, or "helpful" extras without being asked.
6. Do not commit, push, open a pull request, reset, clean, or discard work unless
   the user explicitly requests that exact action.

For read-only audits or diagnosis, do not make code changes. Report what is
complete, what is unfinished, intentional scope boundaries, and verification
gaps. For implementation requests, make the smallest complete change and verify
it in proportion to risk.

## Sources of truth

Use this order when documents disagree:

1. The user's current task and explicit exclusions.
2. `docs/PROJECT_DOCUMENTATION.md` for product, architecture, build order,
   milestone status, acceptance checks, and engineering rules.
3. `README.md` for current setup and operator-facing guidance.

The `.docx` files under `docs/` and `apps/web/README.md` are useful historical
references, but they can lag the Markdown roadmap, current contracts, and source.
For example, older material models progress as many evidence states; the current
contract exposes exactly three learner problem statuses. Never revive an older
model without a new, explicit architecture decision.

When documentation and implementation differ, do not silently bend the target
architecture around stale code. Identify the mismatch and resolve it in a
focused, documented change.

## Product in one paragraph

AlgoMemtor is an AI-assisted learning navigator for DSA, competitive programming,
coding interviews, and algorithmic thinking. It learns a learner's goals,
discovers metadata for suitable problems through approved provider APIs, ranks a
validated candidate set, explains recommendations, and sends the learner to the
canonical source platform. AlgoMemtor is a discovery, planning, and mentorship
layer. The external provider remains the authoritative place to read the full
problem, write and run code, submit, and receive verdicts.

The core loop is:

```text
learner profile
  -> provider metadata
  -> deterministic filters
  -> optional AI ranking and explanation
  -> attributed canonical external link
  -> manual or provider-verified evidence
  -> better next recommendation
```

## Non-negotiable product boundaries

- Store and render provider-permitted metadata, not full external problem
  statements, examples, constraints, starter code, editorials, or test cases.
- Do not add Monaco, an embedded IDE, code execution, Judge0, internal judging,
  learner source-code storage, drafts, submissions, or verdict storage.
- Use official or explicitly permitted provider APIs or feeds for catalog data.
  The public solved-count and activity behavior in the project documentation permits the backend to
  read the public CodeChef profile page and LeetCode website GraphQL response
  after explicit learner consent. Never scrape problem content, use browser
  automation, request credentials, or bypass authentication, CAPTCHA, access
  controls, or provider blocks.
- React never calls provider APIs directly. External access, normalization,
  caching, rate handling, and URL safety belong to Express.
- AI ranks only a bounded candidate set supplied by deterministic backend code.
  It cannot browse for arbitrary problems, introduce unknown IDs, or invent URLs.
- Express validates AI-selected IDs and attaches trusted canonical URLs after
  ranking. Deterministic ranking must remain a usable fallback.
- Every problem shows source attribution. Never imply partnership or endorsement
  without one.
- Opening a provider link is an `opened` event, not proof of an attempt or solve.
- Learner problem status has exactly three values: `unsolved`, `attempted`, and
  `solved`. Recommendations, bookmarks, dismissals, outbound opens, and evidence
  provenance are separate facts.
- Manual completion and provider-verified completion must remain distinguishable
  in storage, metrics, and UI copy.
- The product should degrade honestly: use deterministic ranking when AI fails,
  partial or permitted stale results when a provider fails, and clear retry or
  empty states when no data is available.

Changing any of these boundaries requires an explicit request and normally a new
ADR explaining context, alternatives, consequences, and review triggers.

## Architecture and ownership

```text
Browser (React + Vite)
  |
  +-- /api/* --> Express core API
  |                +-- Supabase JWT verification
  |                +-- provider gateway and adapters
  |                +-- deterministic filtering and URL safety
  |                +-- future core-schema persistence
  |
  +-- /ai/* --> FastAPI AI API
                   +-- Supabase JWT verification
                   +-- future bounded ranking, explanations, and memory

External providers own statements, editors, execution, submissions, and verdicts.
```

### `apps/web` — React, Vite, and TypeScript

Owns routes, responsive layouts, authentication-aware screens, catalog filters,
problem cards, recommendations, provider attribution, safe outbound navigation,
and loading/empty/error/stale/partial states.

Conventions:

- Use TanStack Query for server state.
- Keep catalog filters in `URLSearchParams`; the URL is the source of truth.
- Use component state for local UI only. Do not mirror fetched catalogs into a
  global store just to filter them.
- Call normalized `/api/*` endpoints through the central client. Do not import
  fixtures into pages and do not call Codeforces from the browser.
- Runtime-validate API responses with shared Zod schemas.
- Use semantic, accessible controls: real anchors for navigation and buttons for
  actions. Preserve keyboard behavior, focus visibility, and responsive layouts.
- External links must identify the provider, use trusted HTTPS URLs, and use
  `rel="noopener noreferrer"` when opening a new tab.
- Preserve the established UI and interaction design unless a redesign is
  explicitly requested.
- Recommendation and bookmark screens may be honest non-persistent placeholders
  until their roadmap phases. Do not add fake persistence.
- Provider-data staleness comes from API warnings such as `STALE_DATA`, not from
  TanStack Query's cache `isStale` flag.

### `apps/core-api` — Express and TypeScript

Owns authentication-aware product APIs, provider adapters, raw response
validation, normalization, canonical URL construction, filtering, caching, rate
handling, provider freshness, stable errors, and future learner-owned core data.

Conventions:

- Keep raw provider DTOs and schemas inside their adapter.
- Normalize to `@algomemtor/shared-contracts` before data reaches React or later
  persistence.
- Construct canonical links from validated provider identifiers. Allow only
  reviewed HTTPS hosts; never accept a generic arbitrary redirect target.
- Treat provider payloads as untrusted. Reject or skip malformed records safely
  and preserve valid partial results when the contract permits it.
- Preserve the provider error model in `src/errors/provider-error.ts` and stable
  codes such as `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`,
  `PROVIDER_UNAVAILABLE`, and `PROVIDER_INVALID_RESPONSE`.
- Respect timeout, retry, cache, deduplication, request-spacing, stale fallback,
  and safe-logging policies. Do not immediately retry rate-limit failures.
- Do not log tokens, authorization headers, credentials, full provider payloads,
  or arbitrary sensitive error details. Public-profile adapters may log only
  provider, status, retryability, and safe aggregate counts; never log handles
  or raw HTML/GraphQL/API responses.
- There is no broad local barrel-export convention; do not create one for a
  single feature.

The Codeforces adapter is the reference provider. It uses the official anonymous
`problemset.problems` API, validates the envelope and records, joins statistics,
normalizes tags/topics/difficulty, and constructs URLs only from safe contest IDs
and problem indices. Current defaults use a one-hour in-process TTL, shared
in-flight refreshes, a 2.1-second minimum request interval, at most one retry for
eligible failures, and stale-cache fallback with a refresh-failure cooldown.

### `apps/ai-api` — FastAPI and Python

Currently owns a health endpoint and authenticated identity endpoint. Later
phases add bounded recommendation ranking, concise explanations, learner memory,
and optional embeddings.

Conventions:

- Use type annotations, Pydantic models, small services, Ruff, and pytest.
- Accept normalized candidates from Express, not provider statements or arbitrary
  URLs.
- Return structured candidate IDs, scores, and reasons. Express must validate IDs
  and attach trusted URLs.
- Keep model failure non-fatal by preserving deterministic fallback in the core
  service.
- Avoid storing unnecessary prompts or private learner details.

### `packages/shared-contracts`

Owns the normalized, runtime-validated TypeScript API contract shared by React,
MSW, and Express. It currently defines Codeforces as the provider, external
metadata summaries, provider health/freshness, catalog queries and pagination,
warnings, API errors, topics, and the three learner statuses.

Boundary rules:

- Update contracts first when an API shape intentionally changes.
- Update every producer, consumer, fixture, and test in the same focused change.
- Provider-specific raw fields do not belong here.
- Problem-solving content, drafts, submissions, tests, and verdicts never belong
  here.
- Strict TypeScript and `exactOptionalPropertyTypes` mean optional values should
  usually be omitted, not assigned `undefined`.

### PostgreSQL ownership (planned)

The repository uses one PostgreSQL database with separate schemas:

- Prisma owns `core` tables.
- Alembic owns `ai` tables.
- The two migration systems must never manage the same table.

Planned core data includes users, learner profiles, provider consent, permitted
metadata cache, bookmarks/actions, recommendation history, feedback, and progress
evidence. Planned AI data includes learner memories, memory evidence, and ranking
audits. Do not add statement, test, source-code, draft, submission, or judge-token
tables.

## Authentication and secrets

Supabase Auth owns application identity. Provider-account linking is a separate,
optional feature and must have explicit consent, transparent read scope,
disconnect, and deletion controls.

- React may receive only `VITE_SUPABASE_URL` and a Supabase publishable key.
- Never expose a secret/service-role key, provider credential, database secret,
  LLM key, or internal service token through `VITE_*`.
- Express verifies Supabase access tokens with `jose` and remote JWKS.
- FastAPI verifies them with PyJWT and `PyJWKClient`.
- Never merely decode a JWT. Verify its cryptographic signature, issuer,
  `aud=authenticated`, expiry, non-empty subject, and `role=authenticated`.
- Allow only ES256 and RS256 for this flow. Legacy HS256 is intentionally not
  supported.
- Missing, malformed, expired, wrong-issuer, wrong-audience, wrong-role,
  missing-subject, and invalid-signature tokens return `401` with
  `WWW-Authenticate: Bearer`.
- The frontend attaches the current token, refreshes once after a `401`, and then
  expires the local session if the retry still fails.
- `VITE_SITE_URL` determines the signup confirmation target. Exact local and
  production `/dashboard` callbacks must also be allowlisted in the Supabase
  Dashboard.

Never claim authentication is fully accepted from fixtures and automated tests
alone. Real login, refresh/session restoration, logout, email callback, and
Dashboard allowlist behavior require the corresponding live Supabase/browser
check.

## Current implementation snapshot

Last reconciled with this working tree on 2026-09-10. Re-check the roadmap,
source, tests, and `git status` before relying on it.

- Weeks 1–5: product boundary, monorepo/UI foundation, architecture migration,
  shared metadata contracts, MSW catalog, URL filters, catalog UI, and safe
  provider links are present.
- Week 6: the live Codeforces provider gateway, normalization, filtering,
  caching, rate/error handling, freshness, and provider tests are present.
- Week 7: Supabase frontend auth, protected learner routes, authenticated fetch,
  Express/FastAPI JWT verification, and protected catalog/API endpoints are
  present locally. Real login, browser refresh/session restoration, protected
  catalog access, logout, and the exact local `/dashboard` callback were
  verified on 2026-08-26. The production callback remains a Week 16 deployment
  task because no production frontend URL exists yet.
- Week 8 is implemented locally: the editable learner profile is persisted,
  onboarding gates protected routes, and optional Codeforces, CodeChef, and
  LeetCode public-profile links and explicitly consented solved-count refreshes
  are available. Real browser and provider acceptance still need to be checked
  after any environment-specific setup.
- Week 9 is implemented locally: Prisma owns the expanded `core` schema,
  Alembic has a separate `ai` schema baseline, normalized-topic seeding is
  idempotent, the Codeforces metadata cache is durable, and owner-scoped
  repositories cover bookmarks, actions, recommendation history, and feedback.
  The PostgreSQL migration and reconnect checks pass locally; deployment still
  requires an available database.
- Week 10 is implemented locally: `deterministic-v1` ranking fetches through
  the provider gateway, persists ten-item batches, explains score factors,
  supports feedback, and maintains append-only dismissal/restore actions.
  The recommendations page has refresh, stale/partial/empty/error states,
  feedback controls, and a managed dismissed-problem list. Authenticated
  browser QA remains environment-dependent when a Supabase session is absent.
- Bookmark/progress APIs and UI, AI ranking, provider-account verification,
  learner memory, hardening, and deployment remain later-roadmap work unless
  the current source proves otherwise.

Important: this snapshot describes the working tree, which currently contains
uncommitted Week 10 work. It is context, not permission to commit or rewrite it.

## Environment and local development

Expected tools are Node/npm, Python 3.14+, `uv`, Docker, and Docker Compose.

Initial setup:

```bash
npm install
uv sync --project apps/ai-api
cp apps/web/.env.example apps/web/.env
cp apps/core-api/.env.example apps/core-api/.env
cp apps/ai-api/.env.example apps/ai-api/.env
```

Never overwrite an existing `.env`, and never commit real secrets.

Run PostgreSQL:

```bash
docker compose up -d postgres
docker compose logs -f postgres
docker compose down
```

The README also mentions `npm run db:up`, `npm run db:logs`, and
`npm run db:down`, but the root package scripts do not currently define them.
Confirm `package.json` before using any documented command.

Run all services or one service:

```bash
npm run dev
npm run dev:web
npm run dev:core
npm run dev:ai
```

Default local URLs:

- React: `http://localhost:5173`
- Express health: `http://localhost:3001/health`
- FastAPI health: `http://localhost:8000/health`

`VITE_USE_MOCKS=false` is the current example default. Set it to `true` only for
intentional MSW development. Keep the `/api/*` contract identical between mocked
and live modes.

## Verification commands

Choose checks based on the changed area. Do not describe static checks as proof
of visible browser behavior or live external-service acceptance.

### Whole JavaScript/TypeScript workspace

```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

### Focused checks

```bash
npm run typecheck:contracts
npm run build:contracts
npm run typecheck:web
npm run test:web
npm run build:web
npm run typecheck:core
npm run test:core
npm run build:core
```

### Python service

```bash
uv run --project apps/ai-api pytest apps/ai-api/tests
uv run --project apps/ai-api ruff check apps/ai-api
uv run --project apps/ai-api ruff format --check apps/ai-api
```

### Always useful before handoff

```bash
git diff --check
git status --short
```

Verification expectations:

- Shared-contract changes: type-check/build contracts and test all affected
  producers and consumers.
- Frontend logic: run focused tests, web type-check, lint/format checks, and the
  web build as appropriate.
- Visible UI, responsive layout, routing, gestures, or auth redirects: also test
  the actual browser flow at relevant desktop/mobile sizes when runtime
  acceptance is in scope.
- Core API/provider changes: run focused Vitest coverage, core type-check/build,
  and mocked HTTP tests before any live provider smoke test.
- FastAPI changes: run pytest, Ruff lint, and Ruff format checks.
- Auth/security changes: test rejected token classes, protected routes, 401
  headers, refresh behavior, and real Supabase/browser flows when available.
- Environment or deployment changes: verify the actual service/configuration;
  build success alone is not deployment acceptance.

If live credentials, browser access, ports, or external dashboard state are
unavailable, complete safe local verification and report the precise acceptance
gap. Do not convert missing external evidence into a success claim.

## Testing and implementation pitfalls

- Direct Node/MSW harnesses that import relative handlers such as `/api/problems`
  need `globalThis.location` defined before importing the handlers.
- Do not confuse API provider freshness with TanStack Query cache freshness.
- Catalog rating filters exclude unrated/non-numeric problems only when a rating
  bound is active. Invalid and inverted ranges must be sanitized.
- Query keys must include normalized filters and pagination. Do not serialize
  empty ratings as zero.
- Filter changes reset the page. Avoid synchronization effects that fight React
  hooks lint; derive state from URL parameters or remount focused form state.
- `SolveOnProviderLink` records an open non-blockingly. It must not change learner
  status or delay navigation indefinitely.
- Provider canonical URLs require valid trusted identifiers and an approved HTTPS
  host. Never patch a wrong link with browser-side hard-coding.
- `apps/ai-api/app/__init__.py` is required so the documented FastAPI invocation
  can resolve relative imports.
- Port-bind errors such as `listen EPERM` can be environment restrictions rather
  than assertion failures. Separate infrastructure failure from code failure.
- Run targeted Prettier from the owning workspace when root-relative forwarding
  would point at the wrong path.

## Coding conventions

- Keep changes small, cohesive, and consistent with nearby code.
- TypeScript uses strict types, Zod at boundaries, two-space indentation, single
  quotes, no semicolons, trailing commas, and an 80-column Prettier target.
- Avoid `any`, unsafe casts, and non-null assertions without proof.
- Prefer stable error codes and safe user-facing messages over leaking raw
  provider/internal errors.
- Python uses explicit type annotations, Pydantic for boundary models, and Ruff.
- Add or update tests for behavior and important failure branches.
- Keep loading, empty, success, stale, partial, and error states honest where
  applicable.
- New environment variables must be documented in the owning `.env.example` and
  setup documentation without adding live values.
- Do not edit generated artifacts such as `dist`, coverage output, virtual
  environments, `node_modules`, caches, or Python bytecode.

## Documentation and decisions

Update documentation when behavior, environment variables, public contracts,
milestone acceptance, or architecture changes. Do not mark roadmap acceptance
boxes complete without the evidence they require.

Record a decision in `docs/PROJECT_DOCUMENTATION.md` when changing:

- service ownership;
- provider/content boundaries;
- the meaning of learner status or evidence;
- canonical URL or AI safety rules;
- database schema ownership; or
- the decision to host content or execute code.

When reporting work, lead with the outcome and include:

- files or areas changed;
- behavior added or preserved;
- checks that passed;
- checks not run and why;
- remaining external/manual acceptance gaps; and
- confirmation that no commit or push was performed unless explicitly requested.
