# Vercel + Neon + Render Deployment Plan

**Status:** deployment plan; hosting has not been configured or validated yet  
**Target:** Vercel for the React/Vite frontend, Neon for PostgreSQL, and Render
for the Express Core API and FastAPI AI API.

## Recommendation

This hosting split fits the current application:

- `apps/web` is a static Vite single-page application and can be built to
  `apps/web/dist` for Vercel.
- The Express API and FastAPI AI service are long-running HTTP servers. They
  belong on Render web services, not Vercel Functions.
- Both APIs use the same PostgreSQL database, with Prisma owning the `core`
  schema and Alembic owning the `ai` schema.
- Neon supports PostgreSQL and the `vector` extension used by the AI schema.
- Queue processing is now request-driven. It runs in the Core API when an
  authenticated site visit or browser-connector request wakes it; it does not
  require a separate always-running worker service.

This is a hobby/small-launch deployment shape. The free Render APIs can sleep
when idle, so the first request after inactivity can be slow. If prompt coach
responses and predictable availability matter, budget for always-on Render
instances. Free tiers are useful for a trial deployment, not a production
availability guarantee.

## Target layout

```text
Browser
  ├── https://www.example.com       Vercel: Vite static files and SPA routes
  ├── /api/*                        Vercel rewrite -> Render Express Core API
  └── Supabase Auth                  existing identity provider

Render Core API
  ├── Neon PostgreSQL (pooled runtime URL)
  ├── Render AI API (private URL when available; otherwise HTTPS + token)
  └── request-driven job pump (no separate worker)

Render AI API
  ├── Neon PostgreSQL (pooled runtime URL)
  └── OpenRouter (production model and embedding calls)

One-off release step
  ├── Prisma migrations + idempotent topic seed (direct Neon URL)
  └── Alembic migrations (direct Neon URL; after Prisma)
```

The browser continues to call the existing `/api/*` contract. A Vercel rewrite
forwards those requests to Core, keeping API requests same-origin from the
browser. The AI API is called by Core and should not be called directly by the
browser.

## Current state found in the repository

### Already present

- Prisma and Alembic own separate PostgreSQL schemas: `core` and `ai`.
- The AI migrations enable `vector` and create 768- and 1024-dimension vector
  columns with HNSW indexes.
- Core uses Prisma 7 with the `@prisma/adapter-pg` PostgreSQL driver adapter.
- Both services read `DATABASE_URL`; the Core pool size can be configured with
  `DATABASE_POOL_MAX`.
- Render-compatible Dockerfiles exist for Core and AI. Both services expose a
  `/health` route and accept a `PORT` environment variable.
- The web API uses relative `/api/...` URLs. The Vite development server already
  proxies `/api` to Core.
- The Core API has a configurable `WEB_ORIGIN` and a separate restricted CORS
  rule for the browser connector extension origins.
- Current docs describe request-driven queue processing and say queued work
  waits while the learner is inactive.

### Changes/configuration still needed

1. Configure the Vercel project to build from the repository root, build shared
   contracts before the web app, publish `apps/web/dist`, and support SPA deep
   links.
2. Add a Vercel `/api/*` rewrite to the public Render Core URL. Do not cache
   authenticated API responses at the Vercel edge.
3. Separate runtime database URLs from migration URLs. Runtime services should
   use Neon pooled URLs; Prisma and Alembic releases should use a direct Neon
   URL.
4. Configure a single, serialized migration release step. Run Prisma migrations
   and its idempotent seed first, then Alembic; deploy APIs only after both
   complete successfully.
5. Set application secrets and public frontend build variables in the
   appropriate service dashboards. Never put server secrets in Vercel's
   `VITE_*` variables.
6. Set exact production origins, custom domains, health checks, and Supabase
   callback allowlists.
7. Review database pool sizes across all running processes. Several AI
   repositories create SQLAlchemy engines, so each service process can create
   multiple pools.
8. Consider removing `sentence-transformers` from the production AI image if
   production always uses OpenRouter embeddings. The dependency is currently in
   the main `apps/ai-api` dependency list, even though local embeddings use it.

## Required repository changes

### 1. Vercel configuration for the Vite monorepo

Create a root-level `vercel.json` (or equivalent Vercel dashboard settings)
with these behaviors:

- Framework: Vite.
- Project root: repository root, so the build can access
  `packages/shared-contracts` and the root npm workspace lockfile.
