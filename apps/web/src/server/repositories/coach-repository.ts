import { randomUUID } from 'node:crypto'

import {
  CoachConversationResponseSchema,
  CoachConversationSchema,
  CoachMessageSchema,
  CoachActionProposalSchema,
  ImprovementRoadmapSchema,
  type CoachActionProposal,
  type CoachConversation,
  type CoachConversationResponse,
  type CoachMessage,
  type CoachRoadmapLane,
  type CoachManualTopicStatus,
  type ImprovementRoadmap,
} from '@algomemtor/shared-contracts'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { z } from 'zod'

const titleFromContent = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 48
    ? `${normalized.slice(0, 45).trimEnd()}…`
    : normalized || 'New coaching conversation'
}

export type CoachRepository = {
  listConversations(userId: string): Promise<CoachConversation[]>
  createConversation(userId: string, title?: string): Promise<CoachConversation>
  renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<CoachConversation | null>
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<CoachConversationResponse | null>
  appendMessage(
    userId: string,
    conversationId: string,
    message: Omit<CoachMessage, 'id' | 'createdAt'>,
  ): Promise<CoachMessage | null>
  updateSummary(
    userId: string,
    conversationId: string,
    summary: string,
  ): Promise<CoachConversation | null>
  clearConversationSummaries?(userId: string): Promise<void>
  deleteConversation(userId: string, conversationId: string): Promise<boolean>
  getRoadmap(userId: string): Promise<ImprovementRoadmap | null>
  listRoadmapRevisions?(userId: string): Promise<ImprovementRoadmap[]>
  saveRoadmap(
    userId: string,
    roadmap: ImprovementRoadmap,
  ): Promise<ImprovementRoadmap>
  getTopicStatuses(
    userId: string,
  ): Promise<Record<string, CoachManualTopicStatus>>
  setTopicStatus(
    userId: string,
    topic: string,
    status: CoachManualTopicStatus,
  ): Promise<void>
  clearTopicStatus?(userId: string, topic: string): Promise<void>
  recordTopicNote(
    userId: string,
    topic: string,
    note: string,
    status: CoachManualTopicStatus | null,
    source: string,
  ): Promise<{ id: string; occurredAt: Date }>
  getTopicNoteEvent(
    userId: string,
    eventId: string,
  ): Promise<{ note: string; occurredAt: Date } | null>
  saveProposal(
    userId: string,
    conversationId: string,
    proposal: CoachActionProposal,
  ): Promise<void>
  getProposal(
    userId: string,
    proposalId: string,
  ): Promise<{ conversationId: string; proposal: CoachActionProposal } | null>
  updateProposal(
    userId: string,
    proposalId: string,
    status: CoachActionProposal['status'],
  ): Promise<CoachActionProposal | null>
  deleteAllForAuthUser?(userId: string): Promise<void>
}

type StoredConversation = CoachConversation & { userId: string }

