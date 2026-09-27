# Vercel + Neon + Render Deployment Runbook

**Status:** configured in the repository on 2026-09-27; not yet deployed or
validated against live Vercel, Render or Neon accounts.
**Target:** every service on a free tier, so hosting costs nothing. The only
spend is OpenRouter AI usage, capped by credit and by the per-learner limits.

| Part | Host (free tier) | Configuration in this repository |
| ---- | ---------------- | -------------------------------- |
| React/Vite web app | Vercel Hobby | `vercel.json` (repository root) |
| FastAPI AI API | Vercel Hobby (one Python Function) | `apps/ai-api/vercel.json`, `[tool.vercel]` in `apps/ai-api/pyproject.toml`, `apps/ai-api/.vercelignore` |
| Express Core API | Render Free web service (Docker) | `render.yaml`, `apps/core-api/Dockerfile` |
| PostgreSQL (`core` + `ai` schemas, pgvector) | Neon Free | `DATABASE_URL` (pooled) and `DATABASE_MIGRATION_URL` (direct) |

## Free-tier limits this setup is built around

Checked against the providers' documentation on 2026-09-27. Re-check the
dashboards before launch; free tiers change.

**Vercel Hobby** (non-commercial, personal use only)

- Functions: 300 s maximum duration (Fluid compute), 2 GB memory / 1 vCPU,
  4.5 MB request and response bodies, 500 MB uncompressed Python bundle.
- Proxied requests (external `rewrites`) time out after **120 s**.
- One region per project (default `iad1`). 100 deployments a day.
- Monthly allotments of function invocations, active CPU and data transfer;
  Hobby pauses rather than bills when they run out. Waiting on OpenRouter or
  the database is not active CPU time.

**Render Free web service**

- Sleeps after 15 minutes without inbound traffic; waking takes about a
  minute.
- 750 free instance hours a month per workspace (enough for this one service
  even if it never sleeps). Outbound bandwidth and build minutes count against
  the workspace allowance; without a payment method Render suspends instead of
  billing.
- No persistent disk, no shell, no pre-deploy command, one instance.

**Neon Free**

- 0.5 GB storage per project (writes are blocked above it), 100 CU-hours of
  compute a month, up to 2 CU, 5 GB egress, 10 branches.
- Compute scales to zero after 5 idle minutes and cannot stay on; the first
  query after that waits for a cold start.
- pgvector is available on all plans.

## How the configuration fits those limits

- **No proxy for API calls.** The browser calls the Render Core API origin
  directly (`VITE_API_BASE_URL`). A Vercel rewrite would cut off any request
  longer than 120 s, and a Render wake-up plus a long AI answer can exceed
  that. Core only allows the origins in `WEB_ORIGIN` (comma separated) and
  caches CORS preflights for two hours. `vercel.json` only rewrites page routes
  to `index.html`.
- **AI inside the function limits.** Core waits at most 180 s for a Coach turn
  and 295 s for mentor tools; FastAPI's own per-call limits are shorter
  (140 s Coach, 110 s per model call). The Coach is text only, so no request
  approaches 4.5 MB (a Coach message body is capped at 128 KB).
- **Small AI bundle.** `sentence-transformers`/PyTorch, `pypdf` and the unused
  `langchain-postgres` are gone. A Linux install of the remaining dependencies
  measures about 221 MB, under the 500 MB Python limit. Tests, evaluation,
  scripts and Alembic are excluded from the function.
- **Few database connections.** Core's pool defaults to 5
  (`DATABASE_POOL_MAX`). Every AI repository shares one SQLAlchemy engine per
  process (`app/database.py`) with `DATABASE_POOL_SIZE=2` and
  `DATABASE_MAX_OVERFLOW=1`, pre-ping, 5-minute recycling and server-side
  prepared statements disabled for Neon's PgBouncer pooler.
- **Less cold-start work.** The AI service seeds the knowledge base only when
  its checksum or embedding version changed, instead of rewriting every chunk
  on each serverless cold start.
- **Waking a sleeping database.** Core's connection timeout defaults to 15 s
  so a scaled-to-zero Neon compute can wake.
- **One region.** Render `virginia`, Vercel `iad1` and a Neon project in
  `aws-us-east-1` keep server-to-server latency low.