- Build order: build `packages/shared-contracts`, then `apps/web`.
- Output directory: `apps/web/dist`.
- SPA fallback: rewrite application routes to `/index.html`.
- API rewrite: forward `/api/:path*` to the Render Core API's `/api/:path*`.
- Keep the API rewrite ahead of the catch-all SPA fallback.
- Do not enable rewrite caching for authenticated `/api/*` responses.

The Vite app uses the root `package-lock.json` and imports
`@algomemtor/shared-contracts`, which is why deploying from `apps/web` as an
isolated source directory can fail to see the shared workspace package.

One install detail needs explicit handling: `apps/core-api` currently has a
`postinstall` that runs `prisma generate`, and the Prisma config reads
`DATABASE_URL`. A root workspace install for a frontend-only Vercel build may
therefore require a harmless build-only placeholder URL or a web-specific
install strategy that does not run the Core postinstall. Do not put the real
Neon password in a Vercel build variable just to satisfy Prisma generation.
Verify this behavior on a Vercel Preview Deployment before production.

### 2. Neon connection configuration

Use one Neon project/database for both schemas. Keep schema ownership as-is:

- Prisma migrations manage only `core`.
- Alembic migrations manage only `ai` and the `vector` extension.
- Both services must point to the same Neon database and branch.

Use separate settings for runtime and migration connections:

| Setting | Used by | Connection type |
| --- | --- | --- |
| `DATABASE_URL` | Core and AI runtime services | Neon pooled hostname (`-pooler`) with SSL required |
| `DATABASE_MIGRATION_URL` | Prisma deploy/seed and Alembic upgrade | Neon direct hostname with SSL required |

The current Prisma config and Alembic environment both use `DATABASE_URL` for
migrations as well as runtime. Update them to read the direct migration URL in
the migration commands, while preserving the pooled `DATABASE_URL` for service
runtime. Keep the URL formats valid for each driver:

- Core expects a PostgreSQL URL such as `postgresql://...`.
- AI runtime uses `postgresql+psycopg://...`; Alembic's URL conversion already
  handles ordinary `postgresql://` and `postgres://` URLs.

Do not put a pooler URL into the migration setting. Migration work can use
connection/session behavior that is better served by a direct database
connection. Use the Neon Console's connection modal to copy the pooled and
direct URLs; do not manually guess the host or password.

The AI migrations run `CREATE EXTENSION IF NOT EXISTS vector`. Confirm the
extension is enabled on the target Neon database before running migrations.
Neon supports `pgvector`, but this plan does not claim the migrations have
already been tested against a live Neon branch.

### 3. Bound database pools

Before production, make AI SQLAlchemy pool limits configurable or set explicit
small defaults. Current AI repository factories create multiple async engines
with SQLAlchemy defaults. Combined with Core's `DATABASE_POOL_MAX`, those pools
can exceed the connection budget of a small Neon compute under concurrency.

Recommended work:

- Inventory the Core API, AI API, and any extra deployed process that connects
  to the database.
- Configure a conservative per-process pool size and overflow for AI engines.
- Keep Core's `DATABASE_POOL_MAX` low initially; raise it only after measuring
  traffic and Neon connection usage.
- Use `pool_pre_ping`/connection health checks where supported, and retry
  transient connection failures safely.
- Monitor active connections, connection wait time, query latency, compute
  usage, and HNSW index/storage growth after launch.

The older 768-dimensional embeddings and newer 1024-dimensional embeddings are
both retained during reindexing. This is a valid migration strategy, but it
temporarily uses extra Neon storage and index build compute. Reindexing and
backfill should be measured on the chosen Neon plan before loading significant
data.

### 4. Render services

Create two Render **Web Services** from the repository. No Render background
worker is needed for the current request-driven queue design.

| Service | Build/deploy source | Start/health |
| --- | --- | --- |
| Core API | `apps/core-api/Dockerfile`, repository root as Docker context, `runtime` target if the dashboard supports selecting it | `node dist/server.js`; health path `/health`; bind to `0.0.0.0` and Render's `PORT` |
| AI API | `apps/ai-api/Dockerfile`, repository root as Docker context | Dockerfile's Uvicorn command; health path `/health`; bind to `0.0.0.0` and Render's `PORT` |

The Core Dockerfile has both a `runtime` and a `migrate` target. The API service
must use the runtime target; do not start the application container with the
migration target. Render's monorepo/Docker settings must preserve repository
root as the build context because the Dockerfiles copy root workspace files.

