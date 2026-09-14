import 'dotenv/config'

import { readUnifiedProviderConfig } from './config/provider-config.js'
import { createPrismaClient, readDatabaseConfig } from './database/prisma.js'
import { CodeChefPublicStatsFetcher } from './integrations/provider-accounts/codechef-public-stats.js'
import { CodeChefActivityFetcher } from './integrations/provider-accounts/codechef-activity.js'
import { CodeforcesPublicStatsFetcher } from './integrations/provider-accounts/codeforces-public-stats.js'
import { LeetCodePublicStatsFetcher } from './integrations/provider-accounts/leetcode-public-stats.js'
import { LeetCodeActivityFetcher } from './integrations/provider-accounts/leetcode-activity.js'
import { CodeChefProfileFetcher } from './integrations/provider-accounts/codechef-profile.js'
import { CodeforcesProfileFetcher } from './integrations/provider-accounts/codeforces-profile.js'
import { LeetCodeProfileFetcher } from './integrations/provider-accounts/leetcode-profile.js'
import { PrismaProviderAccountRepository } from './repositories/provider-account-repository.js'
import { PrismaProviderProfileRepository } from './repositories/provider-profile-repository.js'
import { PrismaProviderDataRepository } from './repositories/provider-data-repository.js'
import { PrismaProviderSyncRepository } from './repositories/provider-sync-repository.js'
import { ProviderAccountStatsService } from './services/provider-account-stats-service.js'
import { ProviderProfileService } from './services/provider-profile-service.js'
import { ProviderSyncWorker } from './services/provider-sync-worker.js'
import { RequestGate } from './utils/request-gate.js'

const providerConfig = readUnifiedProviderConfig()
const prisma = createPrismaClient(readDatabaseConfig())
const accountRepository = new PrismaProviderAccountRepository(prisma)
const profileRepository = new PrismaProviderProfileRepository(prisma)
const dataRepository = new PrismaProviderDataRepository(prisma)
const syncRepository = new PrismaProviderSyncRepository(prisma)
const codeforcesGate = new RequestGate({
  minIntervalMs: providerConfig.codeforces.minRequestIntervalMs,
})
const codechefGate = new RequestGate({
  minIntervalMs: providerConfig.codechef.minRequestIntervalMs,
})
const leetcodeGate = new RequestGate({
  minIntervalMs: providerConfig.leetcode.minRequestIntervalMs,
})
const statsService = new ProviderAccountStatsService({
  repository: accountRepository,
  fetchers: [
    ...(providerConfig.enabled.codeforces &&
    providerConfig.codeforces.profileEnabled
      ? [
          new CodeforcesPublicStatsFetcher({
            baseUrl: providerConfig.codeforces.baseUrl,
            timeoutMs: providerConfig.codeforces.timeoutMs,
            maxAttempts: providerConfig.codeforces.maxAttempts,
            requestGate: codeforcesGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.profileEnabled
      ? [
          new CodeChefPublicStatsFetcher({
            baseUrl: `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: providerConfig.codechef.maxAttempts,
            requestGate: codechefGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.profileEnabled
      ? [
          new LeetCodePublicStatsFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            requestGate: leetcodeGate,
          }),
        ]
      : []),
  ],
})
const profileService = new ProviderProfileService({
  accountRepository,
  profileRepository,
  fetchers: [
    ...(providerConfig.enabled.codeforces &&
    providerConfig.codeforces.profileEnabled
      ? [new CodeforcesProfileFetcher({ requestGate: codeforcesGate })]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.profileEnabled
      ? [
          new CodeChefProfileFetcher({
            baseUrl: `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: providerConfig.codechef.maxAttempts,
            requestGate: codechefGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.profileEnabled
      ? [
          new LeetCodeProfileFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            maxAttempts: providerConfig.leetcode.maxAttempts,
            requestGate: leetcodeGate,
          }),
        ]
      : []),
  ],
})
const worker = new ProviderSyncWorker({
  repository: syncRepository,
  providerAccountRepository: accountRepository,
  statsService,
  profileService,
  dataRepository,
  activityFetchers: [
    ...(providerConfig.enabled.codeforces &&
    providerConfig.codeforces.activityEnabled
      ? [
          new CodeforcesPublicStatsFetcher({
            baseUrl: providerConfig.codeforces.baseUrl,
            timeoutMs: providerConfig.codeforces.timeoutMs,
            maxAttempts: providerConfig.codeforces.maxAttempts,
            requestGate: codeforcesGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.codechef &&
    providerConfig.codechef.activityEnabled
      ? [
          new CodeChefActivityFetcher({
            baseUrl: `${providerConfig.codechef.baseUrl.replace(/\/+$/, '')}/users/`,
            timeoutMs: providerConfig.codechef.timeoutMs,
            maxAttempts: providerConfig.codechef.maxAttempts,
            requestGate: codechefGate,
          }),
        ]
      : []),
    ...(providerConfig.enabled.leetcode &&
    providerConfig.leetcode.activityEnabled
      ? [
          new LeetCodeActivityFetcher({
            endpoint: providerConfig.leetcode.baseUrl,
            timeoutMs: providerConfig.leetcode.timeoutMs,
            maxAttempts: providerConfig.leetcode.maxAttempts,
            requestGate: leetcodeGate,
          }),
        ]
      : []),
  ],
})

await prisma.$connect()
const interval = setInterval(() => {
  void worker.processOnce()
}, 1_000)
void worker.processOnce()

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  clearInterval(interval)
  console.log(
    `Received ${signal}; closing the provider synchronization worker.`,
  )
  await worker.waitForIdle()
  await prisma.$disconnect()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}
