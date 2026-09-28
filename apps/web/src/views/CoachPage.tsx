import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation } from '@/lib/router'
import type { ProviderKey } from '@algomemtor/shared-contracts'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Code2,
  CornerDownLeft,
  Lock,
  Crosshair,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from '@/components/icons/algo-icons'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useUserIdentity } from '@/features/auth/user-identity'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TetrisLoader } from '@/components/motion/TetrisLoader'
import { useNotification } from '@/providers/useNotification'
import {
  useCoachConversation,
  useCoachConversations,
  useCoachRoadmap,
  useConfirmCoachAction,
  useCreateCoachConversation,
  useDeleteCoachConversation,
  useRenameCoachConversation,
  useSendCoachMessage,
} from '@/features/coach/hooks'
import { cn } from '@/lib/utils'
import { CoachAnswerPanel } from '@/features/coach/components/CoachAnswerPanel'
import {
  answerDetails,
  answerDetailsSummary,
  coachCodeBlockId,
  featureRedirects,
} from '@/features/coach/answer-details'
import { mentorToolPath, mentorTools } from '@/features/mentor/feature-routes'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import {
  useDismissProblem,
  useRecommendationDismissals,
} from '@/features/recommendations/hooks/useRecommendations'
import { useCoachName } from '@/features/pet/pet-preference'

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const sidebarModeKey = 'algomemtor.coach.sidebar'
const detailsVisibleKey = 'algomemtor.coach.details'

// A panel icon: a frame with its side column, filled when the panel shows.
function PanelIcon({ side, open }: { side: 'left' | 'right'; open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
    >
      <rect height={16} rx={3} width={18} x={3} y={4} />
      <path d={side === 'left' ? 'M9 4v16' : 'M15 4v16'} />
      {open ? (
        <rect
          fill="currentColor"
          height={16}
          opacity={0.25}
          stroke="none"
          width={6}
          x={side === 'left' ? 3 : 15}
          y={4}
        />
      ) : null}
    </svg>
  )
}

