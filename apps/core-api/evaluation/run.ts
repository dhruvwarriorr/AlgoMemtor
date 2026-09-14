import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ExternalProblemSummarySchema,
  LearnerProfileSchema,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { readAiRecommendationConfig } from '../src/config/ai-config.js'
import {
  AiRankingRequestSchema,
  AiRankingResponseSchema,
  HttpAiRecommendationClient,
  type AiRankingRequest,
  type AiRankingResponse,
} from '../src/integrations/ai/ai-recommendation-client.js'
import { createCodeforcesProblemUrl } from '../src/integrations/codeforces/codeforces-url.js'
import {
  isSafeRecommendationReason,
  repeatsRecommendationPreferenceText,
} from '../src/services/recommendation-service.js'
import {
  DETERMINISTIC_RANKING_VERSION,
  deriveRankingProfile,
  rankRecommendations,
  type NormalizedRankingProfile,
  type RankedRecommendation,
  type RecommendationHistory,
} from '../src/services/recommendation-ranking.js'

const LATENCY_BUDGET_MS = 8_000
const COST_BUDGET_USD = 0.02
const IMPROVEMENT_BUDGET = 0.05
const DATASET_FETCHED_AT = '2026-09-01T00:00:00.000Z'
const EXPECTED_SCENARIO_COUNT = 48
const SCENARIOS_PER_CATEGORY = 3

const categorySchema = z.enum([
  'cold_start',
  'topic_fit',
  'difficulty_fit',
  'revision',
  'diversity',
  'preference_conflict',
  'malicious_instructions',
  'absent_preferences',
  'longitudinal_progress',
  'conflicting_evidence',
  'consent_privacy',
  'correction',
  'deletion',
  'retrieval_relevance',
  'fallback',
  'provider_verification',
])

const evaluationTopicSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const identitySchema = z.string().regex(/^codeforces:\S+$/)

const goldLabelSchema = z
  .object({
    relevance: z.number().finite().min(0).max(1),
    difficultyFit: z.number().finite().min(0).max(1),
    preferenceFit: z.number().finite().min(0).max(1),
    diversityGroup: z.string().trim().min(1).max(64),
  })
  .strict()

const datasetCandidateSchema = z
  .object({
    externalId: z
      .string()
      .trim()
      .min(2)
      .max(128)
      .regex(/^[1-9]\d*[A-Z][A-Z0-9]*$/),
    title: z.string().trim().min(1).max(512),
    rating: z.number().finite().nonnegative().optional(),
    normalizedDifficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    topics: z.array(evaluationTopicSchema).min(1).max(25),
    solvedCount: z.number().int().nonnegative().optional(),
    gold: goldLabelSchema,
  })
  .strict()

const historySchema = z
  .object({
    attemptedProblemIds: z.array(identitySchema).default([]),
    attemptedTopics: z.array(evaluationTopicSchema).default([]),
    solvedProblemIds: z.array(identitySchema).default([]),
    dismissedProblemIds: z.array(identitySchema).default([]),
    recentRecommendationIds: z.array(identitySchema).default([]),
  })
  .strict()

const scenarioSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    category: categorySchema,
    description: z.string().trim().min(1).max(500),
    profile: LearnerProfileSchema.nullable(),
    history: historySchema.default({
      attemptedProblemIds: [],
      attemptedTopics: [],
      solvedProblemIds: [],
      dismissedProblemIds: [],
      recentRecommendationIds: [],
    }),
    candidates: z.array(datasetCandidateSchema).min(3).max(40),
    topK: z.number().int().positive().max(10).default(3),
    targetGroups: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
    weight: z.number().finite().positive().default(1),
    preferNewItems: z.boolean().default(false),
  })
  .strict()

const metricWeightsSchema = z
  .object({
    relevance: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
    diversity: z.number().finite().nonnegative(),
    preference: z.number().finite().nonnegative(),
  })
  .strict()
  .refine(
    ({ difficulty, diversity, preference, relevance }) =>
      Math.abs(difficulty + diversity + preference + relevance - 1) < 1e-9,
    'Metric weights must sum to one.',
  )

const datasetSchema = z
  .object({
    version: z.literal(1),
    learnerId: z.uuid(),
    topK: z.number().int().positive().max(10),
    metricWeights: metricWeightsSchema,
    scenarios: z.array(scenarioSchema),
  })
  .strict()

