import 'dotenv/config'

import { defineConfig } from 'prisma/config'

// Prisma CLI only: migrations and the seed use the direct (non-pooled) Neon
// URL when DATABASE_MIGRATION_URL is set. The running API reads the pooled
// DATABASE_URL in src/database/prisma.ts. `prisma generate` connects to
// nothing, so a build without either URL uses an unreachable placeholder.
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
