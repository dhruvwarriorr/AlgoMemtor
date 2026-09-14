import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readWorkspaceFile = (relativeUrl: string) =>
  readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')

const prismaSchema = readWorkspaceFile('../../prisma/schema.prisma')
const coreMigration = readWorkspaceFile(
  '../../prisma/migrations/20260910010000_week9_core_schema/migration.sql',
)
const week10Migration = readWorkspaceFile(
  '../../prisma/migrations/20260910020000_week10_recommendation_actions/migration.sql',
)
const unifiedProviderMigration = readWorkspaceFile(
  '../../prisma/migrations/20260914120000_unified_provider_data/migration.sql',
)
const seedSource = readWorkspaceFile('../../prisma/seed.ts')
const alembicEnvironment = readWorkspaceFile('../../../ai-api/alembic/env.py')
const aiBaseline = readWorkspaceFile(
  '../../../ai-api/alembic/versions/202609100000_ai_schema_baseline.py',
)

const week9Tables = [
  'normalized_topics',
  'external_problem_cache',
  'bookmarks',
  'recommendation_batches',
  'recommendation_items',
  'problem_actions',
  'recommendation_feedback',
] as const

const coreModels = [
  'CoreUser',
  'LearnerProfile',
  'ProviderAccount',
  'NormalizedTopic',
  'ExternalProblemCache',
  'Bookmark',
  'RecommendationBatch',
  'RecommendationItem',
  'ProblemAction',
  'RecommendationFeedback',
] as const

const forbiddenField =
  /^\s*(?:starterCode|starter_code|editorial|editorials|testCases|test_cases|draft|drafts|sourceCode|source_code|privateResponse|private_response|sessionCookie|session_cookie)\s+/im

describe('Week 9 database schema boundaries', () => {
  it('keeps every Prisma model in the core schema', () => {
    const models = new Map(
      [...prismaSchema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map(
        ([, name, body]) => [name, body],
      ),
    )

    for (const model of coreModels) {
      expect(models.get(model), `${model} is missing`).toContain(
        '@@schema("core")',
      )
    }

    expect(prismaSchema).not.toMatch(forbiddenField)
    expect(prismaSchema).toMatch(
      /model ProblemContentCache[\s\S]*?statementHtml\s+String\?/,
    )
    expect(prismaSchema).toMatch(
      /model ProviderSubmission[\s\S]*?verdict\s+String\s+/,
    )
  })

  it('creates only the permitted Week 9 metadata and learner tables', () => {
    const createdTables = [
      ...coreMigration.matchAll(/CREATE TABLE IF NOT EXISTS core\.(\w+)/g),
    ].map(([, table]) => table)

    expect(createdTables).toEqual([...week9Tables])
    expect(coreMigration).not.toMatch(forbiddenField)
  })

  it('deduplicates metadata and indexes expiry lookups', () => {
    expect(prismaSchema).toMatch(/@@unique\(\[provider, externalId\]\)/)
    expect(prismaSchema).toMatch(/@@index\(\[expiresAt\]\)/)
    expect(prismaSchema).toMatch(/@@index\(\[provider, expiresAt\]\)/)
    expect(coreMigration).toMatch(/UNIQUE \(provider, external_id\)/)
    expect(coreMigration).toContain('external_problem_cache_expires_at_idx')
    expect(coreMigration).toContain(
      'external_problem_cache_provider_expires_at_idx',
    )
  })

  it('keeps ownership and status evidence explicit', () => {
    for (const table of [
      'bookmarks',
      'recommendation_batches',
      'problem_actions',
      'recommendation_feedback',
    ]) {
      expect(coreMigration).toMatch(
        new RegExp(
          `${table}_user_id_fkey[\\s\\S]*?REFERENCES core\\.users\\(id\\)`,
        ),
      )
    }

    expect(coreMigration).toContain('problem_actions_status_evidence_check')
    expect(coreMigration).toMatch(
      /learner_status IN \('unsolved', 'attempted', 'solved'\)/,
    )
    expect(coreMigration).toMatch(
      /evidence_source IN \('manual', 'provider_verified'\)/,
    )
  })

  it('permits long-lived public consent before the first statistics attempt', () => {
    expect(unifiedProviderMigration).toMatch(
      /activity_access = 'not_enabled'[\s\S]*stats_attempted_at IS NULL[\s\S]*OR \([\s\S]*activity_access = 'public_solved_count'/,
    )
    expect(unifiedProviderMigration).toContain(
      'public_stats_consent_at IS NOT NULL',
    )
  })

  it('allows dismissal restoration without deleting action history', () => {
    expect(week10Migration).toContain("'dismissal_restored'")
    expect(week10Migration).toContain(
      'DROP CONSTRAINT problem_actions_action_type_check',
    )
    expect(week10Migration).toContain(
      'ADD CONSTRAINT problem_actions_action_type_check',
    )
  })

  it('keeps the Week 9 migration and topic seed repeat-safe', () => {
    for (const table of week9Tables) {
      expect(coreMigration).toContain(
        `CREATE TABLE IF NOT EXISTS core.${table}`,
      )
    }

    const indexDeclarations = coreMigration.match(/CREATE INDEX/g) ?? []
    const repeatSafeIndexDeclarations =
      coreMigration.match(/CREATE INDEX IF NOT EXISTS/g) ?? []

    expect(repeatSafeIndexDeclarations).toHaveLength(indexDeclarations.length)
    expect(coreMigration).toContain(
      "conname = 'learner_profiles_answers_object_check'",
    )
    expect(seedSource).toContain('normalizedTopic.upsert')
    expect(seedSource).not.toMatch(/\.create\s*\(/)
    expect(seedSource).not.toMatch(
      /externalProblemCache|bookmark|problemAction|recommendation(?:Batch|Item|Feedback)/,
    )
  })

  it('keeps Alembic ownership separate from Prisma', () => {
    expect(aiBaseline).toContain('CREATE SCHEMA IF NOT EXISTS ai')
    expect(aiBaseline).not.toMatch(/CREATE TABLE|core\./)
    expect(alembicEnvironment).toContain('version_table="ai_alembic_version"')
    expect(alembicEnvironment).not.toContain('version_table="alembic_version"')
  })
})
