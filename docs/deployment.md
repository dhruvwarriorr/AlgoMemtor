# Deploying AlgoMemtor

## Current handoff (28 September 2026)

- The existing Tokyo Supabase project's `core` and `ai` schemas, pgvector,
  Prisma history, and Alembic history were copied from Neon. Every application
  table's row count and both migration histories matched after the copy. The
  copy script refuses to overwrite this populated target, so do not rerun it.
- The Render Core service is suspended while the cutover is pending. Keep it
  suspended until its database URL is switched to Supabase or the combined
  Vercel app is serving the API.
- Both Vercel projects have Supabase runtime database settings, and the web
  project uses `apps/web` as its Next.js Root Directory. The new local code has
  not been deployed, committed, or pushed. A Git redeploy of the previous
  commit will still run the old app.
- Rotate the Supabase database password before production deployment and
  replace its URLs in both Vercel projects and the ignored local environment
  files. Percent-encode reserved characters in the password inside database
  URLs (for example, `@` becomes `%40`).

The target is two Mumbai (`bom1`) deployments on Vercel using the existing
AlgoMemtor Supabase project in Tokyo (`ap-northeast-1`) for Postgres and Auth.
Database requests from the Vercel functions cross regions.

| Piece             | Code                                                                                       | Hosts                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Website and API   | `apps/web` (Next.js: pages plus route handlers under `src/app/api` and `src/app/internal`) | Vercel project, Root Directory `apps/web`             |
| AI service        | `apps/ai-api` (FastAPI)                                                                    | Separate Vercel project, Root Directory `apps/ai-api` |
| Database and auth | Postgres (`core` schema: Prisma, `ai` schema: Alembic) and Supabase Auth                   | Supabase                                              |

There is no separate API server and there are no worker processes. Queued
provider syncs and memory jobs run inside the web app's functions after a
response is sent (`after()` in `src/server/context.ts`), woken by a signed-in
page (`/api/jobs/pump`) or a connector upload.

## 1. Supabase database

1. Keep the existing Tokyo Supabase project and its Auth configuration. Its
   learner IDs already match the IDs stored in Neon; no Auth migration or new
   Supabase project is needed.
2. Copy two connection strings from **Connect** in that project's dashboard:
   - **Transaction pooler** (port 6543): the runtime `DATABASE_URL` for both apps.
   - **Session pooler** (port 5432): for migrations and the data copy
     (`DATABASE_MIGRATION_URL`). The direct connection also works if your
     network has IPv6.
3. Leave the `core` and `ai` schemas out of **Data API → Exposed schemas**. The
   app talks to Postgres directly; nothing should reach these tables through
   the public REST API.

### Moving the data from Neon

Pause writes to Neon before copying its application tables into the existing
Tokyo Supabase project:

```bash
NEON_DATABASE_URL='<Neon direct URL>' \
SUPABASE_DATABASE_URL='<Supabase session pooler URL>' \
npm run db:copy-from-neon
```

The script (`scripts/copy-neon-to-supabase.sh`) enables pgvector, copies the
`core` and `ai` schemas and both migration history tables, then compares row
counts and the contents of both migration history tables. It refuses to run
against a database that already has either application schema. It does not
copy Supabase Auth users, which already live in the Tokyo project. It
revokes the public Data API roles from both migration history tables and
enables row level security on them.

Starting without data instead? Run the migrations:

```bash
npm run db:migrate   # prisma migrate deploy, then alembic upgrade head
npm run db:seed      # normalized topics
```

## 2. Web app (Vercel)

- **Root Directory:** `apps/web`, with "Include files outside the root
  directory" on. `apps/web/vercel.json` installs and builds from the repository
  root: the shared contracts, then the browser connector zips, then `next build`.
- **Environment variables:** everything in `apps/web/.env.example`. At minimum:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `DATABASE_URL` (transaction pooler), `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`,
  `AI_API_URL`, `INTERNAL_SERVICE_TOKEN`, and `ALGOMEMTOR_WEB_URL` (set this to
  `https://www.algomemtor.site`, the canonical public URL baked into the
  connector build). Keep the existing Tokyo project's Auth URL and publishable
  key.
- API routes run up to 300 seconds (`functions` in `vercel.json`), enough for
  the longest AI mentor calls.

## 3. AI service (Vercel)

Update these settings for the existing Supabase project and new web app:

- `DATABASE_URL`: the Supabase transaction pooler URL. Prepared statements are
  already off (`app/database.py`), which the transaction pooler requires.
- `SUPABASE_URL` and `SUPABASE_JWT_ISSUER`: keep the existing Tokyo Auth project.
- `CORE_API_URL`: the canonical web URL (`https://www.algomemtor.site`); the
  coach calls its `/internal/*` routes.

## 4. Cutover

1. Verify the `core` and `ai` row counts, migration histories, and a signed-in
   account against the existing Tokyo Supabase project.
2. Deploy the web app and AI service against that project and verify
   `/health`, sign-in, learner profile, and an AI request.
3. Point `www.algomemtor.site` at the web project, preserving the redirect
   from the apex domain.
4. Browser connectors paired before the move still upload to the old API URL
   saved in the extension. Keep the old API running until learners re-pair
   (pair again from the profile page), or publish a connector update.
5. Retire Render and Neon only after signed-in use and connector re-pairing
   have been verified. Keep the Tokyo Supabase project for Postgres and Auth.

## Local development

```bash
cp apps/web/.env.example apps/web/.env.local   # fill in
npm install
npm run dev          # web on http://localhost:5173, AI service on :8000
```

For a local database, `npm run db:up` starts Postgres with pgvector in Docker;
point `DATABASE_URL` at it and run `npm run db:migrate`.
