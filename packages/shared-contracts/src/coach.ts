import { z } from 'zod'

import {
  ExternalProblemSummarySchema,
  ProviderKeySchema,
} from './problem-catalog.js'
import { ProblemReferenceSchema } from './progress.js'

const identifierSchema = z.uuid()
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const nonEmptyStringSchema = z.string().trim().min(1)
const optionalStringSchema = nonEmptyStringSchema.max(1_000).optional()
const dateSchema = z.iso.datetime()

export const CoachManualTopicStatusSchema = z.enum([
  'working_on',
  'practiced',
  'completed',
  'revisit',
  'skip_for_now',
])
export type CoachManualTopicStatus = z.infer<
  typeof CoachManualTopicStatusSchema
>

export const CoachAssessmentLevelSchema = z.enum([
  'insufficient_evidence',
  'needs_practice',
  'developing',
  'comfortable',
  'revisit',
])
export type CoachAssessmentLevel = z.infer<typeof CoachAssessmentLevelSchema>

export const CoachRoadmapLaneSchema = z.enum([
  'current_focus',
  'needs_more_practice',
  'recommended_next',
  'practiced_comfortable',
  'revisit_later',
  'skipped',
])
export type CoachRoadmapLane = z.infer<typeof CoachRoadmapLaneSchema>

export const CoachEvidenceSummarySchema = z
  .object({
    uniqueProblems: z.number().int().nonnegative(),
    solvedProblems: z.number().int().nonnegative(),
    attemptedProblems: z.number().int().nonnegative(),
    acceptedSubmissions: z.number().int().nonnegative(),
    totalSubmissions: z.number().int().nonnegative(),
    contestSignals: z.number().int().nonnegative(),
    ratingSignals: z.number().int().nonnegative().optional(),
    reflectionSignals: z.number().int().nonnegative().optional(),
    timerMinutes: z.number().int().nonnegative().optional(),
    recentDays: z.number().int().nonnegative(),
    completeness: z.enum(['complete', 'partial', 'unknown']),
    stale: z.boolean(),
    lastEvidenceAt: dateSchema.optional(),
  })
  .strict()
export type CoachEvidenceSummary = z.infer<typeof CoachEvidenceSummarySchema>

export const CoachProblemSuggestionStatusSchema = z.enum([
  'suggested',
  'opened',
  'dismissed',
  'solved',
])
export type CoachProblemSuggestionStatus = z.infer<
  typeof CoachProblemSuggestionStatusSchema
>

export const CoachProblemSuggestionSchema = z
  .object({
    id: identifierSchema,
    problem: ExternalProblemSummarySchema,
    reason: nonEmptyStringSchema.max(240),
    band: z.enum(['foundation', 'target', 'stretch']),
    status: CoachProblemSuggestionStatusSchema,
    createdAt: dateSchema,
  })
  .strict()
export type CoachProblemSuggestion = z.infer<
  typeof CoachProblemSuggestionSchema
>

export const ImprovementTopicSchema = z
  .object({
    topic: slugSchema,
    name: nonEmptyStringSchema.max(128),
    lane: CoachRoadmapLaneSchema,
    manualStatus: CoachManualTopicStatusSchema.optional(),
    assessment: CoachAssessmentLevelSchema,
    score: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reason: nonEmptyStringSchema.max(500),
    evidence: CoachEvidenceSummarySchema,
    prerequisites: z.array(slugSchema).max(16),
    suggestions: z.array(CoachProblemSuggestionSchema).max(5),
    updatedAt: dateSchema,
  })
  .strict()
export type ImprovementTopic = z.infer<typeof ImprovementTopicSchema>

export const ImprovementRoadmapSchema = z
  .object({
    id: identifierSchema,
    version: z.number().int().positive(),
    assessmentVersion: z.literal('topic-assessment-v1'),
    topics: z.array(ImprovementTopicSchema),
    dataCompleteness: z.enum(['complete', 'partial', 'unknown']),
    staleProviders: z.array(ProviderKeySchema),
    generatedAt: dateSchema,
  })
  .strict()
export type ImprovementRoadmap = z.infer<typeof ImprovementRoadmapSchema>

export const ImprovementRoadmapResponseSchema = z
  .object({ data: ImprovementRoadmapSchema })
  .strict()
export type ImprovementRoadmapResponse = z.infer<
  typeof ImprovementRoadmapResponseSchema
>

export const CoachConversationSchema = z
  .object({
    id: identifierSchema,
    title: nonEmptyStringSchema.max(120),
    summary: optionalStringSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    messageCount: z.number().int().nonnegative(),
  })
  .strict()