Configure both services in the same Render region. If the selected Render plan
supports private service-to-service networking, make the AI API private and
set Core's `AI_API_URL` to the private AI service URL. Otherwise, expose AI over
HTTPS and require the existing `INTERNAL_SERVICE_TOKEN` on every internal call.
Do not expose an unauthenticated AI endpoint to the browser.

For a custom domain, use a Vercel domain for the website (for example,
`www.example.com`) and optionally a Render custom domain for Core
(`api.example.com`). Point the Vercel API rewrite to the Render Core URL or its
custom domain. Use a stable production hostname in browser-connector settings;
preview deployment hostnames should not be treated as the permanent API URL.

### 5. Environment variables and secrets

#### Vercel web build

Set these for Preview and Production as appropriate, then redeploy because Vite
embeds them into the built JavaScript:

- `VITE_SITE_URL`: canonical HTTPS frontend URL.
- `VITE_CORE_API_URL`: stable HTTPS Core API URL for browser-connector pairing
  and uploads. Normal site API calls remain relative `/api/...` and use the
  Vercel rewrite.
- `VITE_SUPABASE_URL`.
- `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Optional extension download URLs if those are being served.
- Ensure `VITE_USE_MOCKS=false` for production.

Never set `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `OPENROUTER_API_KEY`,
`INTERNAL_SERVICE_TOKEN`, or a Supabase service-role key as a `VITE_*` value.

#### Render Core API

- `NODE_ENV=production`
- `PORT` (Render supplies this; the process must honor it)
- `DATABASE_URL` (Neon pooled runtime URL)
- `DATABASE_POOL_MAX` (start conservatively)
- `DATABASE_CONNECTION_TIMEOUT_MS`
- `AI_API_URL` (private service URL if available, otherwise AI HTTPS URL)
- `INTERNAL_SERVICE_TOKEN` (same secret on Core and AI)
- `WEB_ORIGIN` (exact Vercel production origin, including scheme; also include
  preview origins only if preview testing needs browser CORS)
- `SUPABASE_URL`
- `SUPABASE_JWT_ISSUER=<SUPABASE_URL>/auth/v1`
- Provider, cache, and public-site settings required by the current Core env
  example

#### Render AI API

- `APP_ENV=production`
- `PORT` (Render supplies this)
- `DATABASE_URL` (same Neon database, pooled runtime URL, using the supported
  `postgresql+psycopg://` SQLAlchemy form)
- `INTERNAL_SERVICE_TOKEN` (must match Core)
- `CORE_API_URL` (Core private service URL if available; otherwise HTTPS)
- `SUPABASE_URL`
- `SUPABASE_JWT_ISSUER=<SUPABASE_URL>/auth/v1`
- `AI_PROVIDER=openrouter`
- `OPENROUTER_API_KEY` and the production OpenRouter model/embedding settings
- Configure feature flags and timeouts based on the Render service's request
  limits; current AI request and coach timeouts can be long

#### Migration runner

Provide `DATABASE_MIGRATION_URL` as a protected secret only to the one-off
migration process. Do not give the migration URL to the public web build. Use a
single release job or a controlled manual deployment step, never multiple
parallel copies of the migration process.

### 6. Migration/release ordering

Do not run migrations independently in both API startup commands. Use this
release sequence:

1. Create the Neon project, production branch, database, and application role.
2. Copy and test the pooled runtime URL and direct migration URL without
   committing either one.
3. Confirm `vector` is available and enabled for the Neon database.
4. Run Core `prisma migrate deploy` using the direct migration URL.
5. Run the idempotent Prisma topic seed.
6. Run `alembic upgrade head` using the direct migration URL.
7. Confirm both migration histories are at their expected heads and inspect
   `core` and `ai` schema objects.
8. Deploy/roll out Core and AI services using their pooled runtime URL.
9. Deploy Vercel only after the API URL, Supabase callback configuration, and
   Vercel rewrite are ready.
10. For future releases, run migrations once before rolling application code
    that requires the new schema. Keep each migration backward-compatible with
    the currently running app during the rollout where possible.

If using a Render pre-deploy command, verify that the selected Render plan
supports it for the service type. Otherwise, run the ordered migration step in
a controlled CI job or from a trusted operator environment with the direct
Neon URL. Avoid running migrations on every Core or AI replica startup.

## Custom domain and auth setup

1. Add the production site domain to Vercel and configure the DNS records Vercel
   provides.