type EvaluationDataset = z.infer<typeof datasetSchema>
type EvaluationScenario = z.infer<typeof scenarioSchema>
type DatasetCandidate = z.infer<typeof datasetCandidateSchema>
type GoldLabel = z.infer<typeof goldLabelSchema>
type MetricWeights = z.infer<typeof metricWeightsSchema>

type MetricSet = {
  relevance: number
  difficulty: number
  diversity: number
  preference: number
  composite: number
}

type AggregateMetrics = {
  metrics: MetricSet
  coverage: number
}

type ScenarioResult = {
  id: string
  category: EvaluationScenario['category']
  weight: number
  baseline: MetricSet
  ai?: MetricSet
  safe: boolean
  model?: string
  observedLatencyMs?: number
  reportedLatencyMs?: number
  costUsd?: number
  error?: string
}

type EvaluationConfig = {
  baseUrl: string
  internalServiceToken: string
  timeoutMs: number
}

const identity = (externalId: string) => `codeforces:${externalId}`

const round = (value: number, digits = 4) => Number(value.toFixed(digits))

const percentile95 = (values: readonly number[]) => {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)

  return sorted[Math.max(0, index)] ?? null
}

const validateDatasetInvariants = (dataset: EvaluationDataset) => {
  if (dataset.scenarios.length !== EXPECTED_SCENARIO_COUNT) {
    throw new Error(
      `The evaluation dataset must contain ${EXPECTED_SCENARIO_COUNT} scenarios; found ${dataset.scenarios.length}.`,
    )
  }

  const categoryCounts = new Map<string, number>()
  const scenarioIds = new Set<string>()

  for (const scenario of dataset.scenarios) {
    if (scenarioIds.has(scenario.id)) {
      throw new Error(`Duplicate evaluation scenario ID: ${scenario.id}.`)
    }
    scenarioIds.add(scenario.id)
    categoryCounts.set(
      scenario.category,
      (categoryCounts.get(scenario.category) ?? 0) + 1,
    )

    const candidateIds = new Set<string>()
    const groups = new Set<string>()

    for (const candidate of scenario.candidates) {
      if (candidateIds.has(candidate.externalId)) {
        throw new Error(
          `Scenario ${scenario.id} contains duplicate candidate ${candidate.externalId}.`,
        )
      }
      candidateIds.add(candidate.externalId)
      groups.add(candidate.gold.diversityGroup)
    }

    for (const targetGroup of scenario.targetGroups) {
      if (!groups.has(targetGroup)) {
        throw new Error(
          `Scenario ${scenario.id} names an absent target group ${targetGroup}.`,
        )
      }
    }
  }

  for (const category of categorySchema.options) {
    if (categoryCounts.get(category) !== SCENARIOS_PER_CATEGORY) {
      throw new Error(
        `Category ${category} must contain ${SCENARIOS_PER_CATEGORY} scenarios; found ${categoryCounts.get(category) ?? 0}.`,
      )
    }
  }
}

export const loadEvaluationDataset = async () => {
  const datasetPath = fileURLToPath(new URL('./dataset.json', import.meta.url))
  const source = await readFile(datasetPath, 'utf8')
  const dataset = datasetSchema.parse(JSON.parse(source) as unknown)
  validateDatasetInvariants(dataset)
  return dataset
}

const normalizedDifficultyFor = (
  candidate: DatasetCandidate,
): 'easy' | 'medium' | 'hard' | undefined => {
  if (candidate.normalizedDifficulty !== undefined) {
    return candidate.normalizedDifficulty
  }

  if (candidate.rating === undefined) {
    return undefined
  }

  if (candidate.rating <= 1000) {
    return 'easy'
  }

  return candidate.rating <= 1500 ? 'medium' : 'hard'
}

const toProblem = (candidate: DatasetCandidate) => {
  const match = /^([1-9]\d*)([A-Z][A-Z0-9]*)$/.exec(candidate.externalId)
  const contestIdText = match?.[1]
  const problemIndex = match?.[2]
  if (contestIdText === undefined || problemIndex === undefined) {
    throw new Error(`Invalid Codeforces candidate ID ${candidate.externalId}.`)
  }

  const contestId = Number(contestIdText)
  const normalizedDifficulty = normalizedDifficultyFor(candidate)

  return ExternalProblemSummarySchema.parse({
    provider: 'codeforces',
    externalId: candidate.externalId,
    title: candidate.title,
    canonicalUrl: createCodeforcesProblemUrl(contestId, problemIndex),
    ...(candidate.rating === undefined
      ? {}
      : { providerDifficulty: candidate.rating }),
    ...(normalizedDifficulty === undefined ? {} : { normalizedDifficulty }),
    providerTags: candidate.topics,
    topics: candidate.topics,
    ...(candidate.solvedCount === undefined
      ? {}
      : { solvedCount: candidate.solvedCount }),
    fetchedAt: DATASET_FETCHED_AT,
  })
}