- **No workers.** Queued syncs and memory jobs already run inside Core when a
  signed-in page wakes it (see `REQUEST_DRIVEN_QUEUE_ARCHITECTURE.md`).

## AI models and budget

Every environment, local development included, uses OpenRouter. There are no
local models any more.

| Role | Model | $ per 1M tokens (in / out) | Work |
| ---- | ----- | -------------------------- | ---- |
| FAST | `openai/gpt-oss-20b` | 0.018 / 0.09 | recommendation reranking, memory extraction, classification, short summaries, progress narrative, simple Coach turns, upsolve picks, web-search summaries, structured JSON |
| STRONG | `deepseek/deepseek-v4-flash-0731` | 0.021 / 0.32 | deep Coach turns, Doubt Helper, Solution Explorer, code repair, AI Debugger, contest analysis, proofs, long context (1.3M-token window) |
| EMBEDDINGS | `qwen/qwen3-embedding-8b` (1024 d) | 0.01 | learner memory and knowledge RAG only |

Rough cost per request: a fast Coach turn with the tool agent is about
$0.001; a strong mentor request (for example a Solution Explorer run with
~20K input and ~16K output tokens) is about $0.005. At roughly $0.002 on
average, $5 covers about 2,500 requests.

### Per-learner AI limits

Core counts requests that reach a paid model, per learner, per minute and per
UTC day, in PostgreSQL (`core.ai_usage_counters`), so a sleeping Render
instance does not reset them. Over a limit the API answers
`429 AI_USAGE_LIMITED` with `Retry-After` before any model is called, and the
page shows the message.

| Variable (Core) | Default | Counts |
| --------------- | ------- | ------ |
| `AI_USAGE_LIMITS_ENABLED` | `false` | master switch |
| `AI_COACH_REQUESTS_PER_MINUTE` / `_PER_DAY` | 4 / 40 | Coach messages and roadmap notes |
| `AI_MENTOR_REQUESTS_PER_MINUTE` / `_PER_DAY` | 3 / 25 | Doubt Helper model turns, Solution Explorer, AI Debugger, contest and progress narratives |
| `AI_RECOMMENDATION_REFRESHES_PER_MINUTE` / `_PER_DAY` | 2 / 10 | recommendation refreshes (AI reranking) |
| `AI_GLOBAL_REQUESTS_PER_DAY` | 0 (`render.yaml`: 80) | all learners together; 0 = no shared ceiling |

A limit of 0 turns that window off. Keep `AI_USAGE_LIMITS_ENABLED=false` for
final testing, then set it to `true` in Render and redeploy before opening
sign-ups. Also set a credit limit on the OpenRouter key itself: it is the only
hard stop on spend.

## Deployment steps

### 1. Neon

1. Create a project in `aws-us-east-1` on the Free plan.
2. From the Connect dialog copy two URLs for the same database and role:
   - pooled (host contains `-pooler`), with `sslmode=require` - the runtime
     `DATABASE_URL`;
   - direct (no `-pooler`) - the `DATABASE_MIGRATION_URL`.
3. From a trusted machine, run the migrations once, in order (Prisma first):

   ```bash
   export DATABASE_MIGRATION_URL='postgresql://…direct…?sslmode=require'
   npm run db:migrate:core
   npm run db:seed
   cd apps/ai-api && DATABASE_MIGRATION_URL="$DATABASE_MIGRATION_URL" uv run alembic upgrade head
   ```

   Alembic enables `vector`. Repeat this step before rolling out code that
   needs a new migration. Never put the direct URL on Vercel or in a `VITE_*`
   variable.

### 2. Vercel AI project

1. Import the repository as a new project with **Root Directory**
   `apps/ai-api`. Vercel detects FastAPI and loads `app.main:app` from
   `[tool.vercel]`; `apps/ai-api/vercel.json` sets `maxDuration: 300`, region
   `iad1` and the bundle exclusions. Python 3.14 comes from `requires-python`.
2. Environment variables:

   ```text
   APP_ENV=production
   DATABASE_URL=<Neon pooled URL>   # postgresql:// is converted to psycopg
   INTERNAL_SERVICE_TOKEN=<long random secret, same as Core>
   CORE_API_URL=https://<core>.onrender.com
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_JWT_ISSUER=https://<project>.supabase.co/auth/v1
   WEB_ORIGIN=https://<web>.vercel.app
   OPENROUTER_API_KEY=<key with a credit limit>
   OPENROUTER_APP_URL=https://<web>.vercel.app
   ```

   Model, budget and feature settings default to the values in
   `apps/ai-api/.env.example`.