2. Wait for Vercel TLS to become active.
3. Add the exact production website origin to Render Core's `WEB_ORIGIN`.
4. In Supabase Auth, set the production Site URL and allow the exact callback
   URLs used by the app: `/dashboard`, `/settings`, and `/reset-password` on the
   production origin.
5. Update the OAuth provider redirect configuration if Google sign-in is used.
6. Set `VITE_SITE_URL` to the same canonical frontend domain and redeploy Vercel.
7. Configure the browser connector to use the stable Core API URL, and verify
   Chrome/Firefox extension CORS still accepts its `chrome-extension://` and
   `moz-extension://` origins.

## Verification and launch gate

Complete these checks against Preview/staging before sending production traffic:

- Vercel build succeeds from the monorepo root and the deployed app loads on a
  deep link such as `/dashboard` after refresh.
- Direct Core `/health` and AI `/health` return healthy responses; a
  representative `/api/*` request reaches Core through the Vercel rewrite.
- Browser requests use the correct production `/api` rewrite and are not served
  MSW fixtures.
- Signup/sign-in, session refresh, logout, password recovery, Google redirect,
  and the exact production callback allowlist work in a real browser.
- Authenticated Core routes reject missing/invalid Supabase tokens.
- AI calls from Core succeed, reject a bad internal token, and cannot be called
  as an unauthenticated public capability.
- Prisma and Alembic migrations run in order on a Neon branch; verify
  `CREATE EXTENSION vector`, vector columns, HNSW indexes, JSONB, and array
  operations.
- Core and AI can read/write the shared Neon database through pooled URLs after
  the database has idled and resumed.
- Provider linking, browser-connector pairing/upload, job-pump wake-up, retry,
  and pending-job behavior work after Render cold starts and restarts.
- Coach, mentor, and attachment requests complete within the actual Render
  request limits. Do not infer this from local timeouts alone.
- Check Neon connection counts with both services running and ensure the pool
  limits leave headroom for migration and operator connections.
- Confirm logs do not print connection strings, tokens, user handles, full
  provider payloads, uploaded content, or raw prompts.
- Verify Neon backup/restore expectations and make a tested backup before
  onboarding real users.

## Known operational limits

- Render Free web services spin down after 15 minutes without inbound traffic;
  waking one can take about a minute. A frontend visit can therefore encounter
  Core cold start delay, followed by AI cold start delay on the first AI request.
- The request-driven queue intentionally pauses while no learner/site/connector
  activity wakes Core. Do not promise hourly sync or immediate memory processing
  while the learner is away.
- A long history sync may require the user to keep the site active; stored
  cursors and leases allow later continuation, but a cold start adds delay.
- Neon is PostgreSQL-compatible, but the target Neon branch still needs real
  migration and workload validation, especially for pgvector index build time,
  storage, compute use, and connection counts.
- Vercel only hosts the static frontend in this design. Core and AI remain on
  Render because their long-lived processes and model/provider calls are not
  part of the Vite static site.
- The Render Free tier's current availability, usage, and network limits should
  be checked in Render's documentation and dashboard at the time of deployment.

## Suggested execution order

1. Add the Vercel static-site configuration and test a Preview deployment.
2. Add runtime-vs-migration Neon URL support in Prisma/Alembic configuration.
3. Bound the Core and AI database pools.
4. Optimize the AI production dependency set if OpenRouter is the only
   production embedding provider.
5. Create Neon staging and run both migration systems against it.
6. Create Render Core and AI web services; set secrets and health checks.
7. Connect Vercel to Render through the `/api` rewrite and assign the custom
   production domain.
8. Complete authentication, connector, queued-job, AI timeout, restart, and
   database load checks.
9. Repeat the migration step and launch gates against production before opening
   signups.

## Official platform references

- [Vercel Vite deployment and SPA routing](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel external rewrites](https://vercel.com/docs/routing/rewrites)
- [Vercel monorepo support](https://vercel.com/docs/monorepos)
- [Render monorepo support](https://render.com/docs/monorepo-support)
- [Render Docker services](https://render.com/docs/docker)
- [Render free instance limits](https://render.com/docs/free)
- [Neon connection guide](https://neon.com/docs/get-started/connect-neon)
- [Prisma's Neon connection guidance](https://docs.prisma.io/docs/orm/v6/overview/databases/neon)
- [Neon pgvector/HNSW overview](https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector)
