import { useId, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { RecommendationSteering } from '@algomemtor/shared-contracts'

import {
  ArrowUp,
  Brain,
  MessageCircle,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from '@/components/icons/algo-icons'
import { useNotification } from '@/app/useNotification'
import { useTypedExample } from '@/lib/use-typed-example'
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

const applySteps = [
  { label: 'You ask', icon: MessageCircle },
  { label: 'Picks re-rank', icon: SlidersHorizontal },
  { label: 'Remembered', icon: Brain },
] as const

// What happens to a request, as three stops with a dot travelling between.
function ApplyFlow({ busy }: { busy: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <ol
      aria-label="What happens to your request"
      className="mt-auto flex items-center gap-2 pt-5"
    >
      {applySteps.map((step, index) => {
        const Icon = step.icon
        return (
          <li
            className="flex min-w-0 flex-1 items-center gap-2"
            key={step.label}
          >
            <span className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background/60 px-2.5 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-acc-soft text-acc-ink">
                <Icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="sr-only truncate text-xs font-medium text-foreground sm:not-sr-only">
                {step.label}
              </span>
            </span>
            {index < applySteps.length - 1 ? (
              <span
                aria-hidden="true"
                className="relative h-px min-w-4 flex-1 bg-border"
              >
                {reduceMotion ? null : (
                  <motion.span
                    animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
                    className="absolute -top-[3px] size-[7px] rounded-full bg-acc shadow-[0_0_8px_var(--acc)]"
                    transition={{
                      duration: busy ? 0.7 : 1.8,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: index * (busy ? 0.35 : 0.9),
                    }}
                  />
                )}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

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
  const reduceMotion = useReducedMotion()
  const typing = !reduceMotion && text === '' && !save.isPending
  const typed = useTypedExample(examples, typing)

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
      className="relative isolate flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 -z-10 size-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_22%,transparent),transparent)] blur-2xl"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative grid size-10 shrink-0 place-items-center">
            {reduceMotion ? null : (
              <motion.span
                animate={{ rotate: 360 }}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--acc),transparent_40%,var(--acc-2),transparent_80%,var(--acc))] p-[2px] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]"
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              />
            )}
            <span className="grid size-8 place-items-center rounded-full bg-acc text-white [--icon-node:#fff] dark:text-[#0b0c0e] dark:[--icon-node:#0b0c0e]">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
            </span>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Shape your picks
            </h2>
            <p className="text-xs text-muted-foreground">
              Platforms, topics or ratings to want or skip.
            </p>
          </div>
        </div>
        {!expanded ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--acc)_35%,var(--border))] bg-acc-soft py-1 pr-1 pl-2.5 text-xs text-acc-ink"
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
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
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
        <form className="mt-4" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>
            What kind of problems do you want?
          </label>
          <div
            className={cn(
              'relative flex items-center gap-2 rounded-2xl border border-input bg-background py-2 pr-2 pl-3.5 transition-[border-color,box-shadow] focus-within:border-acc focus-within:ring-4 focus-within:ring-[color-mix(in_oklab,var(--acc)_18%,transparent)]',
              save.isPending && 'opacity-80',
            )}
          >
            <Sparkles aria-hidden="true" className="size-4 shrink-0 text-acc" />
            {typing ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-10 truncate text-base text-muted-foreground sm:text-sm"
              >
                {typed}
                <span className="blink-caret ml-px inline-block h-4 w-px translate-y-0.5 bg-acc" />
              </span>
            ) : null}
            <input
              autoComplete="off"
              className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
              disabled={save.isPending}
              id={inputId}
              maxLength={MAX_LENGTH}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && instructions.length > 0) {
                  setOpen(false)
                }
              }}
              placeholder={
                typing
                  ? ''
                  : 'e.g. no LeetCode, more DP around 1600, skip Sereja and Brackets'
              }
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
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-acc text-white transition-[opacity,transform] hover:scale-105 hover:opacity-90 disabled:opacity-40 dark:text-[#0b0c0e]"
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
            <div className="mt-4">
              <p className="text-[0.68rem] font-medium text-muted-foreground">
                Try one
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {examples.map((example, index) => (
                  <motion.button
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-[border-color,color,transform] hover:-translate-y-0.5 hover:border-acc hover:text-foreground"
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    key={example}
                    transition={{ delay: 0.05 * index }}
                    onClick={() => {
                      setText(example)
                      inputRef.current?.focus()
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" className="size-3" />
                    {example}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </form>
      ) : null}

      <ApplyFlow busy={save.isPending} />
    </section>
  )
}
