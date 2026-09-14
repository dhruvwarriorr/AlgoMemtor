import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readWorkspaceFile = (relativeUrl: string) =>
  readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')

const schema = readWorkspaceFile('../../prisma/schema.prisma')
const migration = readWorkspaceFile(
  '../../prisma/migrations/20260914010000_provider_verified_activity/migration.sql',
)

describe('provider verified activity schema boundaries', () => {
  it('keeps evidence owner-scoped and free of problem content', () => {
    expect(schema).toContain('model ProviderVerifiedActivity')
    expect(schema).toContain('@@map("provider_verified_activity")')
    expect(migration).toContain('provider_verified_activity_user_id_fkey')
    expect(migration).toContain(
      'provider_verified_activity_user_provider_external_key',
    )
    expect(migration).toContain('provider_verified_activity_account_event_key')
    expect(migration).toContain(
      'provider_verified_activity_progress_action_id_fkey',
    )
    expect(migration).not.toMatch(
      /source[_ ]?code|statement|test[_ ]?case|editorial|password|token/i,
    )
  })

  it('stores only the explicit activity sync state on provider accounts', () => {
    for (const column of [
      'activity_consent_at',
      'activity_sync_status',
      'activity_last_attempted_at',
      'activity_last_succeeded_at',
      'activity_accepted_problem_count',
      'activity_complete',
      'activity_error_code',
      'activity_retry_after',
    ]) {
      expect(migration).toContain(`"${column}"`)
    }
  })
})
