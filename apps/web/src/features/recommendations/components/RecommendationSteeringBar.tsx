import { useId, useRef, useState, type FormEvent } from 'react'
import type { RecommendationSteering } from '@algomemtor/shared-contracts'

import {
  ArrowUp,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from '@/components/icons/algo-icons'
import { useNotification } from '@/app/useNotification'
import {
  useRecommendationSteering,
  useRemoveRecommendationSteering,
  useSaveRecommendationSteering,
} from '@/features/recommendations/hooks/useRecommendations'
import { cn } from '@/lib/utils'

const MAX_LENGTH = 500

const examples = [
  'No LeetCode problems',
  'More DP around 1600',
  'Only Codeforces',
  'These are too easy',
  'Skip geometry',
]

function instructionLabel(item: RecommendationSteering) {
  return item.applied.length > 0 ? item.applied.join(' · ') : item.text
}

// A chat-style bar where the learner tells AlgoMemtor what they want from
// their picks. Sending regenerates the feed; the bar then folds into the
// list of active instructions, each removable.
export function RecommendationSteeringBar() {
  const { notify } = useNotification()
  const steeringQuery = useRecommendationSteering()
  const save = useSaveRecommendationSteering()
  const remove = useRemoveRecommendationSteering()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const [text, setText] = useState('')
  // Open by default until the learner has saved an instruction.
  const [open, setOpen] = useState<boolean | null>(null)

  const instructions = steeringQuery.data?.data ?? []
  const expanded =
    save.isPending ||
    (open ?? (steeringQuery.isSuccess && instructions.length === 0))

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const value = text.trim()
    if (value === '' || save.isPending) return
    save.mutate(value, {
      onSuccess: (response) => {
        const { steering } = response.data
        setText('')
        setOpen(false)
        notify({
          title: 'Recommendations updated',
          description: [
            steering.applied.length > 0
              ? steering.applied.join(' · ')
              : 'Saved as guidance for how your problems are ranked.',
            steering.savedToMemory
              ? 'Also saved to your coach memory.'
              : 'Saved as recommendation guidance for this account.',
          ].join(' '),
          tone: 'success',
        })
      },
      onError: (error) => {
        notify({
          title: 'Your request was not applied',
          description:
            error instanceof Error
              ? error.message
              : 'Please try again in a moment.',
          tone: 'error',
        })
      },
    })
  }

  function removeInstruction(item: RecommendationSteering) {
    remove.mutate(item.id, {
      onSuccess: () =>
        notify({
          title: 'Instruction removed',
          description: `“${item.text.slice(0, 80)}” no longer shapes your picks.`,
          tone: 'info',
        }),
      onError: (error) =>
        notify({
          title: 'Instruction was not removed',
          description:
            error instanceof Error
              ? error.message
              : 'Please try again in a moment.',
          tone: 'error',
        }),
    })
  }

  return (
    <section
      aria-label="Tell AlgoMemtor what you want"
      className="animate-rise min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <SlidersHorizontal aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              Shape your picks
            </h2>
            <p className="text-xs text-muted-foreground">
              Say which platforms, topics or ratings you want or want to skip.
            </p>
          </div>
        </div>
        {!expanded ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setOpen(true)
              window.requestAnimationFrame(() => inputRef.current?.focus())
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            {instructions.length > 0
              ? 'Add instruction'
              : 'Tell us what you want'}
          </button>
        ) : null}
      </div>

      {instructions.length > 0 ? (
        <ul
          aria-label="Active instructions"
          className="mt-3 flex flex-wrap gap-2"
        >
          {instructions.map((item) => (
            <li
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-secondary/60 py-1 pr-1 pl-2.5 text-xs text-foreground"
              key={item.id}
              title={item.text}
            >
              <Sparkles
                aria-hidden="true"
                className="size-3 shrink-0 text-primary"
              />
              <span className="min-w-0 truncate">{instructionLabel(item)}</span>
              <button
                aria-label={`Remove instruction: ${item.text}`}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => removeInstruction(item)}
                type="button"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {expanded ? (
        <form className="mt-3" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>
            What kind of problems do you want?
          </label>
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl border border-input bg-background py-1.5 pr-1.5 pl-3.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15',
              save.isPending && 'opacity-80',
            )}
          >
            <input
              autoComplete="off"
              className="h-9 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
              disabled={save.isPending}
              id={inputId}
              maxLength={MAX_LENGTH}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && instructions.length > 0) {
                  setOpen(false)
                }
              }}
              placeholder="e.g. no LeetCode, more DP around 1600, skip Sereja and Brackets"
              ref={inputRef}
              value={text}
            />
            {instructions.length > 0 && !save.isPending ? (
              <button
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            <button
              aria-label={save.isPending ? 'Updating your picks' : 'Apply'}
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              disabled={text.trim() === '' || save.isPending}
              type="submit"
            >
              {save.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <ArrowUp aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          {save.isPending ? (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              Updating your picks and saving this to memory…
            </p>
          ) : (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <button
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] hover:text-foreground"
                  key={example}
                  onClick={() => {
                    setText(example)
                    inputRef.current?.focus()
                  }}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </form>
      ) : null}
    </section>
  )
}
