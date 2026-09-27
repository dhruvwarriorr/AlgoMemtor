import { memo, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { CoachMessage } from '@algomemtor/shared-contracts'

import {
  ArrowUpRight,
  LoaderCircle,
  ScanSearch,
  Send,
  X,
} from '@/components/icons/algo-icons'
import { useNotification } from '@/app/useNotification'
import { useAuth } from '@/features/auth/useAuth'
import { featureRedirects } from '@/features/coach/answer-details'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import {
  useCoachConversation,
  useCreateCoachConversation,
  useSendCoachMessage,
} from '@/features/coach/hooks'
import { ApiClientError } from '@/features/discovery/api/client'
import { mentorTools, mentorToolPath } from '@/features/mentor/feature-routes'
import { cn } from '@/lib/utils'

import { MelloSprite } from './MelloSprite'
import type { Pet } from './pets'
import {
  composePageContext,
  readPageSnapshot,
  wantsPageContext,
} from './page-context'

const conversationKey = (userId: string) =>
  `algomemtor-mello-conversation:${userId}`

function readStoredId(userId: string | undefined) {
  if (!userId) return null
  try {
    return window.localStorage.getItem(conversationKey(userId))
  } catch {
    return null
  }
}

function storeId(userId: string, id: string) {
  try {
    window.localStorage.setItem(conversationKey(userId), id)
  } catch {
    // Without storage the pet starts a fresh thread next visit.
  }
}

const suggestions = [
  'Explain what is on this page',
  'What should I do next here?',
  'Give me a hint for what I am looking at',
]

function isAbort(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function Reply({ message }: { message: CoachMessage }) {
  return (
    <div className="min-w-0 text-[13px] leading-5 [&>div]:mt-0 [&_li]:leading-5 [&_p]:leading-5">
      <CoachMessageContent content={message.content} role="assistant" />
      {featureRedirects(message).map((block) => {
        const tool = mentorTools[block.feature]
        return (
          <Link
            className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={block.feature}
            to={mentorToolPath(block.feature, block.problemUrl)}
          >
            <tool.icon aria-hidden="true" className="size-4 text-primary" />
            Open {tool.label}
            <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5" />
          </Link>
        )
      })}
    </div>
  )
}

export const MelloChatPanel = memo(function MelloChatPanel({
  pet,
  onClose,
  onHide,
}: {
  pet: Pet
  onClose: () => void
  onHide: () => void
}) {
  const { user } = useAuth()
  const { notify } = useNotification()
  const [storedId, setStoredId] = useState(() => readStoredId(user?.id))
  const conversation = useCoachConversation(storedId)
  // A thread deleted from the Coach page is replaced on the next question.
  const missing =
    conversation.error instanceof ApiClientError &&
    conversation.error.status === 404
  const conversationId = missing ? null : storedId
  const createConversation = useCreateCoachConversation()
  const sendMessage = useSendCoachMessage()
  const [draft, setDraft] = useState('')
  const [readPage, setReadPage] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const messages = conversation.data?.messages ?? []
  // A refetch mid-answer can already hold the saved question; show it once.
  const lastMessage = messages.at(-1)
  const pendingQuestion =
    sendMessage.isPending &&
    !(
      lastMessage?.role === 'user' &&
      lastMessage.content.trim() === sendMessage.variables.content.trim()
    )
      ? sendMessage.variables.content
      : null

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    // Scroll only the thread; scrollIntoView would drag the page along.
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [messages.length, pendingQuestion])

  async function ask(question: string) {
    const content = question.trim()
    if (!content || sendMessage.isPending || !user) return
    setDraft('')
    try {
      const transientContext =
        readPage && wantsPageContext(content)
          ? composePageContext(readPageSnapshot())
          : undefined
      let id = conversationId
      if (id === null) {
        const created = await createConversation.mutateAsync({
          title: pet.name,
        })
        id = created.data.id
        storeId(user.id, id)
        setStoredId(id)
      }
      const controller = new AbortController()
      abortRef.current = controller
      await sendMessage.mutateAsync({
        conversationId: id,
        content,
        transientContext,
        signal: controller.signal,
      })
    } catch (error) {
      setDraft((current) => current || content)
      if (isAbort(error)) return
      notify({
        title: `${pet.name} could not answer`,
        description:
          error instanceof Error ? error.message : 'Try again shortly.',
        tone: 'error',
      })
    } finally {
      abortRef.current = null
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void ask(draft)
  }

  return (
    <section
      aria-label={`${pet.name}, your coach`}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      data-mello-ignore
    >
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
        <div className="relative size-9 shrink-0 overflow-hidden rounded-full border border-border bg-[#141a2e]">
          <MelloSprite
            className="absolute -top-2.5 -left-12"
            clips={pet.clips}
            state="idle"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{pet.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            Right here on this page
          </p>
        </div>
        <Link
          aria-label="Open this chat in Coach"
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          title="Open in Coach"
          to="/coach"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
        <button
          aria-label={`Close ${pet.name}`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>

      <div
        aria-live="polite"
        ref={threadRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {conversation.isPending && conversationId !== null ? (
          <p className="text-sm text-muted-foreground">Loading your chat…</p>
        ) : null}
        {messages.length === 0 && !sendMessage.isPending ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-foreground">
              Hi, I&apos;m {pet.name}! Ask me anything. I read the page you are
              on, so you can just say &ldquo;this&rdquo;.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={suggestion}
                  onClick={() => void ask(suggestion)}
                  type="button"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.slice(-30).map((message) =>
          message.role === 'user' ? (
            <p
              className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[13px] whitespace-pre-wrap text-primary-foreground"
              key={message.id}
            >
              {message.content}
            </p>
          ) : (
            <Reply key={message.id} message={message} />
          ),
        )}
        {pendingQuestion !== null ? (
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[13px] whitespace-pre-wrap text-primary-foreground">
            {pendingQuestion}
          </p>
        ) : null}
        {sendMessage.isPending ? (
          <>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              {sendMessage.variables?.transientContext
                ? `${pet.name} is reading this page and thinking…`
                : `${pet.name} is thinking…`}
            </p>
          </>
        ) : null}
      </div>

      <form className="border-t border-border bg-card p-3" onSubmit={submit}>
        <label className="sr-only" htmlFor="mello-question">
          Ask {pet.name}
        </label>
        <textarea
          className="block max-h-28 min-h-9 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          id="mello-question"
          maxLength={8000}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void ask(draft)
            }
          }}
          placeholder="Ask about this page…"
          ref={inputRef}
          rows={1}
          value={draft}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            aria-pressed={readPage}
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              readPage
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground',
            )}
            onClick={() => setReadPage((value) => !value)}
            title={
              readPage
                ? `${pet.name} sends this page’s visible text with your question. It is not saved.`
                : `${pet.name} will not read this page.`
            }
            type="button"
          >
            <ScanSearch aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">
              {readPage ? 'Reads this page' : 'Page reading off'}
            </span>
          </button>
          <button
            className="ml-auto shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={onHide}
            type="button"
          >
            Hide {pet.name}
          </button>
          {sendMessage.isPending ? (
            <button
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => abortRef.current?.abort()}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">Stop</span>
            </button>
          ) : (
            <button
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!draft.trim()}
              type="submit"
            >
              <Send aria-hidden="true" className="size-4" />
              <span className="sr-only">Send</span>
            </button>
          )}
        </div>
      </form>
    </section>
  )
})