3. Check `https://<ai>.vercel.app/health`: `chat.available` and
   `embeddings.available` are `true` once the key is set.

### 3. Render Core API

1. New > Blueprint, pick this repository; `render.yaml` creates
   `algomemtor-core-api` (Docker, Free, Virginia, health check `/health`).
2. Fill the `sync: false` secrets: `DATABASE_URL` (pooled), `WEB_ORIGIN`
   (exact Vercel web origin), `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`,
   `AI_API_URL` (the Vercel AI URL), `CORE_API_URL` (this service's own URL)
   and `INTERNAL_SERVICE_TOKEN`.
3. Check `https://<core>.onrender.com/health`.

### 4. Vercel web project

1. Import the repository again with the **repository root** as Root
   Directory. `vercel.json` installs the npm workspaces, builds the shared
   contracts, the browser-connector zips (skipped if the build image lacks
   `zip`) and the web app into `apps/web/dist`. Prisma's `generate` in the
   Core postinstall needs no database URL.
2. Environment variables (build time; redeploy after changing them):

   ```text
   VITE_API_BASE_URL=https://<core>.onrender.com
   VITE_CORE_API_URL=https://<core>.onrender.com
   VITE_SITE_URL=https://<web>.vercel.app
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   VITE_USE_MOCKS=false
   ```

   Never put a database URL, the OpenRouter key, the internal token or a
   Supabase service-role key in a `VITE_*` variable.

### 5. Supabase and origins

1. Set the Supabase Site URL to the web origin and allow
   `/dashboard`, `/settings` and `/reset-password` on it; update Google OAuth
   redirects if used.
2. Make sure Render `WEB_ORIGIN` lists the exact web origin (add a preview
   origin only while testing a preview).

## Local development after this change

- Add `OPENROUTER_API_KEY` to `apps/ai-api/.env` (a key with a few dollars of
  credit). `AI_PROVIDER` is always `openrouter`; the old `LOCAL_*` settings are
  ignored.
- Existing local memories and knowledge chunks were embedded with the removed
  local model. Knowledge chunks re-embed automatically on the next AI start;
  run `npm run ai:embeddings:reindex` once for learner memories.
- Run `npm run db:migrate:core` for the new `ai_usage_counters` table.
- Keep `VITE_API_BASE_URL` empty locally so `/api` uses the Vite proxy.

## Launch checklist

- [ ] Web deep links (for example `/dashboard`) load after refresh.
- [ ] Core and AI `/health` respond; AI reports chat and embeddings available.
- [ ] Browser requests go to the Render origin with no CORS errors; the first
      request after 15 idle minutes waits for Render to wake and succeeds.
- [ ] Sign-up, sign-in, refresh, logout, password reset and Google redirect
      work on the production origin.
- [ ] A Coach turn, a Doubt Helper hint, a Solution Explorer run and a
      recommendation refresh complete; AI rejects a wrong internal token.
- [ ] With `AI_USAGE_LIMITS_ENABLED=true`, the fifth Coach message in a minute
      returns the limit message.
- [ ] Neon shows both schemas, pgvector columns and a sane connection count
      with both services running; take a backup before real users.
- [ ] Logs show no connection strings, tokens, handles or prompts.

## Known limits

- Render Free sleeps; the first visit after a quiet period takes about a
  minute, and queued sync work waits until a signed-in page wakes Core.
- Neon Free scales to zero after 5 minutes; the first query afterwards is
  slower. 0.5 GB is the storage ceiling: watch vector tables and provider
  history.
- Vercel Hobby is for personal, non-commercial use; a commercial launch needs
  Vercel Pro.
- Each Vercel AI instance keeps its own small connection pool; heavy
  concurrency can still approach Neon's connection limit.

## Official references

- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Vercel limits (proxied request timeout)](https://vercel.com/docs/limits)
- [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [Render free instances](https://render.com/docs/free)
- [Render Blueprint spec](https://render.com/docs/blueprint-spec)
- [Neon pricing and plan limits](https://neon.com/pricing)
- [OpenRouter models](https://openrouter.ai/models)