export class InMemoryCoachRepository implements CoachRepository {
  private readonly conversations = new Map<string, StoredConversation>()
  private readonly messages = new Map<string, CoachMessage[]>()
  private readonly roadmaps = new Map<string, ImprovementRoadmap>()
  private readonly roadmapRevisions = new Map<string, ImprovementRoadmap[]>()
  private readonly topicStatuses = new Map<
    string,
    Record<string, CoachManualTopicStatus>
  >()
  private readonly topicStatusEvents = new Map<
    string,
    Array<{
      topic: string
      status: CoachManualTopicStatus | null
      createdAt: string
    }>
  >()
  private readonly topicNoteEvents = new Map<
    string,
    {
      userId: string
      topic: string
      note: string
      status: CoachManualTopicStatus | null
      source: string
      occurredAt: Date
    }
  >()
  private readonly proposals = new Map<
    string,
    { userId: string; conversationId: string; proposal: CoachActionProposal }
  >()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async listConversations(userId: string) {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.userId === userId)
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
      .map(({ userId: _userId, ...conversation }) =>
        CoachConversationSchema.parse(conversation),
      )
  }

  async createConversation(userId: string, title?: string) {
    const createdAt = this.now().toISOString()
    const conversation = CoachConversationSchema.parse({
      id: randomUUID(),
      title: title?.trim() || 'New coaching conversation',
      createdAt,
      updatedAt: createdAt,
      messageCount: 0,
    })
    this.conversations.set(conversation.id, { ...conversation, userId })
    return conversation
  }

  async renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ) {
    const existing = this.conversations.get(conversationId)
    if (existing === undefined || existing.userId !== userId) return null
    const { userId: _userId, ...publicConversation } = existing
    const next = CoachConversationSchema.parse({
      ...publicConversation,
      title: title.trim(),
      updatedAt: this.now().toISOString(),
    })
    this.conversations.set(conversationId, { ...next, userId })
    return next
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined || conversation.userId !== userId)
      return null
    const { userId: _userId, ...publicConversation } = conversation
    return CoachConversationResponseSchema.parse({
      data: publicConversation,
      messages: this.messages.get(conversationId) ?? [],
    })
  }

  async appendMessage(
    userId: string,
    conversationId: string,
    message: Omit<CoachMessage, 'id' | 'createdAt'>,
  ) {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined || conversation.userId !== userId)
      return null
    const record = CoachMessageSchema.parse({
      ...message,
      id: randomUUID(),
      createdAt: this.now().toISOString(),
    })
    const messages = this.messages.get(conversationId) ?? []
    messages.push(record)
    this.messages.set(conversationId, messages)
    const { userId: _userId, ...publicConversation } = conversation
    const nextConversation = CoachConversationSchema.parse({
      ...publicConversation,
      ...(conversation.messageCount === 0 && record.role === 'user'
        ? { title: titleFromContent(record.content) }
        : {}),
      messageCount: messages.length,
      updatedAt: record.createdAt,
    })
    this.conversations.set(conversationId, {
      ...nextConversation,
      userId,
    })
    return record
  }

  async updateSummary(userId: string, conversationId: string, summary: string) {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined || conversation.userId !== userId)
      return null
    const { userId: _userId, ...publicConversation } = conversation
    const next = CoachConversationSchema.parse({
      ...publicConversation,
      summary,
      updatedAt: this.now().toISOString(),
    })
    this.conversations.set(conversationId, { ...next, userId })
    return next
  }

  async clearConversationSummaries(userId: string) {
    for (const [conversationId, conversation] of this.conversations) {
      if (conversation.userId !== userId || conversation.summary === undefined)
        continue
      const {
        userId: _userId,
        summary: _summary,
        ...publicConversation
      } = conversation
      const next = CoachConversationSchema.parse({
        ...publicConversation,
        updatedAt: this.now().toISOString(),
      })
      this.conversations.set(conversationId, { ...next, userId })
    }
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined || conversation.userId !== userId)
      return false
    this.conversations.delete(conversationId)
    this.messages.delete(conversationId)
    for (const [proposalId, proposal] of this.proposals) {
      if (
        proposal.userId === userId &&
        proposal.conversationId === conversationId
      )
        this.proposals.delete(proposalId)
    }
    return true
  }

  async deleteAllForAuthUser(userId: string) {
    for (const [id, conversation] of this.conversations) {
      if (conversation.userId === userId) {
        this.conversations.delete(id)
        this.messages.delete(id)
      }
    }
    this.roadmaps.delete(userId)
    this.roadmapRevisions.delete(userId)
    this.topicStatuses.delete(userId)
    this.topicStatusEvents.delete(userId)
    for (const [eventId, event] of this.topicNoteEvents) {
      if (event.userId === userId) this.topicNoteEvents.delete(eventId)
    }
    for (const [proposalId, proposal] of this.proposals) {
      if (proposal.userId === userId) this.proposals.delete(proposalId)
    }
  }

  async getRoadmap(userId: string) {
    const roadmap = this.roadmaps.get(userId)
    return roadmap === undefined
      ? null
      : ImprovementRoadmapSchema.parse(roadmap)
  }

  async listRoadmapRevisions(userId: string) {
    return (this.roadmapRevisions.get(userId) ?? [])
      .slice()
      .sort((left, right) => right.version - left.version)
      .map((roadmap) => ImprovementRoadmapSchema.parse(roadmap))
  }

  async saveRoadmap(userId: string, roadmap: ImprovementRoadmap) {
    const parsed = ImprovementRoadmapSchema.parse(roadmap)
    this.roadmaps.set(userId, parsed)
    const revisions = this.roadmapRevisions.get(userId) ?? []
    if (revisions.at(-1)?.version !== parsed.version) {
      revisions.push(parsed)
      this.roadmapRevisions.set(userId, revisions)
    }
    return parsed
  }

  async getTopicStatuses(userId: string) {
    return { ...(this.topicStatuses.get(userId) ?? {}) }
  }

  async setTopicStatus(
    userId: string,
    topic: string,
    status: CoachManualTopicStatus,
  ) {
    const statuses = this.topicStatuses.get(userId) ?? {}
    statuses[topic] = status
    this.topicStatuses.set(userId, statuses)
    const events = this.topicStatusEvents.get(userId) ?? []
    events.push({ topic, status, createdAt: this.now().toISOString() })
    this.topicStatusEvents.set(userId, events)
  }

  async clearTopicStatus(userId: string, topic: string) {
    const statuses = { ...(this.topicStatuses.get(userId) ?? {}) }
    delete statuses[topic]
    this.topicStatuses.set(userId, statuses)
    const events = this.topicStatusEvents.get(userId) ?? []
    events.push({ topic, status: null, createdAt: this.now().toISOString() })
    this.topicStatusEvents.set(userId, events)
  }

  async recordTopicNote(
    userId: string,
    topic: string,
    note: string,
    status: CoachManualTopicStatus | null,
    source: string,
  ) {
    const id = randomUUID()
    const occurredAt = this.now()
    this.topicNoteEvents.set(id, {
      userId,
      topic,
      note,
      status,
      source,
      occurredAt,
    })
    const events = this.topicStatusEvents.get(userId) ?? []
    events.push({ topic, status, createdAt: occurredAt.toISOString() })
    this.topicStatusEvents.set(userId, events)
    return { id, occurredAt }
  }

  async getTopicNoteEvent(userId: string, eventId: string) {
    const event = this.topicNoteEvents.get(eventId)
    if (event === undefined || event.userId !== userId) return null
    return { note: event.note, occurredAt: event.occurredAt }
  }

  async saveProposal(
    userId: string,
    conversationId: string,
    proposal: CoachActionProposal,
  ) {
    const conversation = this.conversations.get(conversationId)
    if (conversation === undefined || conversation.userId !== userId) {
      throw new Error('The coaching conversation is not owned by this learner.')
    }
    const parsed = CoachActionProposalSchema.parse(proposal)
    const existing = this.proposals.get(parsed.id)
    if (existing !== undefined && existing.userId !== userId) {
      throw new Error('The coaching proposal is not owned by this learner.')
    }
    if (existing !== undefined && existing.proposal.status !== 'proposed') {
      return
    }
    this.proposals.set(parsed.id, { userId, conversationId, proposal: parsed })
  }

  async getProposal(userId: string, proposalId: string) {
    const value = this.proposals.get(proposalId)
    if (value === undefined || value.userId !== userId) return null
    return { conversationId: value.conversationId, proposal: value.proposal }
  }

  async updateProposal(
    userId: string,
    proposalId: string,
    status: CoachActionProposal['status'],
  ) {
    const value = this.proposals.get(proposalId)
    if (value === undefined || value.userId !== userId) return null
    const proposal = CoachActionProposalSchema.parse({
      ...value.proposal,
      status,
    })
    this.proposals.set(proposalId, { ...value, proposal })
    const messages = this.messages.get(value.conversationId)
    if (messages !== undefined) {
      this.messages.set(
        value.conversationId,
        messages.map((message) =>
          CoachMessageSchema.parse({
            ...message,
            proposals: message.proposals.map((item) =>
              item.id === proposalId ? proposal : item,
            ),
          }),
        ),
      )
    }
    return proposal
  }
}

const jsonValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

export class PrismaCoachRepository implements CoachRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async userId(authUserId: string) {
    const user = await this.prisma.coreUser.upsert({
      where: { authUserId },
      create: { authUserId },
      update: {},
      select: { id: true },
    })
    return user.id
  }

  async listConversations(authUserId: string) {
    const userId = await this.userId(authUserId)
    const records = await this.prisma.coachConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    })
    return records.map((record) =>
      CoachConversationSchema.parse({
        id: record.id,
        title: record.title,
        ...(record.summary === null ? {} : { summary: record.summary }),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        messageCount: record._count.messages,
      }),
    )
  }

  async createConversation(authUserId: string, title?: string) {
    const userId = await this.userId(authUserId)
    const record = await this.prisma.coachConversation.create({
      data: { userId, title: title?.trim() || 'New coaching conversation' },
    })
    return CoachConversationSchema.parse({
      id: record.id,
      title: record.title,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      messageCount: 0,
    })
  }

  async renameConversation(
    authUserId: string,
    conversationId: string,
    title: string,
  ) {
    const userId = await this.userId(authUserId)
    const existing = await this.prisma.coachConversation.findFirst({
      where: { id: conversationId, userId },
    })
    if (existing === null) return null
    const record = await this.prisma.coachConversation.update({
      where: { id: conversationId },
      data: { title: title.trim() },
    })
    return CoachConversationSchema.parse({
      id: record.id,
      title: record.title,
      ...(record.summary === null ? {} : { summary: record.summary }),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      messageCount: record.messageCount,
    })
  }

  async getConversation(authUserId: string, conversationId: string) {
    const userId = await this.userId(authUserId)
    const record = await this.prisma.coachConversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (record === null) return null
    const conversation = CoachConversationSchema.parse({
      id: record.id,
      title: record.title,
      ...(record.summary === null ? {} : { summary: record.summary }),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      messageCount: record.messageCount,
    })
    return CoachConversationResponseSchema.parse({
      data: conversation,
      messages: record.messages.map((message) =>
        CoachMessageSchema.parse({
          id: message.id,
          role: message.role,
          content: message.content,
          ...(message.transientContextOmitted
            ? { transientContextOmitted: true }
            : {}),
          evidence: message.evidence,
          proposals: message.proposals,
          ...(message.richContent === null || message.richContent === undefined
            ? {}
            : { richContent: message.richContent }),
          ...(message.fallback ? { fallback: true } : {}),
          createdAt: message.createdAt.toISOString(),
        }),
      ),
    })
  }

  async appendMessage(
    authUserId: string,
    conversationId: string,
    message: Omit<CoachMessage, 'id' | 'createdAt'>,
  ) {
    const userId = await this.userId(authUserId)
    return this.prisma.$transaction(async (transaction) => {
      const conversation = await transaction.coachConversation.findFirst({
        where: { id: conversationId, userId },
      })
      if (conversation === null) return null
      const record = await transaction.coachMessage.create({
        data: {
          conversationId,
          role: message.role,
          content: message.content,
          transientContextOmitted: message.transientContextOmitted ?? false,
          evidence: jsonValue(message.evidence),
          proposals: jsonValue(message.proposals),
          ...(message.richContent === undefined
            ? {}
            : { richContent: jsonValue(message.richContent) }),
          fallback: message.fallback ?? false,
        },
      })
      await transaction.coachConversation.update({
        where: { id: conversationId },
        data: {
          messageCount: { increment: 1 },
          ...(conversation.messageCount === 0 && message.role === 'user'
            ? { title: titleFromContent(message.content) }
            : {}),
        },
      })
      return CoachMessageSchema.parse({
        id: record.id,
        role: record.role,
        content: record.content,
        ...(record.transientContextOmitted
          ? { transientContextOmitted: true }
          : {}),
        evidence: record.evidence,
        proposals: record.proposals,
        ...(record.richContent === null
          ? {}
          : { richContent: record.richContent }),
        ...(record.fallback ? { fallback: true } : {}),
        createdAt: record.createdAt.toISOString(),
      })
    })
  }

  async updateSummary(
    authUserId: string,
    conversationId: string,
    summary: string,
  ) {
    const userId = await this.userId(authUserId)
    const existing = await this.prisma.coachConversation.findFirst({
      where: { id: conversationId, userId },
    })
    if (existing === null) return null
    const record = await this.prisma.coachConversation.update({
      where: { id: conversationId },
      data: { summary },
    })
    return CoachConversationSchema.parse({
      id: record.id,
      title: record.title,
      summary: record.summary ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      messageCount: record.messageCount,
    })
  }

  async clearConversationSummaries(authUserId: string) {
    const userId = await this.userId(authUserId)
    await this.prisma.coachConversation.updateMany({
      where: { userId },
      data: { summary: null },
    })
  }

  async deleteConversation(authUserId: string, conversationId: string) {
    const userId = await this.userId(authUserId)
    const result = await this.prisma.coachConversation.deleteMany({
      where: { id: conversationId, userId },
    })
    return result.count > 0
  }

  async deleteAllForAuthUser(authUserId: string) {
    const user = await this.prisma.coreUser.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (user === null) return
    const userId = user.id
    await this.prisma.$transaction([
      this.prisma.coachConversation.deleteMany({ where: { userId } }),
      this.prisma.coachRoadmap.deleteMany({ where: { userId } }),
      this.prisma.coachTopicStatus.deleteMany({ where: { userId } }),
      this.prisma.coachTopicStatusEvent.deleteMany({ where: { userId } }),
      this.prisma.coachActionProposal.deleteMany({ where: { userId } }),
    ])
  }

  async getRoadmap(authUserId: string) {
    const userId = await this.userId(authUserId)
    const record = await this.prisma.coachRoadmap.findUnique({
      where: { userId },
    })
    return record === null
      ? null
      : ImprovementRoadmapSchema.parse(record.payload)
  }

  async listRoadmapRevisions(authUserId: string) {
    const userId = await this.userId(authUserId)
    const records = await this.prisma.coachRoadmapRevision.findMany({
      where: { userId },
      orderBy: { version: 'desc' },
      take: 8,
    })
    return records.map((record) =>
      ImprovementRoadmapSchema.parse(record.payload),
    )
  }

  async saveRoadmap(authUserId: string, roadmap: ImprovementRoadmap) {
    const userId = await this.userId(authUserId)
    const parsed = ImprovementRoadmapSchema.parse(roadmap)
    const record = await this.prisma.coachRoadmap.upsert({
      where: { userId },
      create: { userId, version: parsed.version, payload: jsonValue(parsed) },
      update: { version: parsed.version, payload: jsonValue(parsed) },
    })
    const revision = await this.prisma.coachRoadmapRevision.findFirst({
      where: { roadmapId: record.id, version: parsed.version },
      select: { id: true },
    })
    if (revision === null) {
      await this.prisma.coachRoadmapRevision.create({
        data: {
          userId,
          roadmapId: record.id,
          version: parsed.version,
          payload: jsonValue(parsed),
        },
      })
    }
    return parsed
  }

  async getTopicStatuses(authUserId: string) {
    const userId = await this.userId(authUserId)
    const records = await this.prisma.coachTopicStatus.findMany({
      where: { userId },
    })
    return Object.fromEntries(
      records.map((record) => [
        record.topic,
        record.status as CoachManualTopicStatus,
      ]),
    )
  }

  async setTopicStatus(
    authUserId: string,
    topic: string,
    status: CoachManualTopicStatus,
  ) {
    const userId = await this.userId(authUserId)
    await this.prisma.coachTopicStatus.upsert({
      where: { userId_topic: { userId, topic } },
      create: { userId, topic, status },
      update: { status },
    })
    await this.prisma.coachTopicStatusEvent.create({
      data: { userId, topic, status, source: 'manual' },
    })
  }

  async clearTopicStatus(authUserId: string, topic: string) {
    const userId = await this.userId(authUserId)
    await this.prisma.coachTopicStatus.deleteMany({
      where: { userId, topic },
    })
    await this.prisma.coachTopicStatusEvent.create({
      data: { userId, topic, status: null, source: 'manual' },
    })
  }

  async recordTopicNote(
    authUserId: string,
    topic: string,
    note: string,
    status: CoachManualTopicStatus | null,
    source: string,
  ) {
    const userId = await this.userId(authUserId)
    const event = await this.prisma.coachTopicStatusEvent.create({
      data: { userId, topic, status, source, note },
    })
    return { id: event.id, occurredAt: event.createdAt }
  }

  async getTopicNoteEvent(authUserId: string, eventId: string) {
    const userId = await this.userId(authUserId)
    const event = await this.prisma.coachTopicStatusEvent.findFirst({
      where: { id: eventId, userId, note: { not: null } },
    })
    if (event === null || event.note === null) return null
    return { note: event.note, occurredAt: event.createdAt }
  }

  async saveProposal(
    authUserId: string,
    conversationId: string,
    proposal: CoachActionProposal,
  ) {
    const userId = await this.userId(authUserId)
    const parsed = CoachActionProposalSchema.parse(proposal)
    const conversation = await this.prisma.coachConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    })
    if (conversation === null) {
      throw new Error('The coaching conversation is not owned by this learner.')
    }
    const existing = await this.prisma.coachActionProposal.findUnique({
      where: { id: parsed.id },
      select: { userId: true, status: true },
    })
    if (existing !== null && existing.userId !== userId) {
      throw new Error('The coaching proposal is not owned by this learner.')
    }
    if (existing !== null && existing.status !== 'proposed') return
    await this.prisma.coachActionProposal.upsert({
      where: { id: parsed.id },
      create: {
        id: parsed.id,
        userId,
        conversationId,
        status: parsed.status,
        payload: jsonValue(parsed),
      },
      update: { status: parsed.status, payload: jsonValue(parsed) },
    })
  }

  async getProposal(authUserId: string, proposalId: string) {
    const userId = await this.userId(authUserId)
    const record = await this.prisma.coachActionProposal.findFirst({
      where: { id: proposalId, userId },
    })
    if (record === null) return null
    return {
      conversationId: record.conversationId,
      proposal: CoachActionProposalSchema.parse(record.payload),
    }
  }

  async updateProposal(
    authUserId: string,
    proposalId: string,
    status: CoachActionProposal['status'],
  ) {
    const userId = await this.userId(authUserId)
    const record = await this.prisma.coachActionProposal.findFirst({
      where: { id: proposalId, userId },
    })
    if (record === null) return null
    const payload = CoachActionProposalSchema.parse(record.payload)
    const proposal = CoachActionProposalSchema.parse({ ...payload, status })
    await this.prisma.coachActionProposal.update({
      where: { id: proposalId },
      data: { status, payload: jsonValue(proposal) },
    })
    const messages = await this.prisma.coachMessage.findMany({
      where: { conversationId: record.conversationId },
      select: { id: true, proposals: true },
    })
    await Promise.all(
      messages.map((message) => {
        const proposals = z
          .array(CoachActionProposalSchema)
          .safeParse(message.proposals)
        if (!proposals.success) return Promise.resolve()
        const next = proposals.data.map((item) =>
          item.id === proposalId ? proposal : item,
        )
        if (JSON.stringify(next) === JSON.stringify(proposals.data))
          return Promise.resolve()
        return this.prisma.coachMessage.update({
          where: { id: message.id },
          data: { proposals: jsonValue(next) },
        })
      }),
    )
    return proposal
  }
}

export const CoachRoadmapLaneOrder: readonly CoachRoadmapLane[] = [
  'current_focus',
  'needs_more_practice',
  'recommended_next',
  'practiced_comfortable',
  'revisit_later',
  'skipped',
]
