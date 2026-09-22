import { useRef, useState, type FormEvent } from 'react'
import {
  SaveLearnerProfileRequestSchema,
  type DifficultyComfort,
  type ExperienceLevel,
  type LearnerGoal,
  type LearnerProfile,
  type LearningPreference,
  type OnboardingTopic,
  type PracticePlatform,
  type RatedPracticePlatform,
  type RatingComfortRange,
  type SaveLearnerProfileRequest,
  type StandingMetric,
} from '@algomemtor/shared-contracts'

import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'

import { recommendationPreferenceForRequest } from './recommendation-preference'

type Option<T extends string> = {
  value: T
  label: string
}

const experienceOptions: readonly Option<ExperienceLevel>[] = [
  { value: 'complete_beginner', label: 'Complete beginner' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
]

const difficultyOptions: readonly Option<DifficultyComfort>[] = [
  {
    value: 'new_to_rated_problems',
    label: 'I am new to rated problems',
  },
  { value: 'introductory', label: 'Introductory or easy' },
  { value: 'medium', label: 'Medium difficulty' },
  { value: 'challenging', label: 'Challenging' },
  {
    value: 'let_algomemtor_decide',
    label: 'Let AlgoMemtor suggest a starting point',
  },
]

const goalOptions: readonly Option<LearnerGoal>[] = [
  {
    value: 'start_competitive_programming',
    label: 'Start competitive programming from scratch',
  },
  {
    value: 'improve_problem_solving',
    label: 'Improve my problem-solving skills',
  },
  { value: 'improve_contest_rating', label: 'Improve my contest rating' },
  { value: 'prepare_for_contests', label: 'Prepare for upcoming contests' },
  {
    value: 'prepare_for_coding_interviews',
    label: 'Prepare for coding interviews',
  },
  { value: 'prepare_for_icpc', label: 'Prepare for ICPC' },
  {
    value: 'learn_advanced_algorithms',
    label: 'Learn advanced algorithms',
  },
  {
    value: 'build_consistent_habit',
    label: 'Build a consistent practice habit',
  },
]

const topicOptions: readonly Option<OnboardingTopic>[] = [
  { value: 'implementation', label: 'Implementation' },
  { value: 'arrays', label: 'Arrays' },
  { value: 'hashing', label: 'Hashing' },
  { value: 'sliding-window', label: 'Sliding Window' },
  { value: 'linked-lists', label: 'Linked Lists' },
  {
    value: 'heaps-and-priority-queues',
    label: 'Heaps and Priority Queues',
  },
  { value: 'tries', label: 'Tries' },
  { value: 'math', label: 'Math' },
  { value: 'number-theory', label: 'Number Theory' },
  { value: 'sorting', label: 'Sorting' },
  { value: 'binary-search', label: 'Binary Search' },
  { value: 'two-pointers', label: 'Two Pointers' },
  { value: 'prefix-sums', label: 'Prefix Sums' },
  { value: 'greedy', label: 'Greedy' },
  { value: 'strings', label: 'Strings' },
  {
    value: 'recursion-and-backtracking',
    label: 'Recursion and Backtracking',
  },
  { value: 'stacks-and-queues', label: 'Stacks and Queues' },
  { value: 'trees', label: 'Trees' },
  { value: 'graphs', label: 'Graphs' },
  { value: 'bfs-and-dfs', label: 'BFS and DFS' },
  { value: 'dynamic-programming', label: 'Dynamic Programming' },
  { value: 'bit-manipulation', label: 'Bit Manipulation' },
  { value: 'segment-trees', label: 'Segment Trees' },
  { value: 'fenwick-trees', label: 'Fenwick Trees' },
  { value: 'disjoint-set-union', label: 'Disjoint Set Union' },
  { value: 'shortest-paths', label: 'Shortest Paths' },
  { value: 'minimum-spanning-trees', label: 'Minimum Spanning Trees' },
  { value: 'topological-sort', label: 'Topological Sort' },
  {
    value: 'advanced-dynamic-programming',
    label: 'Advanced Dynamic Programming',
  },
  { value: 'geometry', label: 'Geometry' },
  { value: 'combinatorics', label: 'Combinatorics' },
]

const platformOptions: readonly Option<PracticePlatform>[] = [
  { value: 'codeforces', label: 'Codeforces' },
  { value: 'codechef', label: 'CodeChef' },
  { value: 'atcoder', label: 'AtCoder' },
  { value: 'leetcode', label: 'LeetCode' },
  { value: 'cses', label: 'CSES' },
  { value: 'hackerrank', label: 'HackerRank' },
]

const ratedPlatformOptions: readonly Option<RatedPracticePlatform>[] = [
  { value: 'codeforces', label: 'Codeforces' },
  { value: 'codechef', label: 'CodeChef' },
  { value: 'atcoder', label: 'AtCoder' },
  { value: 'leetcode', label: 'LeetCode' },
]

const learningPreferenceOptions: readonly Option<LearningPreference>[] = [
  { value: 'solve_problems_directly', label: 'Solve problems directly' },
  {
    value: 'learn_concept_then_solve',
    label: 'Learn a concept first, then solve problems',
  },
  {
    value: 'watch_tutorial_then_solve',
    label: 'Watch a tutorial, then solve problems',
  },
  {
    value: 'read_editorial_then_solve_similar',
    label: 'Read an editorial, then solve similar problems',
  },
  { value: 'practice_through_contests', label: 'Practice through contests' },
  {
    value: 'practice_one_topic_at_a_time',
    label: 'Practice one topic at a time',
  },
  { value: 'practice_weak_areas', label: 'Practice my weak areas' },
  { value: 'mixed_approach', label: 'Use a mixed approach' },
]

type StandingInput = {
  metric: StandingMetric
  value: string
}

type FormState = {
  experience: ExperienceLevel | ''
  difficultyComfort: DifficultyComfort | ''
  goal: LearnerGoal | ''
  topicMode: 'selected' | 'let_algomemtor_suggest'
  topics: OnboardingTopic[]
  preferredTopics: OnboardingTopic[]
  platforms: PracticePlatform[]
  standings: Record<RatedPracticePlatform, StandingInput>
  ratingRangePlatform: RatingComfortRange['platform']
  ratingRangeMin: string
  ratingRangeMax: string
  learningPreferences: LearningPreference[]
  additionalConsiderations: string
  recommendationPreference: string
  timezone: string
}

type FormErrorKey =
  | 'form'
  | 'experience'
  | 'difficultyComfort'
  | 'goal'
  | 'topics'
  | 'preferredTopics'
  | 'platforms'
  | 'standings'
  | 'ratingComfortRange'
  | 'learningPreferences'
  | 'additionalConsiderations'
  | 'recommendationPreference'

type FormErrors = Partial<Record<FormErrorKey, string>>

type LearnerProfileFormProps = {
  idPrefix: string
  initialProfile: LearnerProfile | null
  isLoading?: boolean
  isSaving?: boolean
  loadError?: string | null
  saveError?: string | null
  successMessage?: string | null
  submitLabel: string
  onChange?: () => void
  onRetryLoad?: () => void
  onSubmit: (profile: SaveLearnerProfileRequest) => Promise<void>
}

const inputClassName =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60'

// Settings-style rows: the heading block on the left, every control on the right.
const sectionClassName =
  'grid min-w-0 gap-5 border-b border-border py-8 first-of-type:pt-2 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-x-10 md:[&>*:not(:first-child)]:col-start-2'

function emptyStandings(): Record<RatedPracticePlatform, StandingInput> {
  return {
    codeforces: { metric: 'rating', value: '' },
    codechef: { metric: 'rating', value: '' },
    atcoder: { metric: 'rating', value: '' },
    leetcode: { metric: 'rating', value: '' },
  }
}

function initialFormState(profile: LearnerProfile | null): FormState {
  const browserTimezone = Intl.DateTimeFormat()
    .resolvedOptions()
    .timeZone.trim()

  if (!profile) {
    return {
      experience: '',
      difficultyComfort: '',
      goal: '',
      topicMode: 'let_algomemtor_suggest',
      topics: [],
      preferredTopics: [],
      platforms: [],
      standings: emptyStandings(),
      ratingRangePlatform: 'codeforces',
      ratingRangeMin: '',
      ratingRangeMax: '',
      learningPreferences: [],
      additionalConsiderations: '',
      recommendationPreference: '',
      timezone: browserTimezone,
    }
  }

  const standings = emptyStandings()

  profile.platformPreferences.standings.forEach((standing) => {
    standings[standing.platform] = {
      metric: standing.metric,
      value: String(standing.value),
    }
  })

  return {
    experience: profile.experience,
    difficultyComfort: profile.difficultyComfort,
    goal: profile.goal,
    topicMode: profile.topicPreference.mode,
    topics:
      profile.topicPreference.mode === 'selected'
        ? [...profile.topicPreference.topics]
        : [],
    preferredTopics: [...profile.preferredTopics],
    platforms: [...profile.platformPreferences.platforms],
    standings,
    ratingRangePlatform: profile.ratingComfortRange?.platform ?? 'codeforces',
    ratingRangeMin: String(profile.ratingComfortRange?.min ?? ''),
    ratingRangeMax: String(profile.ratingComfortRange?.max ?? ''),
    learningPreferences: [...profile.learningPreferences],
    additionalConsiderations: profile.additionalConsiderations ?? '',
    recommendationPreference: profile.recommendationPreference ?? '',
    timezone: profile.timezone ?? browserTimezone,
  }
}

function buildProfileRequest(state: FormState) {
  const ratingRangeMin = state.ratingRangeMin.trim()
  const ratingRangeMax = state.ratingRangeMax.trim()
  const hasRatingRange = Boolean(ratingRangeMin || ratingRangeMax)
  const additionalConsiderations = state.additionalConsiderations.trim()
  const recommendationPreference = recommendationPreferenceForRequest(
    state.recommendationPreference,
  )
  const standings = ratedPlatformOptions.flatMap(({ value: platform }) => {
    const standing = state.standings[platform]

    if (!state.platforms.includes(platform) || !standing.value.trim()) {
      return []
    }

    return [
      {
        platform,
        metric: standing.metric,
        value: Number(standing.value),
      },
    ]
  })

  return SaveLearnerProfileRequestSchema.safeParse({
    experience: state.experience,
    difficultyComfort: state.difficultyComfort,
    goal: state.goal,
    topicPreference:
      state.topicMode === 'selected'
        ? {
            mode: 'selected',
            topics: state.topics,
          }
        : { mode: 'let_algomemtor_suggest' },
    preferredTopics: state.preferredTopics,
    platformPreferences: {
      platforms: state.platforms,
      standings,
    },
    ...(hasRatingRange
      ? {
          ratingComfortRange: {
            platform: state.ratingRangePlatform,
            min: Number(ratingRangeMin),
            max: Number(ratingRangeMax),
          },
        }
      : {}),
    learningPreferences: state.learningPreferences,
    ...(additionalConsiderations ? { additionalConsiderations } : {}),
    ...(recommendationPreference === undefined
      ? {}
      : { recommendationPreference }),
    ...(state.timezone.trim() ? { timezone: state.timezone.trim() } : {}),
  })
}

function errorKey(path: readonly PropertyKey[]): FormErrorKey {
  const section = String(path[0] ?? '')
  const field = String(path[1] ?? '')

  if (section === 'experience' || section === 'difficultyComfort') {
    return section
  }

  if (section === 'goal') {
    return 'goal'
  }

  if (section === 'topicPreference') {
    return 'topics'
  }

  if (section === 'preferredTopics') {
    return 'preferredTopics'
  }

  if (section === 'platformPreferences') {
    return field === 'standings' ? 'standings' : 'platforms'
  }

  if (section === 'ratingComfortRange') {
    return 'ratingComfortRange'
  }

  if (section === 'learningPreferences') {
    return 'learningPreferences'
  }

  if (section === 'additionalConsiderations') {
    return 'additionalConsiderations'
  }

  if (section === 'recommendationPreference') {
    return 'recommendationPreference'
  }

  return 'form'
}

const requiredMessages: Partial<Record<FormErrorKey, string>> = {
  experience: 'Choose your current experience level.',
  difficultyComfort: 'Choose a productive difficulty level.',
  goal: 'Choose your main learning goal.',
  learningPreferences: 'Choose at least one learning preference.',
}

function validationErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
) {
  return issues.reduce<FormErrors>((errors, issue) => {
    const key = errorKey(issue.path)

    if (!errors[key]) {
      errors[key] = requiredMessages[key] ?? issue.message
    }

    return errors
  }, {})
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="text-sm text-destructive" id={id} role="alert">
      {message}
    </p>
  ) : null
}

