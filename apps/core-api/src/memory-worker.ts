import 'dotenv/config'

import {
  HttpAiMemoryClient,
  UnavailableAiMemoryClient,
  type AiMemoryClient,
} from './integrations/ai/ai-memory-client.js'
import { readAiRecommendationConfig } from './config/ai-config.js'
import { createPrismaClient, readDatabaseConfig } from './database/prisma.js'
import {
  PrismaProgressRepository,
  type MemoryEvidencePayload,
} from './repositories/progress-repository.js'
import type { LearnerProfileRepository } from './repositories/learner-profile-repository.js'
import { PrismaLearnerProfileRepository } from './repositories/learner-profile-repository.js'
import type { RecommendationRepository } from './repositories/recommendation-repository.js'
import { PrismaRecommendationRepository } from './repositories/recommendation-repository.js'
import { structuredLogger } from './utils/structured-logger.js'
import type {
  OutboxJobRecord,
  ProgressRepository,
} from './repositories/progress-repository.js'
import type { StructuredLogger } from './utils/structured-logger.js'

const retryDelaysMs = [30_000, 120_000, 600_000] as const

export type MemoryWorkerOptions = {
  repository: ProgressRepository
  client: AiMemoryClient
  learnerProfileRepository?: LearnerProfileRepository
  recommendationRepository?: RecommendationRepository
  logger?: Pick<StructuredLogger, 'warn' | 'info'>
  now?: () => Date
}

export class MemoryWorker {
  private readonly logger
  private readonly now
  private processing = false
  private activeRun: Promise<boolean> | null = null

  constructor(private readonly options: MemoryWorkerOptions) {
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? (() => new Date())
  }

  async processOnce() {
    if (this.processing) return false
    this.processing = true
    const run = this.processOne()
    this.activeRun = run
    try {
      return await run
    } finally {
      this.processing = false
      if (this.activeRun === run) this.activeRun = null
    }
  }

  async waitForIdle() {
    await this.activeRun
  }

  private async processOne() {
    const job = await this.options.repository.claimNextJob(this.now())
    if (job === null) return false
    try {
      await this.processJob(job)
      if (job.jobType !== 'learner_data_deletion') {
        await this.options.repository.completeJob(job.id, job.lockedAt)
      }
      this.logger.info('memory_outbox_job_completed', {
        jobType: job.jobType,
        attempts: job.attempts,
      })
    } catch (error) {
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'MEMORY_JOB_FAILED'
      if (job.attempts > retryDelaysMs.length) {
        await this.options.repository.failJob(job.id, code, job.lockedAt)
        this.logger.warn('memory_outbox_job_failed', {
          jobType: job.jobType,
          errorCode: code,
        })
      } else {
        const delay = retryDelaysMs[job.attempts - 1] ?? 600_000
        await this.options.repository.retryJob(
          job.id,
          new Date(this.now().getTime() + delay),
          code,
          job.lockedAt,
        )
        this.logger.warn('memory_outbox_job_retry_scheduled', {
          jobType: job.jobType,
          errorCode: code,
          attempts: job.attempts,
        })
      }
    }
    return true
  }

