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
} from '@algomemtor/shared-contracts'

import { X } from '@/components/icons/algo-icons'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'

import { recommendationPreferenceForRequest } from './recommendation-preference'
import { combinedPracticeNote, splitPracticeNote } from './practice-note'

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

const topicLabels: Record<OnboardingTopic, string> = {
  implementation: 'Implementation',
  arrays: 'Arrays',
  hashing: 'Hashing',
  'sliding-window': 'Sliding Window',
  'linked-lists': 'Linked Lists',
  'heaps-and-priority-queues': 'Heaps and Priority Queues',
  tries: 'Tries',
  math: 'Math',
  'number-theory': 'Number Theory',
  sorting: 'Sorting',
  'binary-search': 'Binary Search',
  'two-pointers': 'Two Pointers',
  'prefix-sums': 'Prefix Sums',
  greedy: 'Greedy',
  strings: 'Strings',
  'recursion-and-backtracking': 'Recursion and Backtracking',
  'stacks-and-queues': 'Stacks and Queues',
  trees: 'Trees',
  graphs: 'Graphs',
  'bfs-and-dfs': 'BFS and DFS',
  'dynamic-programming': 'Dynamic Programming',
  'bit-manipulation': 'Bit Manipulation',
  'segment-trees': 'Segment Trees',
  'fenwick-trees': 'Fenwick Trees',
  'disjoint-set-union': 'Disjoint Set Union',
  'shortest-paths': 'Shortest Paths',
  'minimum-spanning-trees': 'Minimum Spanning Trees',
  'topological-sort': 'Topological Sort',
  'advanced-dynamic-programming': 'Advanced Dynamic Programming',
  geometry: 'Geometry',
  combinatorics: 'Combinatorics',
}

// Profile setup should ask for broad interests, not expose the complete
// provider-normalization taxonomy used by recommendations and progress.
const majorTopicValues = [
  'arrays',
  'strings',
  'hashing',
  'sorting',
  'linked-lists',
  'stacks-and-queues',
  'heaps-and-priority-queues',
  'trees',
  'graphs',
  'binary-search',
  'greedy',
  'dynamic-programming',
  'recursion-and-backtracking',
  'math',
  'bit-manipulation',
] as const satisfies readonly OnboardingTopic[]

const majorTopicSet = new Set<OnboardingTopic>(majorTopicValues)
const topicOptions: readonly Option<OnboardingTopic>[] = majorTopicValues.map(
  (value) => ({ value, label: topicLabels[value] }),
)

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

type FormState = {
  experience: ExperienceLevel | ''
  difficultyComfort: DifficultyComfort | ''
  goal: LearnerGoal | ''
  topicMode: 'selected' | 'let_algomemtor_suggest'
  topics: OnboardingTopic[]
  preferredTopics: OnboardingTopic[]
  platforms: PracticePlatform[]
  ratingRangePlatform: RatingComfortRange['platform']
  ratingRangeMin: string
  ratingRangeMax: string
  learningPreferences: LearningPreference[]
  additionalConsiderations: string
  recommendationPreference: string
  practiceNote: string
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
  | 'ratingComfortRange'
  | 'learningPreferences'
  | 'additionalConsiderations'
  | 'recommendationPreference'
  | 'practiceNote'

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
  combinePracticeNotes?: boolean
  onChange?: () => void
  onRetryLoad?: () => void
  onSubmit: (profile: SaveLearnerProfileRequest) => Promise<void>
}

const inputClassName =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60'

// Settings-style rows: the heading block on the left, every control on the right.
const sectionClassName =
  'grid min-w-0 gap-5 border-b border-border py-8 first-of-type:pt-2 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-x-10 md:[&>*:not(:first-child)]:col-start-2'

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
      ratingRangePlatform: 'codeforces',
      ratingRangeMin: '',
      ratingRangeMax: '',
      learningPreferences: [],
      additionalConsiderations: '',
      recommendationPreference: '',
      practiceNote: '',
      timezone: browserTimezone,
    }
  }

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
    ratingRangePlatform: profile.ratingComfortRange?.platform ?? 'codeforces',
    ratingRangeMin: String(profile.ratingComfortRange?.min ?? ''),
    ratingRangeMax: String(profile.ratingComfortRange?.max ?? ''),
    learningPreferences: [...profile.learningPreferences],
    additionalConsiderations: profile.additionalConsiderations ?? '',
    recommendationPreference: profile.recommendationPreference ?? '',
    practiceNote: combinedPracticeNote(profile),
    timezone: profile.timezone ?? browserTimezone,
  }
}