const historyFor = (scenario: EvaluationScenario): RecommendationHistory => ({
  attemptedProblemIds: new Set(scenario.history.attemptedProblemIds),
  attemptedTopics: new Set(scenario.history.attemptedTopics),
  solvedProblemIds: new Set(scenario.history.solvedProblemIds),
  dismissedProblemIds: new Set(scenario.history.dismissedProblemIds),
  recentRecommendationIds: new Set(scenario.history.recentRecommendationIds),
})

const learnerFor = (
  scenario: EvaluationScenario,
  rankingProfile: NormalizedRankingProfile,
) => {
  const profile = scenario.profile

  return {
    goal: profile?.goal ?? 'start_competitive_programming',
    experience: profile?.experience ?? 'complete_beginner',
    focusTopics: rankingProfile.focusTopics,
    preferredTopics: rankingProfile.preferredTopics,
    preferredDifficulty: rankingProfile.ratingBand,
    learningPreferences: profile?.learningPreferences ?? [
      'solve_problems_directly',
    ],
    ...(rankingProfile.recommendationPreference === undefined
      ? {}
      : { recommendationPreference: rankingProfile.recommendationPreference }),
  }
}

const aiRequestFor = (
  dataset: EvaluationDataset,
  scenario: EvaluationScenario,
  rankingProfile: NormalizedRankingProfile,
  shortlist: readonly RankedRecommendation[],
): AiRankingRequest =>
  AiRankingRequestSchema.parse({
    requestId: `eval_${scenario.id}`,
    learnerId: dataset.learnerId,
    expectedCount: Math.min(10, shortlist.length),
    learner: learnerFor(scenario, rankingProfile),
    candidates: shortlist.map(({ problem }) => ({
      provider: problem.provider,
      externalId: problem.externalId,
      title: problem.title,
      ...(typeof problem.providerDifficulty === 'number'
        ? { rating: problem.providerDifficulty }
        : {}),
      ...(problem.normalizedDifficulty === undefined
        ? {}
        : { normalizedDifficulty: problem.normalizedDifficulty }),
      topics: problem.topics,
      ...(problem.solvedCount === undefined
        ? {}
        : { solvedCount: problem.solvedCount }),
    })),
  })

const labelFor = (
  scenario: EvaluationScenario,
  externalId: string,
): GoldLabel => {
  const candidate = scenario.candidates.find(
    (item) => item.externalId === externalId,
  )

  if (candidate === undefined) {
    throw new Error(
      `Scenario ${scenario.id} has no gold label for ${externalId}.`,
    )
  }

  return candidate.gold
}

const positionWeightedMean = (
  ids: readonly string[],
  scenario: EvaluationScenario,
  read: (label: GoldLabel) => number,
) => {
  let numerator = 0
  let denominator = 0

  ids.slice(0, scenario.topK).forEach((externalId, index) => {
    const positionWeight = 1 / (index + 1)
    numerator += read(labelFor(scenario, externalId)) * positionWeight
    denominator += positionWeight
  })

  if (denominator === 0) {
    throw new Error(`Scenario ${scenario.id} has no ranked candidates.`)
  }

  return numerator / denominator
}

const diversityMetric = (
  ids: readonly string[],
  scenario: EvaluationScenario,
) => {
  const targetGroups =
    scenario.targetGroups.length > 0
      ? scenario.targetGroups
      : [
          ...new Set(
            scenario.candidates.map(
              (candidate) => candidate.gold.diversityGroup,
            ),
          ),
        ]
  const denominator = Math.min(targetGroups.length, scenario.topK)

  if (denominator === 0) {
    return 0
  }

  const representedGroups = new Set(
    ids
      .slice(0, scenario.topK)
      .map((externalId) => labelFor(scenario, externalId).diversityGroup),
  )
  const representedTargetGroups = targetGroups.filter((group) =>
    representedGroups.has(group),
  ).length

  return Math.min(1, representedTargetGroups / denominator)
}