  private async processJob(job: OutboxJobRecord) {
    if (job.jobType === 'learner_data_deletion') {
      await this.options.client.deleteLearnerData(
        job.authUserId,
        job.idempotencyKey,
        'learner_deleted',
      )
      await this.options.repository.deleteAllForAuthUser(job.authUserId)
      return
    }
    if (job.jobType === 'memory_consent_cleanup') {
      await this.options.client.deleteLearnerData(
        job.authUserId,
        job.idempotencyKey,
        'consent_revoked',
      )
      return
    }
    if (job.jobType === 'problem_data_deletion') {
      if (
        job.problemProvider === undefined ||
        job.problemExternalId === undefined
      ) {
        throw new Error('The problem deletion job has no problem reference.')
      }
      await this.options.client.deleteProblemEvidence(
        job.authUserId,
        job.problemProvider,
        job.problemExternalId,
        job.idempotencyKey,
      )
      return
    }
    if (job.jobType === 'recommendation_invalidation') {
      return
    }
    if (await this.options.repository.hasPendingDeletion?.(job.authUserId)) {
      return
    }
    if (job.evidenceType === 'profile_preference') {
      await this.options.client.deleteLearnerPreference(
        job.authUserId,
        `${job.idempotencyKey}:replace`,
      )
    }
    if (job.evidenceId === undefined) {
      throw new Error('The memory job has no evidence reference.')
    }
    let evidence: MemoryEvidencePayload | null | undefined =
      await this.options.repository.getMemoryEvidence?.(
        job.authUserId,
        job.evidenceType,
        job.evidenceId,
      )
    if (
      job.evidenceType === 'profile_preference' &&
      this.options.learnerProfileRepository !== undefined
    ) {
      const profile =
        await this.options.learnerProfileRepository.findByAuthUserId(
          job.authUserId,
        )
      evidence =
        profile?.recommendationPreference === undefined
          ? null
          : {
              occurredAt: new Date(),
              explicitPreference: profile.recommendationPreference,
            }
    } else if (
      job.evidenceType === 'recommendation_feedback' &&
      this.options.recommendationRepository?.getFeedbackEvidenceByAuthUserId !==
        undefined
    ) {
      evidence =
        await this.options.recommendationRepository.getFeedbackEvidenceByAuthUserId(
          job.authUserId,
          job.evidenceId,
        )
    }
    if (evidence === null || evidence === undefined) return
    const consent = await this.options.repository.getConsent(job.authUserId)
    const note = consent?.enabled === true ? evidence.note : undefined
    await this.options.client.processEvidence({
      requestId: job.idempotencyKey,
      learnerId: job.authUserId,
      evidenceType: job.evidenceType,
      evidenceId: job.evidenceId,
      idempotencyKey: job.idempotencyKey,
      ...(evidence?.occurredAt === undefined
        ? {}
        : { occurredAt: evidence.occurredAt.toISOString() }),
      ...(note === undefined ? {} : { note }),
      ...(evidence.perceivedDifficulty === undefined
        ? {}
        : { perceivedDifficulty: evidence.perceivedDifficulty }),
      ...(evidence.timeSpentMinutes === undefined
        ? {}
        : { timeSpentMinutes: evidence.timeSpentMinutes }),
      ...(evidence.feedback === undefined
        ? {}
        : { feedback: evidence.feedback }),
      ...(evidence.explicitPreference === undefined
        ? {}
        : { explicitPreference: evidence.explicitPreference }),
      ...(evidence.problemStatus === undefined
        ? {}
        : { problemStatus: evidence.problemStatus }),
      ...(evidence.problemProvider === undefined
        ? {}
        : { problemProvider: evidence.problemProvider }),
      ...(evidence.problemExternalId === undefined
        ? {}
        : { problemExternalId: evidence.problemExternalId }),
    })
  }
}

export async function runMemoryWorker() {
  const prisma = createPrismaClient(readDatabaseConfig())
  const aiConfig = readAiRecommendationConfig()
  const repository = new PrismaProgressRepository(prisma)
  const learnerProfileRepository = new PrismaLearnerProfileRepository(prisma)
  const recommendationRepository = new PrismaRecommendationRepository(prisma)
  const client = aiConfig.configured
    ? new HttpAiMemoryClient(aiConfig)
    : new UnavailableAiMemoryClient()
  const worker = new MemoryWorker({
    repository,
    client,
    learnerProfileRepository,
    recommendationRepository,
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
    console.log(`Received ${signal}; closing the memory worker.`)
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
}

if (
  process.argv[1]?.endsWith('/memory-worker.ts') === true ||
  process.argv[1]?.endsWith('/memory-worker.js') === true
) {
  void runMemoryWorker()
}
