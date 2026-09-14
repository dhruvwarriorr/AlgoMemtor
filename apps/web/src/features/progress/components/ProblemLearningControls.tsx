import { useCallback, useState } from 'react'
import type { LearnerProblemStatus } from '@algomemtor/shared-contracts'
import {
  Bookmark,
  BookmarkCheck,
  Pause,
  Play,
  Save,
  Trash2,
} from 'lucide-react'

import { useNotification } from '@/app/useNotification'
import { Button } from '@/components/ui/button'
import {
  useAddBookmark,
  useRemoveBookmark,
} from '@/features/bookmarks/hooks/useBookmarks'

import {
  useSaveProblemReflection,
  useSetProblemStatus,
} from '../hooks/useProgress'
import { problemKey, type ProblemReference } from '../contracts'
import { formatTimerDuration, timerProblemMatches } from '../timer/timer-utils'
import { useTimer } from '../timer/useTimer'
import { ReflectionDialog } from './ReflectionDialog'

const statusLabels: Record<LearnerProblemStatus, string> = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  solved: 'Solved',
}

type ProblemLearningControlsProps = {
  problem: ProblemReference
  initialStatus?: LearnerProblemStatus
  evidenceSource?: 'manual' | 'provider_verified'
  initialBookmarked?: boolean
  recommendationItemId?: string
  sourceContext?: string
  compact?: boolean
}

export function ProblemLearningControls(props: ProblemLearningControlsProps) {
  const initialStatus = props.initialStatus ?? 'unsolved'
  const initialBookmarked = props.initialBookmarked ?? false
  const controlKey = `${problemKey(props.problem)}:${initialStatus}:${initialBookmarked}`

  return <ProblemLearningControlsContent {...props} key={controlKey} />
}

