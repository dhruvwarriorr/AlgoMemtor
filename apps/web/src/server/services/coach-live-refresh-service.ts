import type {
  LearnerActivityDigest,
  LinkableProvider,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import type { ProviderActivityDataFetcher } from '../integrations/provider-accounts/provider-public-stats'
import type { ProviderAccountRepository } from '../repositories/provider-account-repository'
import type { ProviderDataRepository } from '../repositories/provider-data-repository'
import type { ProviderSyncRepository } from '../repositories/provider-sync-repository'
import type { StructuredLogger } from '../utils/structured-logger'

export type CoachLiveRefreshResult = {
  provider: LinkableProvider
  status:
    | 'refreshed'
    | 'recently_refreshed'
    | 'not_linked'
    | 'browser_connector'
    | 'unavailable'
  message: string
  fetchedAt?: string
  newSubmissions?: number
  latestSubmissions: Array<{
    problem: string
    verdict: string
    accepted: boolean
    language?: string
    at?: string
    runtimeMs?: number
  }>
  providerSummary?: LearnerActivityDigest['providers'][number]
  totals?: LearnerActivityDigest['totals']
}

export type CoachLiveRefreshOptions = {
  accountRepository: ProviderAccountRepository
  dataRepository: ProviderDataRepository
  syncRepository: ProviderSyncRepository
  activityFetchers: readonly ProviderActivityDataFetcher[]
  refreshDigest: (authUserId: string) => Promise<LearnerActivityDigest>
  logger: Pick<StructuredLogger, 'info' | 'warn'>
  cooldownMs?: number
  timeoutMs?: number
  now?: () => Date
}

const compactSubmission = (row: ProviderSubmission) => ({
  problem: row.problemTitle ?? row.externalId,
  verdict: row.verdict,
  accepted: row.isAccepted,
  ...(row.language === undefined ? {} : { language: row.language }),
  ...(row.occurredAt === undefined ? {} : { at: row.occurredAt }),
  ...(row.runtimeMs === undefined ? {} : { runtimeMs: row.runtimeMs }),
})

// Lets the coach pull a learner's newest platform data mid-conversation when
// stored data is not enough. Each learner/provider pair is refreshed at most
// once per cooldown, and a refresh never moves the sync worker's resume
// cursor (it only stores rows the worker would store anyway).
export class CoachLiveRefreshService {
  private readonly lastRefresh = new Map<string, number>()
  private readonly cooldownMs: number
  private readonly timeoutMs: number
  private readonly now: () => Date

  constructor(private readonly options: CoachLiveRefreshOptions) {
    this.cooldownMs = options.cooldownMs ?? 3 * 60 * 1000
    this.timeoutMs = options.timeoutMs ?? 25_000
    this.now = options.now ?? (() => new Date())
  }

  async refresh(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<CoachLiveRefreshResult> {
    const account =
      await this.options.accountRepository.findByAuthUserIdAndProvider(
        authUserId,
        provider,
      )
    if (account === null) {
      return {
        provider,
        status: 'not_linked',
        message: `No ${provider} account is linked.`,
        latestSubmissions: [],
      }
    }
    const stored = async () =>
      (await this.options.dataRepository.listSubmissions(authUserId, provider))
        .slice(0, 10)
        .map(compactSubmission)

    const fetcher = this.options.activityFetchers.find(
      (item) => item.provider === provider,
    )
    if (fetcher === undefined) {
      const connectorRows = (
        await this.options.dataRepository.listSubmissions(authUserId, provider)
      ).filter(
        (row) =>
          row.provenance.extractionStrategy === 'authenticated_connector',
      )
      const lastUpload = connectorRows
        .map((row) => row.provenance.fetchedAt)
        .sort()
        .at(-1)
      return {
        provider,
        status: 'browser_connector',
        message:
          lastUpload === undefined
            ? `${provider} data comes only from the learner's browser connector, which has not uploaded yet.`
            : `${provider} data comes from the learner's browser connector; its last upload was at ${lastUpload}.`,
        latestSubmissions: await stored(),
      }
    }

    const key = `${authUserId}:${provider}`
    const last = this.lastRefresh.get(key)
    const nowMs = this.now().getTime()
    if (last !== undefined && nowMs - last < this.cooldownMs) {
      return {
        provider,
        status: 'recently_refreshed',
        message: `${provider} was refreshed ${Math.round((nowMs - last) / 1000)} seconds ago; showing stored data.`,
        latestSubmissions: await stored(),
      }
    }
    this.lastRefresh.set(key, nowMs)

    const before = new Set(
      (
        await this.options.dataRepository.listSubmissions(authUserId, provider)
      ).map((row) => row.eventId),
    )
    const state = await this.options.syncRepository.getState(
      authUserId,
      provider,
      account.id,
    )
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), this.timeoutMs)
    try {
      const activity = await fetcher.fetchActivityData(
        account.externalHandle,
        abort.signal,
        {
          ...(state.cursor === undefined ? {} : { cursor: state.cursor }),
          backfillOnly: true,
        },
      )
      const data = this.options.dataRepository
      await data.saveSubmissions(authUserId, account.id, activity.submissions)
      await data.saveSolvedProblems(
        authUserId,
        account.id,
        activity.solvedProblems,
      )
      await data.saveRatingChanges(
        authUserId,
        account.id,
        activity.ratingChanges,
      )
      await data.saveContestParticipations(
        authUserId,
        account.id,
        activity.contestParticipations,
      )
      const digest = await this.options.refreshDigest(authUserId)
      const newSubmissions = activity.submissions.filter(
        (row) => !before.has(row.eventId),
      ).length
      this.options.logger.info('coach_live_refresh_completed', {
        provider,
        newSubmissions,
      })
      const providerSummary = digest.providers.find(
        (item) => item.provider === provider,
      )
      return {
        provider,
        status: 'refreshed',
        message:
          newSubmissions === 0
            ? `Fetched ${provider} just now; there are no new submissions since the last sync.`
            : `Fetched ${provider} just now; found ${newSubmissions} new submissions.`,
        fetchedAt: activity.fetchedAt.toISOString(),
        newSubmissions,
        latestSubmissions: await stored(),
        ...(providerSummary === undefined ? {} : { providerSummary }),
        totals: digest.totals,
      }
    } catch (error) {
      this.options.logger.warn('coach_live_refresh_failed', {
        provider,
        errorCode:
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : 'COACH_LIVE_REFRESH_FAILED',
      })
      return {
        provider,
        status: 'unavailable',
        message: `${provider} could not be reached just now; showing stored data from the last sync.`,
        latestSubmissions: await stored(),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