function buildProfileRequest(state: FormState, combinePracticeNotes: boolean) {
  const ratingRangeMin = state.ratingRangeMin.trim()
  const ratingRangeMax = state.ratingRangeMax.trim()
  const hasRatingRange = Boolean(ratingRangeMin || ratingRangeMax)
  const practiceNotes = combinePracticeNotes
    ? state.practiceNote === combinedPracticeNote(state)
      ? state
      : splitPracticeNote(state.practiceNote)
    : state
  const additionalConsiderations = practiceNotes.additionalConsiderations.trim()
  const recommendationPreference = recommendationPreferenceForRequest(
    practiceNotes.recommendationPreference,
  )
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
    // Ratings come from linked platform accounts, so the profile no longer
    // asks for self-reported standings.
    platformPreferences: {
      platforms: state.platforms,
      standings: [],
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

function errorKey(
  path: readonly PropertyKey[],
  combinePracticeNotes: boolean,
): FormErrorKey {
  const section = String(path[0] ?? '')

  if (
    combinePracticeNotes &&
    (section === 'additionalConsiderations' ||
      section === 'recommendationPreference')
  ) {
    return 'practiceNote'
  }

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
    return 'platforms'
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
  combinePracticeNotes: boolean,
) {
  return issues.reduce<FormErrors>((errors, issue) => {
    const key = errorKey(issue.path, combinePracticeNotes)

    if (!errors[key]) {
      errors[key] =
        key === 'practiceNote'
          ? 'Keep your practice note within 1,500 characters.'
          : (requiredMessages[key] ?? issue.message)
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

function SavedSpecificTopics({
  onRemove,
  topics,
}: {
  onRemove: (topic: OnboardingTopic) => void
  topics: readonly OnboardingTopic[]
}) {
  if (topics.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Saved specific topics
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {topics.map((topic) => (
          <li
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-foreground"
            key={topic}
          >
            <span>{topicLabels[topic]}</span>
            <button
              aria-label={`Remove ${topicLabels[topic]}`}
              className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onRemove(topic)}
              type="button"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
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
  combinePracticeNotes = false,
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
  const savedSpecificTopics = state.topics.filter(
    (topic) => !majorTopicSet.has(topic),
  )
  const savedSpecificPreferredTopics = state.preferredTopics.filter(
    (topic) => !majorTopicSet.has(topic),
  )

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSaving) {
      return
    }

    const result = buildProfileRequest(state, combinePracticeNotes)

    if (!result.success) {
      setErrors(validationErrors(result.error.issues, combinePracticeNotes))
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
            <SavedSpecificTopics
              onRemove={toggleTopic}
              topics={savedSpecificTopics}
            />
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
          <SavedSpecificTopics
            onRemove={togglePreferredTopic}
            topics={savedSpecificPreferredTopics}
          />
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

        {combinePracticeNotes ? (
          <div className="flex min-w-0 flex-col gap-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor={`${idPrefix}-practice-note`}
            >
              Practice preferences and considerations
            </label>
            <textarea
              aria-describedby={`${idPrefix}-practice-note-help${
                errors.practiceNote ? ` ${idPrefix}-practice-note-error` : ''
              }`}
              aria-invalid={Boolean(errors.practiceNote)}
              className="min-h-32 w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              id={`${idPrefix}-practice-note`}
              maxLength={1500}
              onChange={(event) =>
                setField(
                  'practiceNote',
                  event.currentTarget.value,
                  'practiceNote',
                )
              }
              placeholder="For example: Avoid 800-rated problems and keep weekday sessions short."
              value={state.practiceNote}
            />
            <p
              className="text-sm text-muted-foreground"
              id={`${idPrefix}-practice-note-help`}
            >
              Optional. Include preferences for recommendations and anything
              else your coach should consider. Up to 1,500 characters. Do not
              include personal or sensitive information.
            </p>
            <FieldError
              id={`${idPrefix}-practice-note-error`}
              message={errors.practiceNote}
            />
          </div>
        ) : (
          <>
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
          </>
        )}

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
