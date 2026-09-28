import {
  LearnerProfileAnswersSchema,
  LearnerProfileSchema,
  type LearnerProfile,
  type SaveLearnerProfileRequest,
} from '@algomemtor/shared-contracts'

import { Prisma, type PrismaClient } from '../generated/prisma/client'

export interface LearnerProfileRepository {
  findByAuthUserId(authUserId: string): Promise<LearnerProfile | null>
  upsertByAuthUserId(
    authUserId: string,
    answers: SaveLearnerProfileRequest,
  ): Promise<LearnerProfile>
}

export class InMemoryLearnerProfileRepository implements LearnerProfileRepository {
  private readonly profilesByAuthUserId = new Map<string, LearnerProfile>()

  async findByAuthUserId(authUserId: string) {
    const profile = this.profilesByAuthUserId.get(authUserId)

    return profile === undefined ? null : LearnerProfileSchema.parse(profile)
  }

  async upsertByAuthUserId(
    authUserId: string,
    answers: SaveLearnerProfileRequest,
  ) {
    const profile = LearnerProfileSchema.parse({
      ...answers,
      onboardingCompleted: true,
    })

    this.profilesByAuthUserId.set(authUserId, profile)

    return LearnerProfileSchema.parse(profile)
  }
}

const toInputJsonObject = (
  answers: SaveLearnerProfileRequest,
): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(answers)) as Prisma.InputJsonObject

const profileFromRecord = (record: {
  answers: unknown
  onboardingCompleted: boolean
}) =>
  LearnerProfileSchema.parse({
    ...LearnerProfileAnswersSchema.parse(record.answers),
    onboardingCompleted: record.onboardingCompleted,
  })

export class PrismaLearnerProfileRepository implements LearnerProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAuthUserId(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { learnerProfile: true },
    })

    return user?.learnerProfile ? profileFromRecord(user.learnerProfile) : null
  }

  async upsertByAuthUserId(
    authUserId: string,
    answers: SaveLearnerProfileRequest,
  ) {
    const record = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.coreUser.upsert({
        where: { authUserId },
        create: { authUserId },
        update: {},
        select: { id: true },
      })

      return transaction.learnerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          answers: toInputJsonObject(answers),
          onboardingCompleted: true,
        },
        update: {
          answers: toInputJsonObject(answers),
          onboardingCompleted: true,
        },
      })
    })

    return profileFromRecord(record)
  }
}
