import { config } from 'dotenv'

import { defineConfig } from 'prisma/config'

// Same files Next.js reads; .env.local wins.
config({ path: ['.env.local', '.env'], quiet: true })

// Prisma CLI only: migrations and the seed use the Supabase session pooler or
// direct URL when DATABASE_MIGRATION_URL is set. The running app reads the
// transaction-pooler DATABASE_URL in src/server/database/prisma.ts.
// `prisma generate` connects to nothing, so a build without either URL uses
// an unreachable placeholder.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_MIGRATION_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      'postgresql://build:build@localhost:5432/build',
  },
})