export type CoachConversation = z.infer<typeof CoachConversationSchema>

export const CoachConversationsResponseSchema = z
  .object({ data: z.array(CoachConversationSchema) })
  .strict()
export type CoachConversationsResponse = z.infer<
  typeof CoachConversationsResponseSchema
>

export const CoachConversationEnvelopeSchema = z
  .object({ data: CoachConversationSchema })
  .strict()
export type CoachConversationEnvelope = z.infer<
  typeof CoachConversationEnvelopeSchema
>

export const CoachEvidenceReferenceSchema = z
  .object({
    source: z.enum([
      'profile',
      'analytics',
      'activity',
      'progress',
      'roadmap',
      'memory',
      'recommendations',
      'contest',
    ]),
    label: nonEmptyStringSchema.max(160),
    detail: nonEmptyStringSchema.max(500),
    completeness: z.enum(['complete', 'partial', 'unknown']),
    stale: z.boolean(),
  })
  .strict()
export type CoachEvidenceReference = z.infer<
  typeof CoachEvidenceReferenceSchema
>

const isPrivateCoachHostname = (value: string) => {
  const hostname = value
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  ) {
    return true
  }
  if (/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(hostname)) return true
  const octets = hostname.split('.')
  if (
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255)
  ) {
    const [first, second] = octets.map(Number)
    return (
      first !== undefined &&
      second !== undefined &&
      (first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168))
    )
  }
  return (
    hostname === '::' ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('fe8') ||
    hostname.startsWith('fe9') ||
    hostname.startsWith('fea') ||
    hostname.startsWith('feb') ||
    hostname.startsWith('::ffff:127.') ||
    hostname.startsWith('::ffff:10.') ||
    hostname.startsWith('::ffff:192.168.')
  )
}

export const isSafeCoachPublicUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      !isPrivateCoachHostname(parsed.hostname)
    )
  } catch {
    return false
  }
}

const coachHttpsUrlSchema = z.string().url().refine(isSafeCoachPublicUrl, {
  message: 'Only public HTTPS URLs are allowed.',
})

export const CoachCitationSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    source: z.enum(['learner', 'knowledge', 'provider', 'web']),
    title: nonEmptyStringSchema.max(160),
    detail: nonEmptyStringSchema.max(360).optional(),
    url: coachHttpsUrlSchema.optional(),
    publisher: nonEmptyStringSchema.max(100).optional(),
    retrievedAt: dateSchema,
    stale: z.boolean(),
  })
  .strict()
  .superRefine((citation, context) => {
    if (citation.source === 'web' && citation.url === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Web citations must include a public source URL.',
        path: ['url'],
      })
    }
  })
export type CoachCitation = z.infer<typeof CoachCitationSchema>

const richValueSchema = z.union([
  z.string().trim().min(1).max(160),
  z.number().finite(),
])

