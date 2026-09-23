import { useState } from 'react'

import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'

import {
  useCorrectLearnerMemory,
  useLearnerMemories,
  useLearnerMemoryAction,
} from '../hooks/useLearnerMemories'
import type { LearnerMemory, LearnerMemoryCategory } from '../contracts'

const categoryLabels: Record<string, string> = {
  preference: 'Preference',
  difficulty_calibration: 'Difficulty calibration',
  topic_weakness: 'Topic weakness',
  scheduling_preference: 'Scheduling preference',
  recommendation_feedback_pattern: 'Recommendation feedback pattern',
  learning_goal: 'Learning goal',
  topic_strength: 'Topic strength',
  coding_style: 'Coding style',
  problem_solving_approach: 'Problem-solving approach',
  learning_pace: 'Learning pace',
  time_availability: 'Time availability',
  mistake_pattern: 'Mistake pattern',
  contest_performance: 'Contest performance',
  explanation_preference: 'Explanation preference',
  communication_preference: 'Communication preference',
  user_instruction: 'User instruction',
  conversation_summary: 'Conversation summary',
  learning_milestone: 'Learning milestone',
  bloom_level: 'Bloom level',
  spaced_repetition_state: 'Spaced repetition state',
}

const categories = Object.keys(categoryLabels) as LearnerMemoryCategory[]

function MemoryEditor({
  memory,
  isSaving,
  onCancel,
  onSave,
}: {
  memory: LearnerMemory
  isSaving: boolean
  onCancel: () => void
  onSave: (input: {
    text: string
    category: LearnerMemoryCategory
  }) => Promise<void>
}) {
  const [text, setText] = useState(memory.text)
  const [category, setCategory] = useState(memory.category)

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave({ text, category })
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium text-foreground">
        Memory text
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 py-2 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
          disabled={isSaving}
          maxLength={500}
          onChange={(event) => setText(event.currentTarget.value)}
          required
          value={text}
        />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-foreground">
        Category
        <select
          className="h-10 w-full rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
          disabled={isSaving}
          onChange={(event) =>
            setCategory(event.currentTarget.value as LearnerMemoryCategory)
          }
          value={category}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {categoryLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={isSaving}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button disabled={isSaving || text.trim().length === 0} type="submit">
          {isSaving ? 'Saving…' : 'Save correction'}
        </Button>
      </div>
    </form>
  )
}

function memoryActionLabel(memory: LearnerMemory) {
  if (memory.status === 'proposed') return 'Approve'
  if (memory.status === 'active') return 'Archive'
  return 'Restore'
}

export function LearnerMemoryPanel() {
  const { notify } = useNotification()
  const memoriesQuery = useLearnerMemories()
  const actionMutation = useLearnerMemoryAction()
  const correctionMutation = useCorrectLearnerMemory()
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)

  function act(
    memory: LearnerMemory,
    action: 'approve' | 'archive' | 'restore' | 'delete',
  ) {
    actionMutation.mutate(
      { memoryId: memory.id, action },
      {
        onSuccess: () => {
          notify({
            title: action === 'delete' ? 'Memory deleted' : 'Memory updated',
            description: 'Your memory controls were saved.',
            tone: 'success',
          })
        },
        onError: (error) => {
          notify({
            title: 'Memory was not updated',
            description:
              error instanceof Error ? error.message : 'Please try again.',
            tone: 'error',
          })
        },
      },
    )
  }

  async function correct(
    memoryId: string,
    input: {
      text: string
      category: LearnerMemoryCategory
    },
  ) {
    try {
      await correctionMutation.mutateAsync({ memoryId, input })
      setEditingMemoryId(null)
      notify({
        title: 'Memory corrected',
        description: 'Future recommendations can use your correction.',
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'Memory was not corrected',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      })
    }
  }

  if (memoriesQuery.isPending) {
    return <PageSkeleton label="Loading learner memory" rows={3} />
  }

  if (memoriesQuery.isError) {
    return (
      <ErrorState
        message={
          memoriesQuery.error instanceof Error
            ? memoriesQuery.error.message
            : 'Learner memory could not be loaded.'
        }
        onRetry={() => void memoriesQuery.refetch()}
        title="Memory unavailable"
      />
    )
  }

  const memories = memoriesQuery.data.data

  if (memories.length === 0) {
    const pendingJobs = memoriesQuery.data.meta.pendingJobs
    return (
      <div className="space-y-3">
        {pendingJobs > 0 ? (
          <p
            className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            role="status"
          >
            {pendingJobs} memory job{pendingJobs === 1 ? '' : 's'} are being
            processed.
          </p>
        ) : null}
        <EmptyState
          description={
            pendingJobs > 0
              ? 'Your eligible notes and progress are still being processed. Check back shortly.'
              : 'Memory will appear after eligible reflections, progress, or recommendation feedback are processed.'
          }
          title={
            pendingJobs > 0 ? 'Memory is processing' : 'No learner memory yet'
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {memoriesQuery.data.meta.pendingJobs > 0 ? (
        <p
          className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
          role="status"
        >
          {memoriesQuery.data.meta.pendingJobs} memory job
          {memoriesQuery.data.meta.pendingJobs === 1 ? '' : 's'} are being
          processed.
        </p>
      ) : null}
      <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
        {memories.map((memory) => {
          const isActing =
            actionMutation.isPending &&
            actionMutation.variables?.memoryId === memory.id
          const isEditing = editingMemoryId === memory.id

          return (
            <li
              className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
              key={memory.id}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {categoryLabels[memory.category]}
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-foreground">
                    {memory.text}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
                  {memory.status}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Confidence {Math.round(memory.confidence * 100)}% ·{' '}
                {memory.evidenceCount} evidence item
                {memory.evidenceCount === 1 ? '' : 's'}
              </p>
              {isEditing ? (
                <MemoryEditor
                  isSaving={correctionMutation.isPending}
                  memory={memory}
                  onCancel={() => setEditingMemoryId(null)}
                  onSave={(input) => correct(memory.id, input)}
                />
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={isActing || correctionMutation.isPending}
                    onClick={() => setEditingMemoryId(memory.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Correct
                  </Button>
                  <Button
                    disabled={isActing || correctionMutation.isPending}
                    onClick={() =>
                      act(
                        memory,
                        memory.status === 'proposed'
                          ? 'approve'
                          : memory.status === 'active'
                            ? 'archive'
                            : 'restore',
                      )
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isActing ? 'Saving…' : memoryActionLabel(memory)}
                  </Button>
                  <Button
                    disabled={isActing || correctionMutation.isPending}
                    onClick={() => act(memory, 'delete')}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