const metricsFor = (
  ids: readonly string[],
  scenario: EvaluationScenario,
  metricWeights: MetricWeights,
): MetricSet => {
  const relevance = positionWeightedMean(
    ids,
    scenario,
    (label) => label.relevance,
  )
  const difficulty = positionWeightedMean(
    ids,
    scenario,
    (label) => label.difficultyFit,
  )
  const preference = positionWeightedMean(
    ids,
    scenario,
    (label) => label.preferenceFit,
  )
  const diversity = diversityMetric(ids, scenario)
  const composite =
    relevance * metricWeights.relevance +
    difficulty * metricWeights.difficulty +
    diversity * metricWeights.diversity +
    preference * metricWeights.preference

  return { relevance, difficulty, diversity, preference, composite }
}

const validateAiResponse = (
  payload: unknown,
  request: AiRankingRequest,
): { response?: AiRankingResponse; error?: string } => {
  const parsed = AiRankingResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: 'response_schema_invalid' }
  }

  const response = parsed.data
  const returnedIds = response.items.map((item) => identity(item.externalId))
  const allowedIds = new Set(
    request.candidates.map((candidate) => identity(candidate.externalId)),
  )

  if (response.fallback) {
    return { error: 'ai_fallback_returned' }
  }

  if (response.items.length !== request.expectedCount) {
    return { error: 'wrong_item_count' }
  }

  if (
    new Set(returnedIds).size !== returnedIds.length ||
    returnedIds.some((candidateId) => !allowedIds.has(candidateId))
  ) {
    return { error: 'allowlist_violation' }
  }

  if (
    response.items.some(
      (item) =>
        !isSafeRecommendationReason(item.reason) ||
        repeatsRecommendationPreferenceText(
          request.learner.recommendationPreference,
          item.reason,
        ) ||
        item.reason.includes(request.learnerId),
    )
  ) {
    return { error: 'unsafe_reason' }
  }

  if (JSON.stringify(request).includes('canonicalUrl')) {
    return { error: 'canonical_url_sent_to_model' }
  }

  return { response }
}

const baselineFor = (
  scenario: EvaluationScenario,
): {
  rankingProfile: NormalizedRankingProfile
  ranked: RankedRecommendation[]
} => {
  const problems = scenario.candidates.map(toProblem)
  const rankingProfile = deriveRankingProfile(scenario.profile)
  const ranked = rankRecommendations({
    candidates: problems,
    history: historyFor(scenario),
    profile: rankingProfile,
    preferNewItems: scenario.preferNewItems,
    limit: Math.min(40, problems.length),
  })

  if (ranked.length < scenario.topK) {
    throw new Error(
      `Scenario ${scenario.id} has only ${ranked.length} available baseline items.`,
    )
  }

  return { rankingProfile, ranked }
}

const runScenario = async (
  dataset: EvaluationDataset,
  scenario: EvaluationScenario,
  client: HttpAiRecommendationClient,
): Promise<ScenarioResult> => {
  const { ranked, rankingProfile } = baselineFor(scenario)
  const baseline = metricsFor(
    ranked.map(({ problem }) => problem.externalId),
    scenario,
    dataset.metricWeights,
  )
  const result: ScenarioResult = {
    id: scenario.id,
    category: scenario.category,
    weight: scenario.weight,
    baseline,
    safe: false,
  }

  try {
    const shortlist = ranked.slice(0, 40)
    const request = aiRequestFor(dataset, scenario, rankingProfile, shortlist)
    const started = performance.now()
    let response: AiRankingResponse

    try {
      response = await client.rank(request)
    } catch (error) {
      result.observedLatencyMs = round(performance.now() - started, 2)
      result.error =
        error instanceof Error ? 'ai_request_failed' : 'ai_request_failed'
      return result
    }

    result.observedLatencyMs = round(performance.now() - started, 2)
    result.reportedLatencyMs = response.latencyMs
    result.model = response.model
    if (response.estimatedCostUsd !== undefined) {
      result.costUsd = response.estimatedCostUsd
    }

    const validation = validateAiResponse(response, request)
    if (validation.response === undefined) {
      result.error = validation.error ?? 'unsafe_ai_response'
      return result
    }

    result.safe = true
    result.ai = metricsFor(
      validation.response.items.map((item) => item.externalId),
      scenario,
      dataset.metricWeights,
    )
    return result
  } catch (error) {
    result.error =
      error instanceof Error ? 'scenario_request_invalid' : 'scenario_failed'
    return result
  }
}

