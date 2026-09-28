import { createHash, randomBytes } from 'node:crypto'

import {
  ProviderSolvedProblemSchema,
  ProviderSubmissionSchema,
  type ConnectorClaimRequest,
  type ConnectorIngestRequest,
  type LinkableProvider,
  type ConnectorProvider,
  type ExternalProblemSummary,
  type ProviderSolvedProblem,
  type ProviderSubmission,
} from '@algomemtor/shared-contracts'

import type { ProblemMetadataCache } from '../integrations/providers/problem-metadata-cache'
import type { ConnectorTokenRepository } from '../repositories/connector-token-repository'
import type {
  ProviderAccountRecord,
  ProviderAccountRepository,
} from '../repositories/provider-account-repository'
import type { ProviderDataRepository } from '../repositories/provider-data-repository'
import type { StructuredLogger } from '../utils/structured-logger'

export const hashConnectorSecret = (secret: string) =>
  createHash('sha256').update(secret, 'utf8').digest('hex')

export const createConnectorSecret = () =>
  `amc_${randomBytes(32).toString('base64url')}`

export class ConnectorAccountMismatchError extends Error {
  readonly code = 'CONNECTOR_ACCOUNT_MISMATCH'

  constructor(provider: LinkableProvider) {
    const names: Record<LinkableProvider, string> = {
      leetcode: 'LeetCode',
      cses: 'CSES',
      codeforces: 'Codeforces',
      codechef: 'CodeChef',
    }
    super(
      `The ${names[provider]} account signed in to this browser is not the one linked to AlgoMemtor. Sign in with the linked account, or disconnect it in AlgoMemtor first.`,
    )
    this.name = 'ConnectorAccountMismatchError'
  }
}

export class ConnectorAccountUnavailableError extends Error {
  readonly code = 'CONNECTOR_ACCOUNT_UNAVAILABLE'

  constructor() {
    super('The linked account changed during the upload. Try again.')
    this.name = 'ConnectorAccountUnavailableError'
  }
}

const canonicalProblemUrl = (
  provider: ConnectorProvider,
  externalId: string,
) =>
  provider === 'leetcode'
    ? `https://leetcode.com/problems/${encodeURIComponent(externalId)}/`
    : provider === 'codechef'
      ? `https://www.codechef.com/problems/${encodeURIComponent(externalId)}`
      : `https://cses.fi/problemset/task/${encodeURIComponent(externalId)}/`

const sourceUrl = (provider: ConnectorProvider) =>
  provider === 'leetcode'
    ? 'https://leetcode.com/api/submissions/'
    : provider === 'codechef'
      ? 'https://www.codechef.com/recent/user'
      : 'https://cses.fi/problemset/'

// CodeChef problem codes are upper case in its URLs and public feed.
const problemId = (provider: ConnectorProvider, externalId: string) =>
  provider === 'codechef' ? externalId.toUpperCase() : externalId

const sectionSlug = (value: string | undefined) => {
  const slug = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return /^[a-z0-9-]{1,48}$/.test(slug) ? slug : null
}

// LeetCode and CSES IDs are distinct from public-feed event IDs so both
// sources can coexist per account. A CodeChef submission keeps its solution
// ID, the same event ID the server's public feed stores, so the two sources
// update one row instead of counting it twice.
const connectorEventId = (provider: ConnectorProvider, id: string) =>
  provider === 'codechef'
    ? id
    : `${provider === 'leetcode' ? 'lc' : 'cses'}:${id}`

export type ConnectorServiceOptions = {
  accountRepository: ProviderAccountRepository
  dataRepository: ProviderDataRepository
  tokenRepository: ConnectorTokenRepository
  problemMetadataCache?: ProblemMetadataCache
  logger: Pick<StructuredLogger, 'info' | 'warn'>
  now?: () => Date
}

export class ConnectorService {
  private readonly now: () => Date