function CoachPage() {
  const coachName = useCoachName()
  const conversationsQuery = useCoachConversations()
  const roadmapQuery = useCoachRoadmap()
  const createConversation = useCreateCoachConversation()
  const renameConversation = useRenameCoachConversation()
  const deleteConversation = useDeleteCoachConversation()
  const sendMessage = useSendCoachMessage()
  const dismissProblem = useDismissProblem()
  const dismissalsQuery = useRecommendationDismissals()
  const confirmAction = useConfirmCoachAction()
  const { notify } = useNotification()
  const identity = useUserIdentity()
  const location = useLocation()
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null)
  const [content, setContent] = useState(
    () => (location.state as { ask?: string } | null)?.ask ?? '',
  )
  const [transientContext, setTransientContext] = useState('')
  // Conversation sidebar: full list, a slim icon rail, or hidden. The
  // choice is a per-browser convenience.
  const [sidebarMode, setSidebarModeState] = useState<
    'expanded' | 'rail' | 'hidden'
  >(() => {
    try {
      const saved = window.localStorage.getItem(sidebarModeKey)
      return saved === 'rail' || saved === 'hidden' ? saved : 'expanded'
    } catch {
      return 'expanded'
    }
  })
  const setSidebarMode = (mode: 'expanded' | 'rail' | 'hidden') => {
    setSidebarModeState(mode)
    try {
      window.localStorage.setItem(sidebarModeKey, mode)
    } catch {
      // Storage can be unavailable; the choice lasts for this visit.
    }
  }
  const sidebarExpanded = sidebarMode === 'expanded'
  const [detailsVisible, setDetailsVisibleState] = useState(() => {
    try {
      return window.localStorage.getItem(detailsVisibleKey) !== 'false'
    } catch {
      return true
    }
  })
  const setDetailsVisible = (visible: boolean) => {
    setDetailsVisibleState(visible)
    try {
      window.localStorage.setItem(detailsVisibleKey, String(visible))
    } catch {
      // Storage can be unavailable; the choice lasts for this visit.
    }
  }
  const [search, setSearch] = useState('')
  const [showContext, setShowContext] = useState(false)
  const [isDraft, setIsDraft] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const sendAbortController = useRef<AbortController | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const nearPageBottomRef = useRef(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  // The answer whose problems, code and sources fill the side panel; null
  // follows the latest answer.
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null)
  const [highlightedCode, setHighlightedCode] = useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const selectConversation = (conversationId: string | null) => {
    nearPageBottomRef.current = true
    setShowJumpToLatest(false)
    setIsDraft(false)
    setSelectedAnswerId(null)
    setSelectedConversationId(conversationId)
  }

  function startNewChat() {
    nearPageBottomRef.current = true
    setShowJumpToLatest(false)
    setSelectedAnswerId(null)
    setIsDraft(true)
    setContent('')
  }

  const conversations = useMemo(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data?.data],
  )
  const activeConversationId = isDraft
    ? null
    : conversations.some((item) => item.id === selectedConversationId)
      ? selectedConversationId
      : (conversations[0]?.id ?? null)
  const conversationQuery = useCoachConversation(activeConversationId)
  useEffect(() => {
    if (conversationQuery.isPending || !nearPageBottomRef.current) return
    const frame = window.requestAnimationFrame(() => {
      messagesScrollRef.current?.scrollTo({
        behavior: 'smooth',
        top: messagesScrollRef.current.scrollHeight,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    activeConversationId,
    conversationQuery.data?.messages.length,
    conversationQuery.isPending,
    sendMessage.isPending,
  ])

  async function ensureConversation() {
    if (activeConversationId !== null) return activeConversationId
    const created = await createConversation.mutateAsync({})
    selectConversation(created.data.id)
    return created.data.id
  }

  async function submitMessage(message = content) {
    const trimmed = message.trim()
    if (!trimmed || sendMessage.isPending) return
    // Clear the composer straight away so the question moves into the
    // thread; put it back if the send fails or is cancelled.
    const draft = { content, transientContext }
    setContent('')
    setTransientContext('')
    setSelectedAnswerId(null)
    try {
      const conversationId = await ensureConversation()
      const controller = new AbortController()
      sendAbortController.current = controller
      await sendMessage.mutateAsync({
        conversationId,
        content: trimmed,
        transientContext: transientContext.trim() || undefined,
        signal: controller.signal,
      })
    } catch (error) {
      setContent((current) => current || draft.content || message)
      setTransientContext((current) => current || draft.transientContext)
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof Error && error.name === 'AbortError') return
      notify({
        title: `${coachName} could not respond`,
        description:
          error instanceof Error ? error.message : 'Try again shortly.',
        tone: 'error',
      })
    } finally {
      sendAbortController.current = null
    }
  }

  if (conversationsQuery.isPending || roadmapQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader
          description="A persistent CP/DSA tutor grounded in your profile, progress, and provider evidence."
          title={coachName}
        />
        <PageSkeleton label={`Loading ${coachName}`} rows={6} />
      </PageContainer>
    )
  }

  if (conversationsQuery.isError || roadmapQuery.isError) {
    return (
      <PageContainer>
        <PageHeader
          description="A persistent CP/DSA tutor grounded in your profile, progress, and provider evidence."
          title={coachName}
        />
        <ErrorState
          message={`${coachName} could not load your context.`}
          onRetry={() => {
            void conversationsQuery.refetch()
            void roadmapQuery.refetch()
          }}
          title={`${coachName} is unavailable`}
        />
      </PageContainer>
    )
  }

  const hasConversation = activeConversationId !== null
  const messages = hasConversation
    ? (conversationQuery.data?.messages ?? [])
    : []
  // The question being sent, shown in the thread before the reply arrives.
  // The server saves the question before answering, so a refetch while the
  // reply is pending can already hold it; then the saved copy is shown alone.
  const lastMessage = messages.at(-1)
  const pendingQuestion =
    sendMessage.isPending &&
    sendMessage.variables?.conversationId === activeConversationId &&
    !(
      lastMessage?.role === 'user' &&
      lastMessage.content.trim() === sendMessage.variables.content.trim()
    )
      ? sendMessage.variables.content
      : null
  const assistantAnswers = messages.filter(
    (message) => message.role === 'assistant' && message.fallback !== true,
  )
  const selectedAnswer =
    (selectedAnswerId === null
      ? undefined
      : assistantAnswers.find((message) => message.id === selectedAnswerId)) ??
    assistantAnswers.at(-1)
  const selectedDetails = answerDetails(selectedAnswer)
  const dismissedProblemKeys = new Set(
    (dismissalsQuery.data?.data ?? []).map(
      (item) => `${item.provider}:${item.externalId}`,
    ),
  )
  function showAnswerDetails(messageId: string, codeIndex?: number) {
    setSelectedAnswerId(messageId)
    setHighlightedCode(codeIndex ?? null)
    if (!window.matchMedia('(min-width: 80rem)').matches) setDetailsOpen(true)
    if (codeIndex === undefined) return
    window.setTimeout(() => {
      document
        .getElementById(coachCodeBlockId(messageId, codeIndex))
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    window.setTimeout(() => setHighlightedCode(null), 2_400)
  }
  const answerPanelProps = {
    message: selectedAnswer,
    pending: sendMessage.isPending,
    highlightedCode,
    dismissedProblemKeys,
    confirmPending: confirmAction.isPending,
    onDismissProblem: (provider: ProviderKey, externalId: string) =>
      dismissProblem.mutate({ provider, externalId }),
    onConfirmProposal: (proposalId: string) =>
      void confirmAction.mutateAsync(proposalId),
  }
  const showGreeting =
    pendingQuestion === null &&
    (!hasConversation ||
      (!conversationQuery.isPending && messages.length === 0))
  const query = search.trim().toLowerCase()
  const filteredConversations = query
    ? conversations.filter((item) => item.title.toLowerCase().includes(query))
    : conversations
  const activeTitle = hasConversation
    ? (conversationQuery.data?.data.title ?? 'Conversation')
    : 'New conversation'

  const composerForm = (
    <form
      className="w-full rounded-xl border border-border bg-card p-2 shadow-soft transition-[border-color,box-shadow] duration-300 focus-within:border-[color-mix(in_oklab,var(--primary)_45%,var(--border))] focus-within:ring-4 focus-within:ring-ring/10"
      onSubmit={(event) => {
        event.preventDefault()
        void submitMessage()
      }}
    >
      <label className="sr-only" htmlFor="coach-message">
        Ask {coachName}
      </label>
      <textarea
        className="block max-h-48 min-h-20 w-full resize-none bg-transparent px-3 pt-2.5 text-[0.95rem] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
        disabled={sendMessage.isPending}
        id="coach-message"
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submitMessage()
          }
        }}
        placeholder="Ask about your next step, a concept, a failed attempt, or a contest…"
        value={content}
      />
      {showContext ? (
        <textarea
          aria-label="Temporary code or problem context"
          className="mx-1 mt-2 block min-h-24 w-[calc(100%-0.5rem)] resize-y rounded-xl border border-input bg-background p-3 font-mono text-xs leading-5 text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
          disabled={sendMessage.isPending}
          onChange={(event) => setTransientContext(event.target.value)}
          placeholder="Paste only what is needed for this answer. It is omitted from saved history and audits."
          value={transientContext}
        />
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
        <button
          aria-pressed={showContext}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
            showContext || transientContext
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-foreground/70 hover:bg-secondary',
          )}
          disabled={sendMessage.isPending}
          onClick={() => setShowContext((value) => !value)}
          type="button"
        >
          <Code2 aria-hidden="true" className="size-4" strokeWidth={1.7} />
          Code context
        </button>
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground/70 transition-colors hover:bg-secondary"
          title="Step-by-step hints or debugging for a specific problem"
          to="/doubt-helper"
        >
          <Crosshair aria-hidden="true" className="size-4" strokeWidth={1.7} />
          Problem help
        </Link>
        <button
          aria-label={`Ask ${coachName}`}
          className="coach-orb ml-auto grid size-10 place-items-center text-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          disabled={!content.trim() || sendMessage.isPending}
          type="submit"
        >
          {sendMessage.isPending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2.4} />
          )}
        </button>
      </div>
    </form>
  )
  const composer = (
    <div className="w-full rounded-xl bg-secondary/70 p-1.5 ring-1 ring-border/60">
      {composerForm}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 pb-1 text-[0.72rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border border-border bg-card px-1 font-sans">
            <CornerDownLeft aria-hidden="true" className="size-3" />
          </kbd>
          send
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-grid h-5 place-items-center rounded-md border border-border bg-card px-1.5 font-sans">
            Shift ↵
          </kbd>
          new line
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Lock aria-hidden="true" className="size-3" />
          Pasted code is never saved
        </span>
      </div>
    </div>
  )

  return (
    <main
      className="relative flex min-w-0 flex-1 flex-col lg:h-(--app-panel-height) lg:flex-none lg:flex-row lg:overflow-hidden"
      id="main-content"
    >
      {/* History column */}
      <aside
        aria-label="Saved coaching conversations"
        className={cn(
          'flex min-h-0 flex-col gap-4 overflow-hidden border-b border-border p-4 transition-[width,padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:shrink-0 lg:border-r lg:border-b-0 lg:py-5',
          sidebarMode === 'expanded'
            ? 'lg:w-[18.5rem] lg:px-5'
            : sidebarMode === 'rail'
              ? 'lg:w-[4.5rem] lg:px-3'
              : 'lg:hidden',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2.5',
            !sidebarExpanded && 'lg:flex-col',
          )}
        >
          <span aria-hidden="true" className="coach-orb size-9 shrink-0" />
          <div className={cn('min-w-0', !sidebarExpanded && 'lg:hidden')}>
            <h1 className="text-lg leading-tight">{coachName}</h1>
            <p className="truncate text-xs text-muted-foreground">
              Knows your profile and CP journey
            </p>
          </div>
          <button
            aria-expanded={sidebarExpanded}
            aria-label={
              sidebarExpanded
                ? 'Collapse conversation sidebar'
                : 'Expand conversation sidebar'
            }
            className={cn(
              'ml-auto hidden size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid',
              !sidebarExpanded && 'lg:ml-0',
            )}
            onClick={() =>
              setSidebarMode(sidebarExpanded ? 'rail' : 'expanded')
            }
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            type="button"
          >
            {sidebarExpanded ? (
              <ArrowLeft aria-hidden="true" className="size-4" />
            ) : (
              <ArrowRight aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>

        <button
          aria-label="Start a new chat"
          className={cn(
            'flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink text-sm font-medium text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] transition-transform duration-300 active:scale-[0.98]',
            !sidebarExpanded && 'lg:px-0',
          )}
          onClick={startNewChat}
          title={!sidebarExpanded ? 'New chat' : undefined}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          <span className={cn(!sidebarExpanded && 'lg:sr-only')}>New chat</span>
        </button>

        {sidebarExpanded ? (
          <label className="relative hidden lg:block">
            <span className="sr-only">Search conversations</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.7}
            />
            <input
              className="h-10 w-full rounded-md border border-input bg-card pr-3 pl-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              type="search"
              value={search}
            />
          </label>
        ) : null}

        <div
          className={cn(
            'relative hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-border pt-4',
            sidebarExpanded && 'lg:flex',
          )}
        >
          {conversations.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Your conversations appear here. Safe chat text is saved until you
              delete it.
            </p>
          ) : filteredConversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No conversations match “{search}”.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filteredConversations.map((conversation) => {
                const active = activeConversationId === conversation.id
                return (
                  <li className="group/item relative" key={conversation.id}>
                    <button
                      className={cn(
                        'w-full truncate rounded-md py-2 pr-16 pl-2.5 text-left text-sm transition-colors',
                        active
                          ? 'bg-card font-medium text-foreground shadow-soft'
                          : 'text-foreground/75 hover:bg-card/70 hover:text-foreground',
                      )}
                      onClick={() => {
                        selectConversation(conversation.id)
                      }}
                      title={`${conversation.title}, ${conversation.messageCount} messages`}
                      type="button"
                    >
                      {conversation.title}
                    </button>
                    {/* Row actions appear on hover or keyboard focus. */}
                    <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100">
                      <button
                        aria-label={`Rename ${conversation.title}`}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        onClick={() => {
                          setRenameTarget({
                            id: conversation.id,
                            title: conversation.title,
                          })
                          setRenameTitle(conversation.title)
                        }}
                        title="Rename"
                        type="button"
                      >
                        <Pencil
                          aria-hidden="true"
                          className="size-3.5"
                          strokeWidth={1.8}
                        />
                      </button>
                      <button
                        aria-label={`Delete ${conversation.title}`}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-danger-soft hover:text-destructive"
                        onClick={() =>
                          setDeleteTarget({
                            id: conversation.id,
                            title: conversation.title,
                          })
                        }
                        title="Delete"
                        type="button"
                      >
                        <Trash2
                          aria-hidden="true"
                          className="size-3.5"
                          strokeWidth={1.8}
                        />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Workspace */}
      <section
        aria-labelledby="conversation-heading"
        className="flex min-h-[70dvh] min-w-0 flex-1 flex-col lg:min-h-0"
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              aria-label={
                sidebarMode === 'hidden'
                  ? 'Show conversations'
                  : 'Hide conversations'
              }
              aria-pressed={sidebarMode !== 'hidden'}
              className="hidden size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:grid"
              onClick={() =>
                setSidebarMode(sidebarMode === 'hidden' ? 'expanded' : 'hidden')
              }
              title={
                sidebarMode === 'hidden'
                  ? 'Show conversations'
                  : 'Hide conversations'
              }
              type="button"
            >
              <PanelIcon open={sidebarMode !== 'hidden'} side="left" />
            </button>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card py-1 pr-3 pl-1.5 text-xs font-medium text-foreground">
              <span aria-hidden="true" className="coach-orb size-4" />
              {coachName}
            </span>
            <h2
              className="truncate font-sans text-sm font-medium text-foreground"
              id="conversation-heading"
            >
              {activeTitle}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!showGreeting && selectedDetails.hasContent ? (
              <Button
                className="xl:hidden"
                onClick={() => setDetailsOpen(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Sparkles aria-hidden="true" /> Details
              </Button>
            ) : null}
            {!showGreeting && selectedDetails.hasContent ? (
              <button
                aria-label={
                  detailsVisible ? 'Hide answer details' : 'Show answer details'
                }
                aria-pressed={detailsVisible}
                className="hidden size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:grid"
                onClick={() => setDetailsVisible(!detailsVisible)}
                title={
                  detailsVisible ? 'Hide answer details' : 'Show answer details'
                }
                type="button"
              >
                <PanelIcon open={detailsVisible} side="right" />
              </button>
            ) : null}
          </div>
        </header>

        {showGreeting ? (
          <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-6 sm:px-8">
            <div className="my-auto flex w-full max-w-[52rem] flex-col items-center">
              <span
                aria-hidden="true"
                className="coach-orb animate-orb size-16 sm:size-20"
              />
              <p
                className="animate-rise mt-7 text-center font-heading text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[2.4rem]"
                style={{ '--i': 1 } as CSSProperties}
              >
                Hi, {identity.name}! How can I{' '}
                <span className="text-primary">help?</span>
              </p>
              <p
                className="animate-rise mt-3 max-w-xl text-center text-muted-foreground"
                style={{ '--i': 2 } as CSSProperties}
              >
                I know your profiles, solves, contests and progress. Ask me
                anything.
              </p>
              <div
                className="animate-rise mt-8 w-full"
                style={{ '--i': 3 } as CSSProperties}
              >
                {composer}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {/* `relative` keeps the visually hidden message headings
                  (absolutely positioned) inside this scroll box; without it
                  they stretch the whole page below the chat. */}
              <div
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
                onScroll={(event) => {
                  const element = event.currentTarget
                  const nearBottom =
                    element.scrollHeight -
                      element.scrollTop -
                      element.clientHeight <
                    160
                  nearPageBottomRef.current = nearBottom
                  setShowJumpToLatest(!nearBottom)
                }}
                ref={messagesScrollRef}
              >
                <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-7">
                  {conversationQuery.isPending ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Loading conversation…
                    </p>
                  ) : (
                    messages.map((message) =>
                      message.role === 'user' ? (
                        <article
                          className="animate-rise flex flex-col items-end gap-1.5"
                          key={message.id}
                        >
                          <div className="max-w-[80%] rounded-xl rounded-br-md bg-ink px-4 py-2.5 text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.1)]">
                            <h3 className="sr-only">You</h3>
                            <p className="text-[0.95rem] leading-6 whitespace-pre-wrap">
                              {message.content}
                            </p>
                          </div>
                          <time
                            className="px-1 text-[0.7rem] text-muted-foreground"
                            dateTime={message.createdAt}
                          >
                            {formatDate(message.createdAt)}
                            {message.transientContextOmitted
                              ? ' · pasted context not saved'
                              : ''}
                          </time>
                        </article>
                      ) : (
                        <article
                          className="animate-rise flex gap-3"
                          key={message.id}
                        >
                          <span
                            aria-hidden="true"
                            className="coach-orb mt-0.5 size-8 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 text-xs">
                              <h3 className="font-sans text-sm font-semibold text-foreground">
                                {coachName}
                              </h3>
                              <time
                                className="text-muted-foreground"
                                dateTime={message.createdAt}
                              >
                                {formatDate(message.createdAt)}
                              </time>
                            </div>
                            <div className="text-[0.95rem] [&>div]:mt-1.5">
                              <CoachMessageContent
                                content={message.content}
                                onCodeBlock={(index) =>
                                  showAnswerDetails(message.id, index)
                                }
                                role="assistant"
                              />
                            </div>
                            {featureRedirects(message).map((block) => {
                              const Icon = mentorTools[block.feature].icon
                              return (
                                <Link
                                  className="group mt-3 flex max-w-xl items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] bg-card p-3.5 transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  key={block.feature}
                                  to={mentorToolPath(
                                    block.feature,
                                    block.problemUrl,
                                  )}
                                >
                                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                    <Icon
                                      aria-hidden="true"
                                      className="size-5"
                                      strokeWidth={1.8}
                                    />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-foreground">
                                      {block.title}
                                    </span>
                                    <span className="block text-xs leading-5 text-muted-foreground">
                                      {block.description}
                                    </span>
                                  </span>
                                  <span className="hidden shrink-0 items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground sm:inline-flex">
                                    {block.actionLabel}
                                    <ArrowRight
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                  </span>
                                </Link>
                              )
                            })}
                            {message.fallback !== true &&
                            answerDetails(message).hasContent ? (
                              <button
                                aria-pressed={selectedAnswer?.id === message.id}
                                className={cn(
                                  'mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  selectedAnswer?.id === message.id
                                    ? 'border-[color-mix(in_oklab,var(--primary)_45%,var(--border))] text-foreground'
                                    : 'border-border text-muted-foreground',
                                )}
                                onClick={() => showAnswerDetails(message.id)}
                                type="button"
                              >
                                <Sparkles
                                  aria-hidden="true"
                                  className="size-3 shrink-0 text-primary"
                                />
                                <span className="truncate">
                                  {answerDetailsSummary(answerDetails(message))}
                                </span>
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ),
                    )
                  )}
                  {pendingQuestion !== null ? (
                    <article className="animate-rise flex flex-col items-end gap-1.5">
                      <div className="max-w-[80%] rounded-xl rounded-br-md bg-ink px-4 py-2.5 text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.1)]">
                        <h3 className="sr-only">You</h3>
                        <p className="text-[0.95rem] leading-6 whitespace-pre-wrap">
                          {pendingQuestion}
                        </p>
                      </div>
                      <span className="px-1 text-[0.7rem] text-muted-foreground">
                        Sending…
                      </span>
                    </article>
                  ) : null}
                  <div aria-hidden="true" ref={messageEndRef} />
                  {sendMessage.isPending ? (
                    <div className="flex flex-wrap items-start gap-3 text-sm text-muted-foreground">
                      <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-[color-mix(in_oklab,var(--card)_80%,transparent)] px-3 py-2 shadow-soft backdrop-blur-md">
                        <TetrisLoader
                          cellSize={4}
                          gap={1}
                          label="Thinking"
                          rows={6}
                        />
                        <p className="text-xs font-semibold text-foreground">
                          Thinking
                        </p>
                      </div>
                      <Button
                        className="ml-auto"
                        onClick={() => sendAbortController.current?.abort()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
                <div className="mx-auto w-full max-w-[52rem]">
                  {showJumpToLatest ? (
                    <div className="mb-2 flex justify-center">
                      <Button
                        onClick={() => {
                          nearPageBottomRef.current = true
                          setShowJumpToLatest(false)
                          messagesScrollRef.current?.scrollTo({
                            behavior: 'smooth',
                            top: messagesScrollRef.current.scrollHeight,
                          })
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <ArrowDown aria-hidden="true" /> Jump to latest
                      </Button>
                    </div>
                  ) : null}
                  {composer}
                </div>
              </div>
            </div>
            {detailsVisible ? (
              <CoachAnswerPanel
                className="hidden xl:flex"
                {...answerPanelProps}
              />
            ) : null}
            {detailsOpen ? (
              <div
                aria-label="Answer details"
                aria-modal="true"
                className="fixed inset-0 z-40 xl:hidden"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setDetailsOpen(false)
                }}
                role="dialog"
              >
                <button
                  aria-label="Close answer details"
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setDetailsOpen(false)}
                  type="button"
                />
                <CoachAnswerPanel
                  className="absolute inset-y-0 right-0 max-w-[calc(100vw-1.5rem)] bg-background shadow-2xl"
                  onClose={() => setDetailsOpen(false)}
                  {...answerPanelProps}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>

      <Dialog
        onClose={() => setRenameTarget(null)}
        open={renameTarget !== null}
        title="Rename conversation"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const title = renameTitle.trim()
            if (!renameTarget || !title || renameConversation.isPending) return
            void renameConversation
              .mutateAsync({ conversationId: renameTarget.id, title })
              .then(() => setRenameTarget(null))
          }}
        >
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="conversation-title"
          >
            Conversation name
          </label>
          <input
            autoFocus
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="conversation-title"
            maxLength={120}
            onChange={(event) => setRenameTitle(event.target.value)}
            value={renameTitle}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setRenameTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!renameTitle.trim() || renameConversation.isPending}
              type="submit"
            >
              {renameConversation.isPending ? 'Saving…' : 'Save name'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        onClose={() => setDeleteTarget(null)}
        open={deleteTarget !== null}
        title="Delete conversation?"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Delete “{deleteTarget?.title}” and its saved messages? This cannot
            be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteConversation.isPending || deleteTarget === null}
              onClick={() => {
                if (!deleteTarget) return
                void deleteConversation
                  .mutateAsync(deleteTarget.id)
                  .then(() => {
                    if (activeConversationId === deleteTarget.id) {
                      selectConversation(null)
                    }
                    setDeleteTarget(null)
                  })
              }}
              type="button"
              variant="destructive"
            >
              {deleteConversation.isPending
                ? 'Deleting…'
                : 'Delete conversation'}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  )
}

export default CoachPage
