import { z } from 'zod'

const optionalNotesSchema = z.string().trim().min(1).max(1_000).optional()
const positiveIntegerSchema = z.number().int().positive()

const hasUniqueValues = (values: readonly string[]) =>
  new Set(values).size === values.length

export const ExperienceLevelSchema = z.enum([
  'complete_beginner',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
])

export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>

export const DifficultyComfortSchema = z.enum([
  'new_to_rated_problems',
  'introductory',
  'medium',
  'challenging',
  'let_algomemtor_decide',
])

export type DifficultyComfort = z.infer<typeof DifficultyComfortSchema>

export const LearnerGoalSchema = z.enum([
  'start_competitive_programming',
  'improve_problem_solving',
  'improve_contest_rating',
  'prepare_for_contests',
  'prepare_for_coding_interviews',
  'prepare_for_icpc',
  'learn_advanced_algorithms',
  'build_consistent_habit',
])

export type LearnerGoal = z.infer<typeof LearnerGoalSchema>

export const OnboardingTopicSchema = z.enum([
  'implementation',
  'arrays',
  'hashing',
  'sliding-window',
  'linked-lists',
  'heaps-and-priority-queues',
  'tries',
  'math',
  'number-theory',
  'sorting',
  'binary-search',
  'two-pointers',
  'prefix-sums',
  'greedy',
  'strings',
  'recursion-and-backtracking',
  'stacks-and-queues',
  'trees',
  'graphs',
  'bfs-and-dfs',
  'dynamic-programming',
  'bit-manipulation',
  'segment-trees',
  'fenwick-trees',
  'disjoint-set-union',
  'shortest-paths',
  'minimum-spanning-trees',
  'topological-sort',
  'advanced-dynamic-programming',
  'geometry',
  'combinatorics',
])

export type OnboardingTopic = z.infer<typeof OnboardingTopicSchema>

const SelectedTopicPreferenceSchema = z
  .object({
    mode: z.literal('selected'),
    topics: z
      .array(OnboardingTopicSchema)
      .max(5)
      .refine(hasUniqueValues, 'Topics must not contain duplicates.'),
  })
  .strict()
  .superRefine(({ topics }, context) => {
    if (topics.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a topic or let AlgoMemtor suggest a starting path.',
        path: ['topics'],
      })
    }
  })

const SuggestedTopicPreferenceSchema = z
  .object({
    mode: z.literal('let_algomemtor_suggest'),
  })
  .strict()

export const TopicPreferenceSchema = z.union([
  SelectedTopicPreferenceSchema,
  SuggestedTopicPreferenceSchema,
])

export type TopicPreference = z.infer<typeof TopicPreferenceSchema>

// These values describe learner preferences, not implemented provider adapters.
// ProviderKeySchema remains the source of truth for integrations AlgoMemtor can use.
export const PracticePlatformSchema = z.enum([
  'codeforces',
  'codechef',
  'atcoder',
  'leetcode',
  'cses',
  'hackerrank',
])

export type PracticePlatform = z.infer<typeof PracticePlatformSchema>

export const RatedPracticePlatformSchema = z.enum([
  'codeforces',
  'codechef',
  'atcoder',
  'leetcode',
])

export type RatedPracticePlatform = z.infer<typeof RatedPracticePlatformSchema>

export const StandingMetricSchema = z.enum(['rating', 'ranking'])

export type StandingMetric = z.infer<typeof StandingMetricSchema>

export const PlatformStandingSchema = z
  .object({
    platform: RatedPracticePlatformSchema,
    metric: StandingMetricSchema,
    value: positiveIntegerSchema,
  })
  .strict()
  .superRefine(({ metric, platform }, context) => {
    if (metric === 'ranking' && platform !== 'leetcode') {
      context.addIssue({
        code: 'custom',
        message: 'Ranking is supported only for the LeetCode onboarding field.',
        path: ['metric'],
      })
    }
  })

export type PlatformStanding = z.infer<typeof PlatformStandingSchema>

export const PlatformPreferencesSchema = z
  .object({
    platforms: z
      .array(PracticePlatformSchema)
      .max(PracticePlatformSchema.options.length)
      .refine(hasUniqueValues, 'Platforms must not contain duplicates.'),
    standings: z
      .array(PlatformStandingSchema)
      .max(RatedPracticePlatformSchema.options.length)
      .refine(
        (standings) =>
          hasUniqueValues(standings.map(({ platform }) => platform)),
        'Each platform can have at most one current rating or ranking.',
      )
      .default([]),
  })
  .strict()
  .superRefine(({ platforms, standings }, context) => {
    standings.forEach(({ platform }, index) => {
      if (!platforms.includes(platform)) {
        context.addIssue({
          code: 'custom',
          message: 'A rating or ranking requires the platform to be selected.',
          path: ['standings', index, 'platform'],
        })
      }
    })
  })

export type PlatformPreferences = z.infer<typeof PlatformPreferencesSchema>

export const PreferredTopicsSchema = z
  .array(OnboardingTopicSchema)
  .max(5)
  .refine(hasUniqueValues, 'Preferred topics must not contain duplicates.')
  .default([])

export type PreferredTopics = z.infer<typeof PreferredTopicsSchema>

export const RatingComfortRangeSchema = z
  .object({
    platform: RatedPracticePlatformSchema,
    min: positiveIntegerSchema,
    max: positiveIntegerSchema,
  })
  .strict()
  .refine(({ max, min }) => min <= max, {
    message: 'Minimum rating cannot be greater than maximum rating.',
    path: ['max'],
  })

export type RatingComfortRange = z.infer<typeof RatingComfortRangeSchema>

export const LearningPreferenceSchema = z.enum([
  'solve_problems_directly',
  'learn_concept_then_solve',
  'watch_tutorial_then_solve',
  'read_editorial_then_solve_similar',
  'practice_through_contests',
  'practice_one_topic_at_a_time',
  'practice_weak_areas',
  'mixed_approach',
])

export type LearningPreference = z.infer<typeof LearningPreferenceSchema>

const learnerProfileAnswersShape = {
  experience: ExperienceLevelSchema,
  difficultyComfort: DifficultyComfortSchema,
  goal: LearnerGoalSchema,
  topicPreference: TopicPreferenceSchema,
  preferredTopics: PreferredTopicsSchema,
  platformPreferences: PlatformPreferencesSchema,
  ratingComfortRange: RatingComfortRangeSchema.optional(),
  learningPreferences: z
    .array(LearningPreferenceSchema)
    .min(1)
    .max(LearningPreferenceSchema.options.length)
    .refine(
      hasUniqueValues,
      'Learning preferences must not contain duplicates.',
    ),
  additionalConsiderations: optionalNotesSchema,
  recommendationPreference: z.string().trim().min(1).max(500).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
}

export const LearnerProfileAnswersSchema = z
  .object(learnerProfileAnswersShape)
  .strict()

export type LearnerProfileAnswers = z.infer<typeof LearnerProfileAnswersSchema>

export const SaveLearnerProfileRequestSchema = LearnerProfileAnswersSchema

export type SaveLearnerProfileRequest = z.infer<
  typeof SaveLearnerProfileRequestSchema
>

export const LearnerProfileSchema = z
  .object({
    ...learnerProfileAnswersShape,
    onboardingCompleted: z.boolean(),
  })
  .strict()

export type LearnerProfile = z.infer<typeof LearnerProfileSchema>

export const LearnerProfileResponseSchema = z
  .object({
    data: LearnerProfileSchema.nullable(),
  })
  .strict()

export type LearnerProfileResponse = z.infer<
  typeof LearnerProfileResponseSchema
>