function SelectField<T extends string>({
  disabled,
  error,
  id,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled: boolean
  error?: string
  id: string
  label: string
  onChange: (value: T | '') => void
  options: readonly Option<T>[]
  placeholder: string
  value: T | ''
}) {
  const errorId = `${id}-error`

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label} <span className="text-destructive">*</span>
      </label>
      <select
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        className={inputClassName}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.currentTarget.value as T | '')}
        required
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={errorId} message={error} />
    </div>
  )
}

function LearnerProfileFormFields({
  idPrefix,
  initialProfile,
  isSaving = false,
  onChange,
  onSubmit,
  saveError,
  submitLabel,
  successMessage,
}: Omit<LearnerProfileFormProps, 'isLoading' | 'loadError' | 'onRetryLoad'>) {
  const [state, setState] = useState(() => initialFormState(initialProfile))
  const [errors, setErrors] = useState<FormErrors>({})
  const validationSummaryRef = useRef<HTMLDivElement>(null)
  const topicSelectionCount = state.topics.length
  const preferredTopicSelectionCount = state.preferredTopics.length

  function changed() {
    onChange?.()
  }

  function clearErrors(...keys: FormErrorKey[]) {
    setErrors((current) => {
      const next = { ...current }
      keys.forEach((key) => delete next[key])
      return next
    })
  }

  function setField<Key extends keyof FormState>(
    field: Key,
    value: FormState[Key],
    ...errorKeys: FormErrorKey[]
  ) {
    changed()
    clearErrors(...errorKeys)
    setState((current) => ({ ...current, [field]: value }))
  }

  function toggleTopic(topic: OnboardingTopic) {
    const isSelected = state.topics.includes(topic)

    if (!isSelected && topicSelectionCount >= 5) {
      setErrors((current) => ({
        ...current,
        topics: 'Choose no more than five topics in total.',
      }))
      return
    }

    setField(
      'topics',
      isSelected
        ? state.topics.filter((value) => value !== topic)
        : [...state.topics, topic],
      'topics',
    )
  }

  function togglePreferredTopic(topic: OnboardingTopic) {
    const isSelected = state.preferredTopics.includes(topic)

    if (!isSelected && preferredTopicSelectionCount >= 5) {
      setErrors((current) => ({
        ...current,
        preferredTopics: 'Choose no more than five preferred topics.',
      }))
      return
    }

    setField(
      'preferredTopics',
      isSelected
        ? state.preferredTopics.filter((value) => value !== topic)
        : [...state.preferredTopics, topic],
      'preferredTopics',
    )
  }

  function togglePlatform(platform: PracticePlatform) {
    const isSelected = state.platforms.includes(platform)
    setField(
      'platforms',
      isSelected
        ? state.platforms.filter((value) => value !== platform)
        : [...state.platforms, platform],
      'platforms',
      'standings',
    )
  }

  function toggleLearningPreference(preference: LearningPreference) {
    const isSelected = state.learningPreferences.includes(preference)
    setField(
      'learningPreferences',
      isSelected
        ? state.learningPreferences.filter((value) => value !== preference)
        : [...state.learningPreferences, preference],
      'learningPreferences',
    )
  }

  function setStanding(
    platform: RatedPracticePlatform,
    standing: StandingInput,
  ) {
    changed()
    clearErrors('standings')
    setState((current) => ({
      ...current,
      standings: { ...current.standings, [platform]: standing },
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaving) {
      return
    }

    const result = buildProfileRequest(state)

    if (!result.success) {
      setErrors(validationErrors(result.error.issues))
      window.requestAnimationFrame(() => validationSummaryRef.current?.focus())
      return
    }

    setErrors({})

    try {
      await onSubmit(result.data)
    } catch {
      // The mutation exposes a safe error message through saveError.
    }
  }

  const selectedRatedPlatforms = ratedPlatformOptions.filter(({ value }) =>
    state.platforms.includes(value),
  )
  const formErrorMessages = Object.values(errors)

  return (
    <form
      aria-busy={isSaving}
      className="flex w-full max-w-5xl min-w-0 flex-col"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {formErrorMessages.length > 0 ? (
        <div
          className="mb-6 rounded-2xl border border-destructive/40 bg-danger-soft p-4"
          ref={validationSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <p className="font-medium text-foreground">
            Check the highlighted profile fields.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
            {formErrorMessages.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section
        aria-labelledby={`${idPrefix}-starting-point-heading`}
        className={sectionClassName}
      >
        <div>
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            id={`${idPrefix}-starting-point-heading`}
          >
            Starting point
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Help us choose problems that are useful without being overwhelming.
          </p>
        </div>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-2">
          <SelectField
            disabled={isSaving}
            error={errors.experience}
            id={`${idPrefix}-experience`}
            label="Current competitive-programming experience"
            onChange={(value) => setField('experience', value, 'experience')}
            options={experienceOptions}
            placeholder="Choose your experience"
            value={state.experience}
          />
          <SelectField
            disabled={isSaving}
            error={errors.difficultyComfort}
            id={`${idPrefix}-difficulty`}
            label="Difficulty that feels productive"
            onChange={(value) =>
              setField('difficultyComfort', value, 'difficultyComfort')
            }
            options={difficultyOptions}
            placeholder="Choose a difficulty"
            value={state.difficultyComfort}
          />
        </div>
      </section>

      <section
        aria-labelledby={`${idPrefix}-goal-heading`}
        className={sectionClassName}
      >
        <div>
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            id={`${idPrefix}-goal-heading`}
          >
            Goal
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the main outcome you want AlgoMemtor to support.
          </p>
        </div>

        <SelectField
          disabled={isSaving}
          error={errors.goal}
          id={`${idPrefix}-goal`}
          label="Main learning goal"
          onChange={(value) => setField('goal', value, 'goal')}
          options={goalOptions}
          placeholder="Choose your main goal"
          value={state.goal}
        />
      </section>

      <section
        aria-labelledby={`${idPrefix}-topics-heading`}
        className={sectionClassName}
      >
        <div>
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            id={`${idPrefix}-topics-heading`}
          >
            Topics to improve
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose up to five topics or let AlgoMemtor suggest a starting path.
          </p>
        </div>

        <fieldset className="space-y-3" disabled={isSaving}>
          <legend className="sr-only">Topic selection mode</legend>
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              checked={state.topicMode === 'let_algomemtor_suggest'}
              className="mt-0.5 size-4 accent-primary"
              name={`${idPrefix}-topic-mode`}
              onChange={() =>
                setField('topicMode', 'let_algomemtor_suggest', 'topics')
              }
              type="radio"
            />
            Let AlgoMemtor suggest topics for me
          </label>
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              checked={state.topicMode === 'selected'}
              className="mt-0.5 size-4 accent-primary"
              name={`${idPrefix}-topic-mode`}
              onChange={() => setField('topicMode', 'selected', 'topics')}
              type="radio"
            />
            I want to choose topics
          </label>
        </fieldset>

        {state.topicMode === 'selected' ? (
          <fieldset
            aria-describedby={`${idPrefix}-topics-help${
              errors.topics ? ` ${idPrefix}-topics-error` : ''
            }`}
            className="space-y-3"
            disabled={isSaving}
          >
            <legend className="font-medium text-foreground">
              Preferred or weak topics
            </legend>
            <p
              className="text-sm text-muted-foreground"
              id={`${idPrefix}-topics-help`}
            >
              {topicSelectionCount} of 5 selected
            </p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {topicOptions.map((option) => (
                <label
                  className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground"
                  key={option.value}
                >
                  <input
                    aria-invalid={Boolean(errors.topics)}
                    checked={state.topics.includes(option.value)}
                    className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                    onChange={() => toggleTopic(option.value)}
                    type="checkbox"
                  />
                  <span className="min-w-0 break-words">{option.label}</span>
                </label>
              ))}
            </div>
            <FieldError
              id={`${idPrefix}-topics-error`}
              message={errors.topics}
            />
          </fieldset>
        ) : null}

        <fieldset
          aria-describedby={`${idPrefix}-preferred-topics-help${
            errors.preferredTopics ? ` ${idPrefix}-preferred-topics-error` : ''
          }`}
          className="space-y-3"
          disabled={isSaving}
        >
          <legend className="font-medium text-foreground">
            Topics you enjoy or prefer
          </legend>
          <p
            className="text-sm text-muted-foreground"
            id={`${idPrefix}-preferred-topics-help`}
          >
            Optional. Choose up to five. {preferredTopicSelectionCount}{' '}
            selected.
          </p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {topicOptions.map((option) => (
              <label
                className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground"
                key={option.value}
              >
                <input
                  aria-invalid={Boolean(errors.preferredTopics)}
                  checked={state.preferredTopics.includes(option.value)}
                  className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                  onChange={() => togglePreferredTopic(option.value)}
                  type="checkbox"
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            ))}
          </div>
          <FieldError
            id={`${idPrefix}-preferred-topics-error`}
            message={errors.preferredTopics}
          />
        </fieldset>
      </section>

      <section
        aria-labelledby={`${idPrefix}-platforms-heading`}
        className={sectionClassName}
      >
        <div>
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            id={`${idPrefix}-platforms-heading`}
          >
            Practice platforms
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform selection and ratings are optional. Leave this blank if you
            do not use a platform yet.
          </p>
        </div>

        <fieldset className="space-y-3" disabled={isSaving}>
          <legend className="font-medium text-foreground">
            Platforms you use or prefer
          </legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {platformOptions.map((option) => (
              <label
                className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground"
                key={option.value}
              >
                <input
                  checked={state.platforms.includes(option.value)}
                  className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                  onChange={() => togglePlatform(option.value)}
                  type="checkbox"
                />
                {option.label}
              </label>
            ))}
          </div>
          <FieldError
            id={`${idPrefix}-platforms-error`}
            message={errors.platforms}
          />
        </fieldset>

        {selectedRatedPlatforms.length > 0 ? (
          <fieldset className="space-y-4" disabled={isSaving}>
            <legend className="font-medium text-foreground">
              Current ratings or ranking
            </legend>
            <p className="text-sm text-muted-foreground">
              These fields are optional and do not link an external account.
            </p>
            <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
              {selectedRatedPlatforms.map((option) => {
                const standing = state.standings[option.value]

                return (
                  <div
                    className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-4"
                    key={option.value}
                  >
                    <label
                      className="text-sm font-medium text-foreground"
                      htmlFor={`${idPrefix}-${option.value}-standing`}
                    >
                      {option.label}{' '}
                      {standing.metric === 'ranking' ? 'ranking' : 'rating'}
                    </label>
                    {option.value === 'leetcode' ? (
                      <select
                        className={inputClassName}
                        id={`${idPrefix}-leetcode-metric`}
                        onChange={(event) =>
                          setStanding(option.value, {
                            ...standing,
                            metric: event.currentTarget.value as StandingMetric,
                          })
                        }
                        value={standing.metric}
                      >
                        <option value="rating">Rating</option>
                        <option value="ranking">Ranking</option>
                      </select>
                    ) : null}
                    <input
                      aria-describedby={
                        errors.standings
                          ? `${idPrefix}-standings-error`
                          : undefined
                      }
                      aria-invalid={Boolean(errors.standings)}
                      className={inputClassName}
                      id={`${idPrefix}-${option.value}-standing`}
                      inputMode="numeric"
                      min="1"
                      onChange={(event) =>
                        setStanding(option.value, {
                          ...standing,
                          value: event.currentTarget.value,
                        })
                      }
                      placeholder="Optional"
                      type="number"
                      value={standing.value}
                    />
                  </div>
                )
              })}
            </div>
            <FieldError
              id={`${idPrefix}-standings-error`}
              message={errors.standings}
            />
          </fieldset>
        ) : null}

        <fieldset className="space-y-4" disabled={isSaving}>
          <legend className="font-medium text-foreground">
            Preferred rating range
          </legend>
          <p className="text-sm text-muted-foreground">
            Optional. Enter both ends of a provider-specific range, or leave
            both blank and use the difficulty choice above.
          </p>
          <div className="grid min-w-0 gap-4 md:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor={`${idPrefix}-rating-range-platform`}
              >
                Platform
              </label>
              <select
                className={inputClassName}
                id={`${idPrefix}-rating-range-platform`}
                onChange={(event) =>
                  setField(
                    'ratingRangePlatform',
                    event.currentTarget.value as RatedPracticePlatform,
                    'ratingComfortRange',
                  )
                }
                value={state.ratingRangePlatform}
              >
                {ratedPlatformOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor={`${idPrefix}-rating-range-min`}
              >
                Minimum rating
              </label>
              <input
                aria-invalid={Boolean(errors.ratingComfortRange)}
                className={inputClassName}
                id={`${idPrefix}-rating-range-min`}
                inputMode="numeric"
                min="1"
                onChange={(event) =>
                  setField(
                    'ratingRangeMin',
                    event.currentTarget.value,
                    'ratingComfortRange',
                  )
                }
                placeholder="Optional"
                type="number"
                value={state.ratingRangeMin}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor={`${idPrefix}-rating-range-max`}
              >
                Maximum rating
              </label>
              <input
                aria-describedby={
                  errors.ratingComfortRange
                    ? `${idPrefix}-rating-range-error`
                    : undefined
                }
                aria-invalid={Boolean(errors.ratingComfortRange)}
                className={inputClassName}
                id={`${idPrefix}-rating-range-max`}
                inputMode="numeric"
                min="1"
                onChange={(event) =>
                  setField(
                    'ratingRangeMax',
                    event.currentTarget.value,
                    'ratingComfortRange',
                  )
                }
                placeholder="Optional"
                type="number"
                value={state.ratingRangeMax}
              />
            </div>
          </div>
          <FieldError
            id={`${idPrefix}-rating-range-error`}
            message={errors.ratingComfortRange}
          />
        </fieldset>

        <aside className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Linking a public provider profile is optional. It does not give
          AlgoMemtor access to passwords, private data, submissions, or verified
          solve activity. You can finish onboarding without linking an account.
        </aside>
      </section>

      <section
        aria-labelledby={`${idPrefix}-learning-heading`}
        className={sectionClassName}
      >
        <div>
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            id={`${idPrefix}-learning-heading`}
          >
            Learning preferences
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose at least one approach. You can change this later.
          </p>
        </div>

        <fieldset
          aria-describedby={
            errors.learningPreferences
              ? `${idPrefix}-learning-error`
              : undefined
          }
          className="space-y-3"
          disabled={isSaving}
        >
          <legend className="font-medium text-foreground">
            Preferred ways to learn <span className="text-destructive">*</span>
          </legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {learningPreferenceOptions.map((option) => (
              <label
                className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground"
                key={option.value}
              >
                <input
                  aria-invalid={Boolean(errors.learningPreferences)}
                  checked={state.learningPreferences.includes(option.value)}
                  className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                  onChange={() => toggleLearningPreference(option.value)}
                  type="checkbox"
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            ))}
          </div>
          <FieldError
            id={`${idPrefix}-learning-error`}
            message={errors.learningPreferences}
          />
        </fieldset>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={`${idPrefix}-recommendation-preference`}
          >
            What should we keep in mind for your next recommendations?
          </label>
          <textarea
            aria-describedby={`${idPrefix}-recommendation-preference-help${
              errors.recommendationPreference
                ? ` ${idPrefix}-recommendation-preference-error`
                : ''
            }`}
            aria-invalid={Boolean(errors.recommendationPreference)}
            className="min-h-24 w-full min-w-0 resize-y rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 py-2 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            id={`${idPrefix}-recommendation-preference`}
            maxLength={500}
            onChange={(event) =>
              setField(
                'recommendationPreference',
                event.currentTarget.value,
                'recommendationPreference',
              )
            }
            placeholder="For example: Prefer graph problems I can finish in one focused session."
            value={state.recommendationPreference}
          />
          <p
            className="text-sm text-muted-foreground"
            id={`${idPrefix}-recommendation-preference-help`}
          >
            Optional, up to 500 characters. Your structured profile choices
            remain authoritative, and explicit topic exclusions here are
            respected by the coach and deterministic recommendations. Do not
            include personal or sensitive information.
          </p>
          <FieldError
            id={`${idPrefix}-recommendation-preference-error`}
            message={errors.recommendationPreference}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={`${idPrefix}-considerations`}
          >
            Other practice considerations
          </label>
          <textarea
            aria-describedby={`${idPrefix}-considerations-help${
              errors.additionalConsiderations
                ? ` ${idPrefix}-considerations-error`
                : ''
            }`}
            aria-invalid={Boolean(errors.additionalConsiderations)}
            className="min-h-28 w-full min-w-0 resize-y rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 py-2 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            id={`${idPrefix}-considerations`}
            maxLength={1000}
            onChange={(event) =>
              setField(
                'additionalConsiderations',
                event.currentTarget.value,
                'additionalConsiderations',
              )
            }
            value={state.additionalConsiderations}
          />
          <p
            className="text-sm text-muted-foreground"
            id={`${idPrefix}-considerations-help`}
          >
            Optional, up to 1,000 characters.
          </p>
          <FieldError
            id={`${idPrefix}-considerations-error`}
            message={errors.additionalConsiderations}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor={`${idPrefix}-timezone`}
          >
            Timezone for progress dates
          </label>
          <input
            aria-describedby={`${idPrefix}-timezone-help`}
            className={inputClassName}
            disabled={isSaving}
            id={`${idPrefix}-timezone`}
            list={`${idPrefix}-timezone-options`}
            onChange={(event) =>
              setField('timezone', event.currentTarget.value)
            }
            placeholder="e.g. Asia/Kolkata"
            spellCheck={false}
            value={state.timezone}
          />
          <datalist id={`${idPrefix}-timezone-options`}>
            <option value="UTC" />
            <option value="Asia/Kolkata" />
            <option value="Asia/Singapore" />
            <option value="Europe/London" />
            <option value="Europe/Berlin" />
            <option value="America/New_York" />
            <option value="America/Los_Angeles" />
          </datalist>
          <p
            className="text-sm text-muted-foreground"
            id={`${idPrefix}-timezone-help`}
          >
            Used only to place your 30-day activity and streak dates. The
            browser timezone is suggested, and you can change it any time.
          </p>
        </div>
      </section>

      {saveError ? (
        <p
          className="mt-6 rounded-2xl border border-destructive/40 bg-danger-soft p-4 text-sm text-danger-foreground"
          role="alert"
        >
          {saveError}
        </p>
      ) : null}

      {successMessage ? (
        <p
          className="mt-6 rounded-2xl border border-go/35 bg-go-soft p-4 text-sm text-go-foreground"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      <Button
        className="mt-8 w-full sm:w-auto sm:self-end"
        disabled={isSaving}
        size="lg"
        type="submit"
        variant="ink"
      >
        {isSaving ? 'Saving profile…' : submitLabel}
      </Button>
    </form>
  )
}

export function LearnerProfileForm({
  isLoading = false,
  loadError,
  onRetryLoad,
  ...formProps
}: LearnerProfileFormProps) {
  if (isLoading) {
    return <PageSkeleton label="Loading learner profile" rows={6} />
  }

  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={onRetryLoad}
        title="Learner profile unavailable"
      />
    )
  }

  return <LearnerProfileFormFields {...formProps} />
}

export type { LearnerProfileFormProps }