export const CoachMetricBlockSchema = z
  .object({
    type: z.literal('metric_grid'),
    title: nonEmptyStringSchema.max(160),
    metrics: z
      .array(
        z
          .object({
            label: nonEmptyStringSchema.max(80),
            value: richValueSchema,
            detail: nonEmptyStringSchema.max(180).optional(),
            citationIds: z.array(z.string().trim().min(1).max(80)).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
export type CoachMetricBlock = z.infer<typeof CoachMetricBlockSchema>

const chartPointSchema = z
  .object({
    label: nonEmptyStringSchema.max(80),
    values: z.record(z.string().trim().min(1).max(40), z.number().finite()),
  })
  .strict()

export const CoachChartBlockSchema = z
  .object({
    type: z.literal('chart'),
    datasetId: slugSchema,
    chartType: z.enum(['line', 'bar', 'stacked_bar']),
    title: nonEmptyStringSchema.max(160),
    summary: nonEmptyStringSchema.max(360),
    series: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(40),
            label: nonEmptyStringSchema.max(80),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    points: z.array(chartPointSchema).min(1).max(90),
    citationIds: z.array(z.string().trim().min(1).max(80)).max(8),
  })
  .strict()
  .superRefine((block, context) => {
    const keys = block.series.map((series) => series.key)
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Chart series keys must be unique.',
        path: ['series'],
      })
    }
    block.points.forEach((point, pointIndex) => {
      Object.keys(point.values).forEach((key) => {
        if (!keys.includes(key)) {
          context.addIssue({
            code: 'custom',
            message: 'Chart values must use declared series keys.',
            path: ['points', pointIndex, 'values', key],
          })
        }
      })
    })
  })
export type CoachChartBlock = z.infer<typeof CoachChartBlockSchema>

export const CoachTimelineBlockSchema = z
  .object({
    type: z.literal('timeline'),
    title: nonEmptyStringSchema.max(160),
    entries: z
      .array(
        z
          .object({
            date: z.string().trim().min(1).max(40),
            label: nonEmptyStringSchema.max(120),
            value: richValueSchema.optional(),
            detail: nonEmptyStringSchema.max(240).optional(),
            citationIds: z.array(z.string().trim().min(1).max(80)).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
export type CoachTimelineBlock = z.infer<typeof CoachTimelineBlockSchema>

export const CoachComparisonTableBlockSchema = z
  .object({
    type: z.literal('comparison_table'),
    title: nonEmptyStringSchema.max(160),
    columns: z.array(nonEmptyStringSchema.max(80)).min(2).max(6),
    rows: z.array(z.array(richValueSchema).min(2).max(6)).min(1).max(20),
    citationIds: z.array(z.string().trim().min(1).max(80)).max(8),
  })
  .strict()
export type CoachComparisonTableBlock = z.infer<
  typeof CoachComparisonTableBlockSchema
>

export const CoachProblemListBlockSchema = z
  .object({
    type: z.literal('problem_list'),
    title: nonEmptyStringSchema.max(160),
    reason: nonEmptyStringSchema.max(360),
    problems: z.array(ExternalProblemSummarySchema).min(1).max(5),
  })
  .strict()
export type CoachProblemListBlock = z.infer<typeof CoachProblemListBlockSchema>

export const CoachWebProblemListBlockSchema = z
  .object({
    type: z.literal('web_problem_list'),
    title: nonEmptyStringSchema.max(160),
    reason: nonEmptyStringSchema.max(360),
    problems: z
      .array(
        z
          .object({
            citationId: z
              .string()
              .trim()
              .regex(/^web-[1-9][0-9]{0,2}$/),
            title: nonEmptyStringSchema.max(160),
            url: coachHttpsUrlSchema,
            publisher: nonEmptyStringSchema.max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
export type CoachWebProblemListBlock = z.infer<
  typeof CoachWebProblemListBlockSchema
>

export const CoachRichBlockSchema = z.discriminatedUnion('type', [
  CoachMetricBlockSchema,
  CoachChartBlockSchema,
  CoachTimelineBlockSchema,
  CoachComparisonTableBlockSchema,
  CoachProblemListBlockSchema,
  CoachWebProblemListBlockSchema,
])
export type CoachRichBlock = z.infer<typeof CoachRichBlockSchema>

export const CoachRichContentSchema = z
  .object({
    version: z.literal('coach-rich-v2'),
    blocks: z.array(CoachRichBlockSchema).max(8),
    citations: z.array(CoachCitationSchema).max(8),
    suggestedQuestions: z.array(nonEmptyStringSchema.max(240)).max(4),
    generatedAt: dateSchema,
    dataAsOf: dateSchema,
    completeness: z.enum(['complete', 'partial', 'unknown']),
    stale: z.boolean(),
  })
  .strict()
  .superRefine((content, context) => {
    const citationIds = content.citations.map((citation) => citation.id)
    if (new Set(citationIds).size !== citationIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Rich-content citation IDs must be unique.',
        path: ['citations'],
      })
    }
    const knownCitations = new Set(citationIds)
    content.blocks.forEach((block, blockIndex) => {
      const blockCitationIds =
        'citationIds' in block ? block.citationIds : ([] as string[])
      blockCitationIds.forEach((citationId, citationIndex) => {
        if (!knownCitations.has(citationId)) {
          context.addIssue({
            code: 'custom',
            message: 'Rich-content blocks must reference known citations.',
            path: ['blocks', blockIndex, 'citationIds', citationIndex],
          })
        }
      })
      if (block.type === 'comparison_table') {
        block.rows.forEach((row, rowIndex) => {
          if (row.length !== block.columns.length) {
            context.addIssue({
              code: 'custom',
              message: 'Comparison rows must match the column count.',
              path: ['blocks', blockIndex, 'rows', rowIndex],
            })
          }
        })
      }
      if (block.type === 'web_problem_list') {
        block.problems.forEach((problem, problemIndex) => {
          if (!knownCitations.has(problem.citationId)) {
            context.addIssue({
              code: 'custom',
              message: 'Web problems must reference a known web citation.',
              path: [
                'blocks',
                blockIndex,
                'problems',
                problemIndex,
                'citationId',
              ],
            })
          }
        })
      }
    })
  })
export type CoachRichContent = z.infer<typeof CoachRichContentSchema>

export const CoachActionTypeSchema = z.enum([
  'set_topic_status',
  'save_memory',
  'set_problem_status',
  'bookmark_problem',
  'refresh_recommendations',
  'update_profile',
  'request_next_hint',
  'mark_problem_solved',
])
export type CoachActionType = z.infer<typeof CoachActionTypeSchema>

export const CoachActionProposalStatusSchema = z.enum([
  'proposed',
  'confirmed',
  'rejected',
  'expired',
])
export type CoachActionProposalStatus = z.infer<
  typeof CoachActionProposalStatusSchema
>

export const CoachActionProposalSchema = z
  .object({
    id: identifierSchema,
    actionType: CoachActionTypeSchema,
    status: CoachActionProposalStatusSchema,
    label: nonEmptyStringSchema.max(160),
    reason: nonEmptyStringSchema.max(500),
    topic: slugSchema.optional(),
    topicStatus: CoachManualTopicStatusSchema.optional(),
    problem: ProblemReferenceSchema.optional(),
    learnerStatus: z.enum(['unsolved', 'attempted', 'solved']).optional(),
    memoryText: nonEmptyStringSchema.max(500).optional(),
    memoryCategory: z
      .enum([
        'preference',
        'difficulty_calibration',
        'topic_weakness',
        'scheduling_preference',
        'recommendation_feedback_pattern',
        'learning_goal',
        'topic_strength',
        'coding_style',
        'problem_solving_approach',
        'learning_pace',
        'time_availability',
        'mistake_pattern',
        'contest_performance',
        'explanation_preference',
        'communication_preference',
        'user_instruction',
        'conversation_summary',
        'learning_milestone',
        'bloom_level',
        'spaced_repetition_state',
      ])
      .optional(),
    hintLevel: z.number().int().min(1).max(10).optional(),
    hintLadderId: identifierSchema.optional(),
    problemSolvedAfterHintLevel: z.number().int().min(1).max(10).optional(),
  })
  .strict()
  .superRefine((proposal, context) => {
    if (
      proposal.actionType === 'set_topic_status' &&
      (proposal.topic === undefined || proposal.topicStatus === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A topic-status proposal needs a topic and status.',
        path: ['topic'],
      })
    }
    if (
      proposal.actionType === 'set_problem_status' &&
      (proposal.problem === undefined || proposal.learnerStatus === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A problem-status proposal needs a problem and learner status.',
        path: ['problem'],
      })
    }
    if (
      proposal.actionType === 'bookmark_problem' &&
      proposal.problem === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A bookmark proposal needs a problem.',
        path: ['problem'],
      })
    }
    if (
      (proposal.actionType === 'request_next_hint' ||
        proposal.actionType === 'mark_problem_solved') &&
      proposal.problem === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A hint action needs a problem reference.',
        path: ['problem'],
      })
    }
    if (
      proposal.actionType === 'save_memory' &&
      (proposal.memoryText === undefined ||
        proposal.memoryCategory === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A memory proposal needs text and a category.',
        path: ['memoryText'],
      })
    }
  })
export type CoachActionProposal = z.infer<typeof CoachActionProposalSchema>

export const CoachMessageRoleSchema = z.enum(['user', 'assistant'])
export type CoachMessageRole = z.infer<typeof CoachMessageRoleSchema>

export const CoachMessageSchema = z
  .object({
    id: identifierSchema,
    role: CoachMessageRoleSchema,
    content: z.string().trim().min(1).max(12_000),
    transientContextOmitted: z.boolean().optional(),
    evidence: z.array(CoachEvidenceReferenceSchema).max(12),
    proposals: z.array(CoachActionProposalSchema).max(8),
    fallback: z.boolean().optional(),
    richContent: CoachRichContentSchema.optional(),
    createdAt: dateSchema,
  })
  .strict()
export type CoachMessage = z.infer<typeof CoachMessageSchema>

export const CoachConversationResponseSchema = z
  .object({
    data: CoachConversationSchema,
    messages: z.array(CoachMessageSchema),
  })
  .strict()
export type CoachConversationResponse = z.infer<
  typeof CoachConversationResponseSchema
>

export const CoachResponseSchema = z
  .object({
    message: CoachMessageSchema,
    roadmap: ImprovementRoadmapSchema,
  })
  .strict()
export type CoachResponse = z.infer<typeof CoachResponseSchema>

export const CoachPreferencesSchema = z
  .object({
    weeklyEnabled: z.boolean(),
    weeklyDay: z.number().int().min(0).max(6),
    weeklyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    eventEnabled: z.boolean(),
    timezone: nonEmptyStringSchema.max(64),
    updatedAt: dateSchema,
  })
  .strict()
export type CoachPreferences = z.infer<typeof CoachPreferencesSchema>

export const CoachPreferencesResponseSchema = z
  .object({ data: CoachPreferencesSchema })
  .strict()
export type CoachPreferencesResponse = z.infer<
  typeof CoachPreferencesResponseSchema
>

export const SaveCoachPreferencesRequestSchema = z
  .object({
    weeklyEnabled: z.boolean(),
    weeklyDay: z.number().int().min(0).max(6),
    weeklyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    eventEnabled: z.boolean(),
    timezone: nonEmptyStringSchema.max(64),
  })
  .strict()
export type SaveCoachPreferencesRequest = z.infer<
  typeof SaveCoachPreferencesRequestSchema
>

export const CoachCheckInTypeSchema = z.enum([
  'weekly_review',
  'contest_result',
  'repeated_failures',
  'focus_transition',
  'focus_progress',
  'inactivity',
  'spaced_repetition_due',
  'goal_progress_milestone',
  'goal_off_track',
  'streak_risk',
  'difficulty_plateau',
  'topic_mastery_achieved',
  'contest_prep_reminder',
  'morning_warm_up',
  'insight_of_the_day',
])
export type CoachCheckInType = z.infer<typeof CoachCheckInTypeSchema>

export const CoachCheckInSchema = z
  .object({
    id: identifierSchema,
    eventKey: nonEmptyStringSchema.max(160).optional(),
    type: CoachCheckInTypeSchema,
    title: nonEmptyStringSchema.max(160),
    content: nonEmptyStringSchema.max(4_000),
    evidence: z.array(CoachEvidenceReferenceSchema).max(12),
    read: z.boolean(),
    dismissed: z.boolean().default(false),
    fallback: z.boolean().optional(),
    createdAt: dateSchema,
  })
  .strict()
export type CoachCheckIn = z.infer<typeof CoachCheckInSchema>

export const CoachCheckInResponseSchema = z
  .object({ data: CoachCheckInSchema })
  .strict()
export type CoachCheckInResponse = z.infer<typeof CoachCheckInResponseSchema>

export const CoachActionProposalResponseSchema = z
  .object({ data: CoachActionProposalSchema })
  .strict()
export type CoachActionProposalResponse = z.infer<
  typeof CoachActionProposalResponseSchema
>

export const CoachCheckInsResponseSchema = z
  .object({
    data: z.array(CoachCheckInSchema),
    meta: z.object({ unread: z.number().int().nonnegative() }).strict(),
  })
  .strict()
export type CoachCheckInsResponse = z.infer<typeof CoachCheckInsResponseSchema>

export const CreateCoachConversationRequestSchema = z
  .object({ title: z.string().trim().min(1).max(120).optional() })
  .strict()
export type CreateCoachConversationRequest = z.infer<
  typeof CreateCoachConversationRequestSchema
>

export const SendCoachMessageRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(8_000),
    transientContext: z.string().trim().max(12_000).optional(),
    transientMedia: z
      .object({
        mimeType: z.enum([
          'audio/webm',
          'audio/mp4',
          'audio/mpeg',
          'audio/wav',
          'video/mp4',
          'video/webm',
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
          'text/plain',
          'text/markdown',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]),
        data: z
          .string()
          .min(4)
          .max(11_184_812)
          .refine(
            (data) =>
              data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(data),
            { message: 'Media must be valid base64.' },
          ),
      })
      .strict()
      .refine(
        (media) =>
          (media.data.length / 4) * 3 -
            (media.data.endsWith('==')
              ? 2
              : media.data.endsWith('=')
                ? 1
                : 0) <=
          8 * 1024 * 1024,
        { message: 'Media must be 8 MB or smaller.' },
      )
      .optional(),
  })
  .strict()
export type SendCoachMessageRequest = z.infer<
  typeof SendCoachMessageRequestSchema
>

export const SetCoachTopicStatusRequestSchema = z
  .object({ status: CoachManualTopicStatusSchema.nullable() })
  .strict()
export type SetCoachTopicStatusRequest = z.infer<
  typeof SetCoachTopicStatusRequestSchema
>

export const ConfirmCoachActionRequestSchema = z
  .object({ confirmation: z.literal('CONFIRM') })
  .strict()
export type ConfirmCoachActionRequest = z.infer<
  typeof ConfirmCoachActionRequestSchema
>

export const CoachCheckInActionRequestSchema = z
  .object({
    read: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.read === undefined && value.dismissed === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A check-in update must change read or dismissed state.',
        path: ['read'],
      })
    }
  })
export type CoachCheckInActionRequest = z.infer<
  typeof CoachCheckInActionRequestSchema
>