function ProblemLearningControlsContent({
  problem,
  initialBookmarked = false,
  initialStatus = 'unsolved',
  evidenceSource,
  recommendationItemId,
  sourceContext,
  compact = false,
}: ProblemLearningControlsProps) {
  const { notify } = useNotification()
  const statusMutation = useSetProblemStatus()
  const reflectionMutation = useSaveProblemReflection()
  const addBookmarkMutation = useAddBookmark()
  const removeBookmarkMutation = useRemoveBookmark()
  const [status, setStatus] = useState(initialStatus)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [reflectionOpen, setReflectionOpen] = useState(false)
  const [reflectionStatusActionId, setReflectionStatusActionId] = useState<
    string | undefined
  >()
  const closeReflection = useCallback(() => setReflectionOpen(false), [])
  const currentProblemKey = problemKey(problem)

  async function handleStatusChange(nextStatus: LearnerProblemStatus) {
    if (nextStatus === status && !statusMutation.isPending) return
    const previousStatus = status
    setStatus(nextStatus)
    try {
      const response = await statusMutation.mutateAsync({
        problem,
        input: {
          status: nextStatus,
          ...(recommendationItemId === undefined
            ? {}
            : { recommendationItemId }),
          ...(sourceContext === undefined ? {} : { sourceContext }),
        },
      })
      if (nextStatus === 'attempted' || nextStatus === 'solved') {
        setReflectionStatusActionId(response.data.statusActionId)
        setReflectionOpen(true)
      }
    } catch (error) {
      setStatus(previousStatus)
      notify({
        title: 'Status was not saved',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
        tone: 'error',
      })
    }
  }

  async function toggleBookmark() {
    const nextBookmarked = !bookmarked
    setBookmarked(nextBookmarked)
    try {
      if (nextBookmarked) await addBookmarkMutation.mutateAsync(problem)
      else await removeBookmarkMutation.mutateAsync(problem)
    } catch (error) {
      setBookmarked(!nextBookmarked)
      notify({
        title: nextBookmarked
          ? 'Bookmark was not saved'
          : 'Bookmark was not removed',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
        tone: 'error',
      })
    }
  }

  async function saveReflection(input: {
    perceivedDifficulty: 'easy' | 'medium' | 'hard'
    note?: string
  }) {
    try {
      await reflectionMutation.mutateAsync({
        problem,
        input: {
          ...input,
          ...(reflectionStatusActionId === undefined
            ? {}
            : { statusActionId: reflectionStatusActionId }),
        },
      })
      closeReflection()
      setReflectionStatusActionId(undefined)
      notify({
        title: 'Reflection saved',
        description:
          'Your note will remain separate from the provider problem.',
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'Reflection was not saved',
        description:
          error instanceof Error
            ? error.message
            : 'Please try again in a moment.',
        tone: 'error',
      })
      throw error
    }
  }

  const bookmarkPending =
    addBookmarkMutation.isPending || removeBookmarkMutation.isPending

  return (
    <>
      <div
        className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-3'}
        data-problem-key={problemKey(problem)}
      >
        {evidenceSource !== undefined ? (
          <p className="text-xs text-muted-foreground">
            {evidenceSource === 'manual'
              ? 'Marked by you'
              : 'Confirmed on linked public Codeforces profile'}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Status for {problem.externalId}</span>
            <select
              aria-label={`Status for ${problem.externalId}`}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              disabled={statusMutation.isPending}
              onChange={(event) =>
                void handleStatusChange(
                  event.target.value as LearnerProblemStatus,
                )
              }
              value={status}
            >
              {(Object.keys(statusLabels) as LearnerProblemStatus[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ),
              )}
            </select>
          </label>
          {statusMutation.isPending ? (
            <span className="text-xs text-muted-foreground" role="status">
              Saving status…
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            aria-pressed={bookmarked}
            disabled={bookmarkPending}
            onClick={() => void toggleBookmark()}
            size="sm"
            type="button"
            variant={bookmarked ? 'secondary' : 'outline'}
          >
            {bookmarked ? (
              <BookmarkCheck aria-hidden="true" />
            ) : (
              <Bookmark aria-hidden="true" />
            )}
            <span>{bookmarked ? 'Saved' : 'Bookmark'}</span>
          </Button>
        </div>

        <TimerControls
          key={currentProblemKey}
          problem={problem}
          compact={compact}
        />
      </div>

      <ReflectionDialog
        isSaving={reflectionMutation.isPending}
        onClose={closeReflection}
        onSave={saveReflection}
        open={reflectionOpen}
        problemLabel={problem.externalId}
      />
    </>
  )
}

function TimerControls({
  problem,
  compact,
}: {
  problem: ProblemReference
  compact: boolean
}) {
  const { notify } = useNotification()
  const {
    elapsedSeconds,
    isMutating,
    pause,
    resolve,
    retry,
    start,
    timer,
    timerError,
  } = useTimer()
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  const ownTimer = timerProblemMatches(timer, problem)
  const anotherTimer = timer !== null && !ownTimer && timer.state === 'running'
  const visibleSeconds = ownTimer ? elapsedSeconds : 0
  const currentTimerError =
    timer !== null &&
    timerError?.timerId === timer.id &&
    (ownTimer || anotherTimer)
      ? timerError
      : null

  async function startTimer() {
    try {
      await start(problem, confirmSwitch)
      setConfirmSwitch(false)
    } catch (error) {
      notify({
        title: 'Timer was not started',
        description:
          error instanceof Error
            ? error.message
            : 'Another timer may already be running.',
        tone: 'error',
      })
    }
  }

  async function pauseTimer() {
    try {
      await pause()
    } catch (error) {
      notify({
        title: 'Timer was not paused',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  async function resolveTimer(resolution: 'complete' | 'discard') {
    try {
      await resolve(resolution)
    } catch (error) {
      notify({
        title:
          resolution === 'complete'
            ? 'Time was not saved'
            : 'Timer was not discarded',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  async function retryTimer() {
    try {
      await retry()
    } catch (error) {
      notify({
        title: 'Timer retry failed',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  function timerErrorNotice() {
    if (currentTimerError === null) return null

    return (
      <div
        className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        role="alert"
      >
        <span className="max-w-full break-words">
          {currentTimerError.message}
        </span>
        <Button
          disabled={isMutating}
          onClick={() => void retryTimer()}
          size="xs"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  if (anotherTimer && !confirmSwitch) {
    return (
      <div className="space-y-2">
        {timerErrorNotice()}
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-50">
          <span className="max-w-full break-words">
            A timer is running for {timer.problem.externalId}.
          </span>
          <Button
            disabled={isMutating}
            onClick={() => setConfirmSwitch(true)}
            size="xs"
            type="button"
            variant="outline"
          >
            Switch timer
          </Button>
        </div>
      </div>
    )
  }

  if (anotherTimer && confirmSwitch) {
    return (
      <div className="space-y-2">
        {timerErrorNotice()}
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-50">
          <span>Pause the other timer and start here?</span>
          <Button
            disabled={isMutating}
            onClick={() => void startTimer()}
            size="xs"
            type="button"
          >
            Confirm
          </Button>
          <Button
            onClick={() => setConfirmSwitch(false)}
            size="xs"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (
    !ownTimer ||
    timer === null ||
    timer.state === 'completed' ||
    timer.state === 'discarded'
  ) {
    return (
      <div className="space-y-2">
        {timerErrorNotice()}
        <Button
          disabled={isMutating}
          onClick={() => void startTimer()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Play aria-hidden="true" />
          Start timer
        </Button>
      </div>
    )
  }

  if (timer.state === 'running') {
    return (
      <div className="space-y-2">
        {timerErrorNotice()}
        <div
          className={
            compact
              ? 'flex flex-wrap items-center gap-2'
              : 'flex flex-wrap items-center gap-2'
          }
        >
          <span
            className="font-mono text-sm tabular-nums text-foreground"
            role="timer"
          >
            {formatTimerDuration(visibleSeconds)}
          </span>
          <Button
            disabled={isMutating}
            onClick={() => void pauseTimer()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Pause aria-hidden="true" />
            Pause
          </Button>
        </div>
      </div>
    )
  }

  if (timer.requiresResolution || timer.state === 'capped') {
    return (
      <div className="space-y-2">
        {timerErrorNotice()}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {timer.state === 'capped' ? '4-hour cap reached' : 'Paused'}
          </span>
          <Button
            disabled={isMutating}
            onClick={() => void resolveTimer('complete')}
            size="sm"
            type="button"
          >
            <Save aria-hidden="true" />
            Save time
          </Button>
          <Button
            disabled={isMutating}
            onClick={() => void resolveTimer('discard')}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
            Discard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {timerErrorNotice()}
      <Button
        disabled={isMutating}
        onClick={() => void startTimer()}
        size="sm"
        type="button"
        variant="outline"
      >
        <Play aria-hidden="true" />
        Resume timer
      </Button>
    </div>
  )
}