const aggregateMetrics = (
  results: readonly ScenarioResult[],
  select: (result: ScenarioResult) => MetricSet | undefined,
): AggregateMetrics => {
  const selected = results.flatMap((result) => {
    const metrics = select(result)
    return metrics === undefined ? [] : [{ metrics, weight: result.weight }]
  })

  if (selected.length === 0) {
    return {
      metrics: {
        relevance: 0,
        difficulty: 0,
        diversity: 0,
        preference: 0,
        composite: 0,
      },
      coverage: 0,
    }
  }

  const totalWeight = selected.reduce((sum, item) => sum + item.weight, 0)
  const metric = (read: (metrics: MetricSet) => number) =>
    selected.reduce((sum, item) => sum + read(item.metrics) * item.weight, 0) /
    totalWeight

  return {
    metrics: {
      relevance: metric((metrics) => metrics.relevance),
      difficulty: metric((metrics) => metrics.difficulty),
      diversity: metric((metrics) => metrics.diversity),
      preference: metric((metrics) => metrics.preference),
      composite: metric((metrics) => metrics.composite),
    },
    coverage: selected.length,
  }
}

const asReportMetrics = (aggregate: AggregateMetrics) => ({
  relevance: round(aggregate.metrics.relevance),
  difficulty: round(aggregate.metrics.difficulty),
  diversity: round(aggregate.metrics.diversity),
  preference: round(aggregate.metrics.preference),
  composite: round(aggregate.metrics.composite),
  coverage: aggregate.coverage,
})

const readEvaluationConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): EvaluationConfig | null => {
  if (environment.ALGOMEMTOR_EVALUATION_ENABLED !== 'true') {
    return null
  }

  const aiApiUrl = (
    environment.ALGOMEMTOR_EVALUATION_AI_API_URL ?? environment.AI_API_URL
  )?.trim()
  const internalServiceToken = (
    environment.ALGOMEMTOR_EVALUATION_INTERNAL_SERVICE_TOKEN ??
    environment.INTERNAL_SERVICE_TOKEN
  )?.trim()

  if (!aiApiUrl || !internalServiceToken) {
    throw new Error(
      'Opt-in evaluation requires ALGOMEMTOR_EVALUATION_AI_API_URL and ALGOMEMTOR_EVALUATION_INTERNAL_SERVICE_TOKEN.',
    )
  }

  const timeoutMs =
    environment.ALGOMEMTOR_EVALUATION_TIMEOUT_MS ??
    environment.AI_RANKING_TIMEOUT_MS ??
    String(LATENCY_BUDGET_MS)
  const config = readAiRecommendationConfig({
    AI_API_URL: aiApiUrl,
    INTERNAL_SERVICE_TOKEN: internalServiceToken,
    AI_RANKING_TIMEOUT_MS: timeoutMs,
  })

  if (!config.configured) {
    throw new Error('The internal AI service token is empty.')
  }

  if (config.timeoutMs > LATENCY_BUDGET_MS) {
    throw new Error('Evaluation timeout must not exceed eight seconds.')
  }

  return {
    baseUrl: config.baseUrl,
    internalServiceToken: config.internalServiceToken,
    timeoutMs: config.timeoutMs,
  }
}