  constructor(private readonly options: ConnectorServiceOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async createToken(authUserId: string, label: string) {
    const secret = createConnectorSecret()
    const token = await this.options.tokenRepository.create(
      authUserId,
      label,
      hashConnectorSecret(secret),
    )
    return { token, secret }
  }

  listTokens(authUserId: string) {
    return this.options.tokenRepository.listActive(authUserId)
  }

  revokeToken(authUserId: string, id: string) {
    return this.options.tokenRepository.revoke(authUserId, id, this.now())
  }

  async authenticate(secret: string) {
    const token = await this.options.tokenRepository.findActiveByHash(
      hashConnectorSecret(secret),
    )
    if (token === null) return null
    await this.options.tokenRepository.touch(token.id, this.now())
    return token
  }

  async linkedAccounts(authUserId: string) {
    const accounts = await Promise.all(
      (['leetcode', 'cses', 'codechef'] as const).map((provider) =>
        this.options.accountRepository.findByAuthUserIdAndProvider(
          authUserId,
          provider,
        ),
      ),
    )
    return accounts.flatMap((account) =>
      account === null ||
      (account.provider !== 'leetcode' &&
        account.provider !== 'cses' &&
        account.provider !== 'codechef')
        ? []
        : [
            {
              provider: account.provider,
              handle: account.externalHandle,
              verified: account.verificationStatus === 'verified',
            },
          ],
    )
  }

  async ingest(authUserId: string, request: ConnectorIngestRequest) {
    const account = await this.resolveAccount(
      authUserId,
      request.provider,
      request.account.handle,
    )
    const provider = request.provider
    const fetchedAt = this.now().toISOString()
    const completeness = request.historyComplete ? 'complete' : 'partial'
    const provenance = (providerId: string, canonicalUrl: string) => ({
      provider,
      providerId,
      canonicalUrl,
      sourceUrl: sourceUrl(provider),
      extractionStrategy: 'authenticated_connector' as const,
      schemaVersion: 'browser-connector-v1',
      completeness,
      fetchedAt,
      stale: false,
    })

    const submissions: ProviderSubmission[] = request.submissions.map(
      (item) => {
        const eventId = connectorEventId(provider, item.eventId)
        const externalId = problemId(provider, item.externalId)
        const canonicalUrl = canonicalProblemUrl(provider, externalId)
        return ProviderSubmissionSchema.parse({
          provider,
          externalId,
          eventId,
          ...(item.problemTitle === undefined
            ? {}
            : { problemTitle: item.problemTitle }),
          canonicalUrl,
          verdict: item.verdict,
          ...(item.language === undefined ? {} : { language: item.language }),
          occurredAt: new Date(item.occurredAt).toISOString(),
          isAccepted: item.isAccepted,
          ...(item.runtimeMs === undefined
            ? {}
            : { runtimeMs: item.runtimeMs }),
          ...(item.memoryKb === undefined ? {} : { memoryKb: item.memoryKb }),
          ...(item.passedTestCount === undefined
            ? {}
            : { passedTestCount: item.passedTestCount }),
          completeness,
          provenance: provenance(eventId, canonicalUrl),
        })
      },
    )

    // The earliest accepted submission in this upload dates a solve. The
    // repository keeps an earlier stored date if one exists.
    const firstAccepted = new Map<string, ProviderSubmission>()
    for (const submission of submissions) {
      if (!submission.isAccepted || submission.occurredAt === undefined)
        continue
      const existing = firstAccepted.get(submission.externalId)
      if (
        existing?.occurredAt === undefined ||
        submission.occurredAt < existing.occurredAt
      ) {
        firstAccepted.set(submission.externalId, submission)
      }
    }
    // Where each CodeChef problem was solved; a contest solve wins over a
    // practice solve of the same problem.
    const solveContexts = new Map<
      string,
      { solveContext: 'contest' | 'practice'; difficultyRating?: number }
    >()
    for (const problem of request.solvedProblems) {
      if (provider !== 'codechef' || problem.solveContext === undefined)
        continue
      const externalId = problemId(provider, problem.externalId)
      if (solveContexts.get(externalId)?.solveContext === 'contest') continue
      solveContexts.set(externalId, {
        solveContext: problem.solveContext,
        ...(problem.solveContext === 'contest' &&
        problem.difficultyRating !== undefined
          ? { difficultyRating: problem.difficultyRating }
          : {}),
      })
    }
    const solvedIds = new Set([
      ...request.solvedProblems.map((problem) =>
        problemId(provider, problem.externalId),
      ),
      ...firstAccepted.keys(),
    ])
    const catalogTags = await this.catalogTags(provider, [...solvedIds])
    // CSES lists every task under a section; like the CSES catalog adapter,
    // use that section as the task's tag when the catalog has none.
    if (provider === 'cses') {
      for (const problem of request.solvedProblems) {
        const section = sectionSlug(problem.section)
        if (section === null || catalogTags.has(problem.externalId)) continue
        const tags = ['cses', section]
        catalogTags.set(problem.externalId, {
          providerTags: tags,
          topics: tags,
        })
      }
    }
    const solvedProblems: ProviderSolvedProblem[] = [...solvedIds].map(
      (externalId) => {
        const canonicalUrl = canonicalProblemUrl(provider, externalId)
        const accepted = firstAccepted.get(externalId)
        const tags = catalogTags.get(externalId)
        const context = solveContexts.get(externalId)
        return ProviderSolvedProblemSchema.parse({
          provider,
          externalId,
          canonicalUrl,
          occurredAt: accepted?.occurredAt ?? null,
          firstObservedAt: fetchedAt,
          lastObservedAt: fetchedAt,
          ...(accepted === undefined
            ? {}
            : { sourceSubmissionId: accepted.eventId }),
          ...(tags === undefined || tags.providerTags.length === 0
            ? {}
            : { providerTags: tags.providerTags }),
          ...(tags === undefined || tags.topics.length === 0
            ? {}
            : { topics: tags.topics }),
          ...(context ?? {}),
          completeness: request.solvedListComplete ? 'complete' : 'partial',
          provenance: provenance(externalId, canonicalUrl),
        })
      },
    )

    const data = this.options.dataRepository
    await data.saveSubmissions(authUserId, account.id, submissions)
    await data.deleteSupersededPublicSubmissions(
      authUserId,
      account.id,
      submissions.flatMap((submission) =>
        submission.occurredAt === undefined
          ? []
          : [
              {
                externalId: submission.externalId,
                occurredAt: submission.occurredAt,
              },
            ],
      ),
    )
    await data.saveSolvedProblems(authUserId, account.id, solvedProblems)

    // CSES has no public profile, so its solved total comes from here.
    if (provider === 'cses' && request.solvedListComplete) {
      const solvedCount = await data.countSolvedProblems(authUserId, account.id)
      const now = this.now()
      await this.options.accountRepository.grantPublicStatsConsent(
        authUserId,
        provider,
        account.externalHandle,
        now,
      )
      await this.options.accountRepository.savePublicStatsSuccess(
        authUserId,
        provider,
        account.externalHandle,
        {
          solvedCount,
          complete: true,
          source: 'browser_connector',
          fetchedAt: now,
          attemptedAt: now,
        },
      )
    }

    this.options.logger.info('connector_ingest_completed', {
      provider,
      submissions: submissions.length,
      solvedProblems: solvedProblems.length,
      historyComplete: request.historyComplete,
    })
    return {
      provider,
      handle: account.externalHandle,
      storedSubmissions: submissions.length,
      storedSolvedProblems: solvedProblems.length,
    }
  }

  // Links (if needed) and verifies the account signed in to the browser.
  // Returns whether it was newly linked.
  async claim(authUserId: string, request: ConnectorClaimRequest) {
    const before =
      await this.options.accountRepository.findByAuthUserIdAndProvider(
        authUserId,
        request.provider,
      )
    const account = await this.resolveAccount(
      authUserId,
      request.provider,
      request.handle,
      false,
    )
    return { account, newlyLinked: before === null }
  }

  private async resolveAccount(
    authUserId: string,
    provider: LinkableProvider,
    handle: string,
    recordConnectorSync = true,
  ): Promise<ProviderAccountRecord> {
    const accounts = this.options.accountRepository
    const existing = await accounts.findByAuthUserIdAndProvider(
      authUserId,
      provider,
    )
    if (
      existing !== null &&
      existing.externalHandle.toLowerCase() !== handle.toLowerCase()
    ) {
      throw new ConnectorAccountMismatchError(provider)
    }
    // Pairing the connector and uploading from a signed-in session is the
    // learner's consent to link this account.
    const linked =
      existing ??
      (await accounts.upsertByAuthUserId(authUserId, provider, handle))
    const verified = await accounts.markVerified(
      authUserId,
      provider,
      linked.externalHandle,
      this.now(),
      recordConnectorSync,
    )
    if (verified === null) throw new ConnectorAccountUnavailableError()
    return verified
  }

  private async catalogTags(provider: ConnectorProvider, ids: string[]) {
    const tags = new Map<string, { providerTags: string[]; topics: string[] }>()
    // LeetCode solves are keyed by slug and tagged by the queued sync's tag
    // lookup; CSES tasks and CodeChef codes share IDs with the cached
    // catalog.
    const lookup = this.options.problemMetadataCache?.findByReferences
    if (provider === 'leetcode' || lookup === undefined || ids.length === 0)
      return tags
    let problems: ExternalProblemSummary[] = []
    try {
      problems = await lookup.call(
        this.options.problemMetadataCache,
        ids.map((externalId) => ({ provider, externalId })),
      )
    } catch {
      // Tags are optional; a cache failure must not reject the upload.
      return tags
    }
    for (const problem of problems) {
      tags.set(problem.externalId, {
        providerTags: problem.providerTags,
        topics: problem.topics,
      })
    }
    return tags
  }
}