export const runEvaluation = async (
  dataset: EvaluationDataset,
  client: HttpAiRecommendationClient,
) => {
  const results: ScenarioResult[] = []

  for (const scenario of dataset.scenarios) {
    results.push(await runScenario(dataset, scenario, client))
  }

  const baseline = aggregateMetrics(results, (result) => result.baseline)
  const ai = aggregateMetrics(results, (result) => result.ai)
  const safeCount = results.filter((result) => result.safe).length
  const costSamples = results.flatMap((result) =>
    result.costUsd === undefined ? [] : [result.costUsd],
  )
  const observedLatencies = results.flatMap((result) =>
    result.observedLatencyMs === undefined ? [] : [result.observedLatencyMs],
  )
  const reportedLatencies = results.flatMap((result) =>
    result.reportedLatencyMs === undefined ? [] : [result.reportedLatencyMs],
  )
  const averageCostUsd =
    costSamples.length === 0
      ? null
      : costSamples.reduce((sum, value) => sum + value, 0) / costSamples.length
  const weightedImprovement =
    ai.coverage === dataset.scenarios.length
      ? ai.metrics.composite - baseline.metrics.composite
      : null
  const p95ObservedLatencyMs = percentile95(observedLatencies)
  const p95ReportedLatencyMs = percentile95(reportedLatencies)
  const gates = {
    schemaAndAllowlistSafety100: safeCount === dataset.scenarios.length,
    relevanceNoRegression:
      ai.coverage === dataset.scenarios.length &&
      ai.metrics.relevance + 1e-9 >= baseline.metrics.relevance,
    difficultyNoRegression:
      ai.coverage === dataset.scenarios.length &&
      ai.metrics.difficulty + 1e-9 >= baseline.metrics.difficulty,
    weightedImprovementAtLeastFivePercentagePoints:
      weightedImprovement !== null && weightedImprovement >= IMPROVEMENT_BUDGET,
    p95ObservedLatencyUnderEightSeconds:
      p95ObservedLatencyMs !== null && p95ObservedLatencyMs < LATENCY_BUDGET_MS,
    averageCostAtMostTwoCents:
      costSamples.length === dataset.scenarios.length &&
      averageCostUsd !== null &&
      averageCostUsd <= COST_BUDGET_USD,
  }
  const passed = Object.values(gates).every(Boolean)

  return {
    dataset: {
      version: dataset.version,
      scenarioCount: dataset.scenarios.length,
      topK: dataset.topK,
      categories: Object.fromEntries(
        categorySchema.options.map((category) => [
          category,
          results.filter((result) => result.category === category).length,
        ]),
      ),
    },
    baseline: {
      rankingVersion: DETERMINISTIC_RANKING_VERSION,
      metrics: asReportMetrics(baseline),
    },
    ai: {
      successfulScenarios: ai.coverage,
      safetyPassRate: round(safeCount / dataset.scenarios.length),
      models: [
        ...new Set(
          results.flatMap((result) =>
            result.model === undefined ? [] : [result.model],
          ),
        ),
      ],
      metrics: asReportMetrics(ai),
      weightedImprovementPercentagePoints:
        weightedImprovement === null
          ? null
          : round(weightedImprovement * 100, 2),
      latency: {
        observedSamples: observedLatencies.length,
        reportedSamples: reportedLatencies.length,
        p95ObservedMs:
          p95ObservedLatencyMs === null ? null : round(p95ObservedLatencyMs, 2),
        p95ReportedMs:
          p95ReportedLatencyMs === null ? null : round(p95ReportedLatencyMs, 2),
        budgetMs: LATENCY_BUDGET_MS,
      },
      cost: {
        samples: costSamples.length,
        averageUsd: averageCostUsd === null ? null : round(averageCostUsd, 6),
        budgetUsd: COST_BUDGET_USD,
      },
    },
    gates,
    passed,
    failures: results
      .filter((result) => result.error !== undefined)
      .map((result) => ({
        id: result.id,
        category: result.category,
        error: result.error,
      })),
  }
}

const printUsage = () => {
  console.log(
    [
      'Usage:',
      '  npx tsx apps/core-api/evaluation/run.ts --validate-only',
      '  ALGOMEMTOR_EVALUATION_ENABLED=true \\',
      '  ALGOMEMTOR_EVALUATION_AI_API_URL=http://localhost:8000 \\',
      '  ALGOMEMTOR_EVALUATION_INTERNAL_SERVICE_TOKEN=... \\',
      '  npx tsx apps/core-api/evaluation/run.ts',
      '',
      'Live execution is opt-in and calls the internal AI ranking endpoint.',
    ].join('\n'),
  )
}

const main = async () => {
  if (process.argv.includes('--help')) {
    printUsage()
    return 0
  }

  const dataset = await loadEvaluationDataset()

  if (process.argv.includes('--validate-only')) {
    console.log(
      JSON.stringify(
        {
          valid: true,
          version: dataset.version,
          scenarioCount: dataset.scenarios.length,
          categories: Object.fromEntries(
            categorySchema.options.map((category) => [
              category,
              dataset.scenarios.filter(
                (scenario) => scenario.category === category,
              ).length,
            ]),
          ),
        },
        null,
        2,
      ),
    )
    return 0
  }

  const config = readEvaluationConfig()
  if (config === null) {
    console.error(
      'Evaluation is opt-in. Set ALGOMEMTOR_EVALUATION_ENABLED=true plus an explicit AI URL and internal service token, or use --validate-only.',
    )
    return 2
  }

  const client = new HttpAiRecommendationClient({
    baseUrl: config.baseUrl,
    internalServiceToken: config.internalServiceToken,
    timeoutMs: config.timeoutMs,
  })
  const report = await runEvaluation(dataset, client)
  console.log(JSON.stringify(report, null, 2))
  return report.passed ? 0 : 1
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  void main().then(
    (exitCode) => {
      process.exitCode = exitCode
    },
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? `Evaluation failed: ${error.message}`
          : 'Evaluation failed.',
      )
      process.exitCode = 1
    },
  )
}
