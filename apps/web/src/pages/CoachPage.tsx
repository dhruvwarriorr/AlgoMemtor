import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { ProviderKey } from '@algomemtor/shared-contracts'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Code2,
  Compass,
  CornerDownLeft,
  Lock,
  Crosshair,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  Route,
  Search,
  Sparkles,
  Trash2,
  X,
  type IconComponent,
} from '@/components/icons/algo-icons'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useUserIdentity } from '@/features/auth/user-identity'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TetrisLoader } from '@/components/motion/TetrisLoader'
import { useNotification } from '@/app/useNotification'
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
import {
  mentorToolPath,
  mentorTools,
  orderedMentorTools,
} from '@/features/mentor/feature-routes'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import { CoachStatStrip } from '@/features/coach/components/CoachInsights'
import {
  useDismissProblem,
  useRecommendationDismissals,
} from '@/features/recommendations/hooks/useRecommendations'

const guidedPrompts = [
  {
    label: 'What should I practice next?',
    prompt:
      'What should I practice next based on my current focus and recent progress?',
  },
  {
    label: 'Review my weak topics',
    prompt:
      'Which topics are weakest right now, and what is the smallest practice step that would help?',
  },
  {
    label: 'Plan my week',
    prompt:
      'Given my goals and recent activity, how should I split my practice time this week?',
  },
  {
    label: 'Explain this concept',
    prompt:
      'Explain a CP/DSA concept I am working on with intuition and an example.',
  },
] as const

const promptIcons: Record<string, IconComponent> = {
  'What should I practice next?': Compass,
  'Review my weak topics': Crosshair,
  'Plan my week': Route,
  'Explain this concept': BookOpen,
}

const coachAttachmentTypes = {
  'audio/webm': 'audio/webm',
  'audio/mp4': 'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/wav': 'audio/wav',
  'video/mp4': 'video/mp4',
  'video/webm': 'video/webm',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'application/pdf': 'application/pdf',
  'text/plain': 'text/plain',
  'text/markdown': 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

type CoachAttachmentType = keyof typeof coachAttachmentTypes

const attachmentExtensions: Record<string, CoachAttachmentType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

function attachmentMimeType(file: File): CoachAttachmentType | null {
  if (Object.hasOwn(coachAttachmentTypes, file.type)) {
    return file.type as CoachAttachmentType
  }
  if (file.type === 'audio/x-wav') return 'audio/wav'
  if (file.type === 'audio/mp3') return 'audio/mpeg'
  if (file.type === 'text/x-markdown') return 'text/markdown'
  if (file.type !== '' && file.type !== 'application/octet-stream') return null
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension ? (attachmentExtensions[extension] ?? null) : null
}

function readAttachmentBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('The attachment could not be read.'))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () =>
      reject(new Error('The attachment could not be read.'))
    reader.readAsDataURL(file)
  })
}

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

function CoachPage() {
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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
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
  const roadmap = roadmapQuery.data?.data

  async function ensureConversation() {
    if (activeConversationId !== null) return activeConversationId
    const created = await createConversation.mutateAsync({})
    selectConversation(created.data.id)
    return created.data.id
  }

  async function submitMessage(message = content) {
    const trimmed =
      message.trim() ||
      (attachmentFile === null
        ? ''
        : 'Please help me with the CP/DSA content in this attachment.')
    if (!trimmed || sendMessage.isPending) return
    // Clear the composer straight away so the question moves into the
    // thread; put it back if the send fails or is cancelled.
    const draft = {
      content,
      transientContext,
      attachmentFile,
    }
    setContent('')
    setTransientContext('')
    setAttachmentFile(null)
    setSelectedAnswerId(null)
    try {
      const attachmentType =
        attachmentFile === null ? null : attachmentMimeType(attachmentFile)
      const transientMedia =
        attachmentFile === null || attachmentType === null
          ? undefined
          : {
              mimeType: attachmentType,
              data: await readAttachmentBase64(attachmentFile),
            }
      const conversationId = await ensureConversation()
      const controller = new AbortController()
      sendAbortController.current = controller
      await sendMessage.mutateAsync({
        conversationId,
        content: trimmed,
        transientContext: transientContext.trim() || undefined,
        transientMedia,
        signal: controller.signal,
      })
    } catch (error) {
      setContent((current) => current || draft.content || message)
      setTransientContext((current) => current || draft.transientContext)
      setAttachmentFile((current) => current ?? draft.attachmentFile)
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof Error && error.name === 'AbortError') return
      notify({
        title: 'The coach could not respond',
        description:
          error instanceof Error ? error.message : 'Try again shortly.',
        tone: 'error',
      })
    } finally {
      sendAbortController.current = null
    }
  }

  function selectAttachment(file: File | undefined) {
    if (file === undefined) return
    if (attachmentMimeType(file) === null || file.size > 8 * 1024 * 1024) {
      notify({
        title: 'Unsupported attachment',
        description:
          'Choose an image, PDF, TXT, Markdown, DOCX, MP3, WAV, MP4, or WebM file of 8 MB or less.',
        tone: 'error',
      })
      return
    }
    setAttachmentFile(file)
  }

  if (conversationsQuery.isPending || roadmapQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader
          description="A persistent CP/DSA tutor grounded in your profile, progress, and provider evidence."
          title="Coach"
        />
        <PageSkeleton label="Loading your coach context" rows={6} />
      </PageContainer>
    )
  }

  if (conversationsQuery.isError || roadmapQuery.isError) {
    return (
      <PageContainer>
        <PageHeader
          description="A persistent CP/DSA tutor grounded in your profile, progress, and provider evidence."
          title="Coach"
        />
        <ErrorState
          message="Your coach context could not be loaded."
          onRetry={() => {
            void conversationsQuery.refetch()
            void roadmapQuery.refetch()
          }}
          title="Coach unavailable"
        />
      </PageContainer>
    )
  }

  const hasConversation = activeConversationId !== null
  const messages = hasConversation
    ? (conversationQuery.data?.messages ?? [])
    : []
  // The question being sent, shown in the thread before the reply arrives.
  const pendingQuestion =
    sendMessage.isPending &&
    sendMessage.variables?.conversationId === activeConversationId
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
        Ask your coach
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
        <input
          accept=".mp3,.wav,.m4a,.mp4,.webm,.jpg,.jpeg,.png,.webp,.pdf,.txt,.md,.docx"
          className="sr-only"
          onChange={(event) => {
            selectAttachment(event.target.files?.[0])
            event.target.value = ''
          }}
          ref={attachmentInputRef}
          tabIndex={-1}
          type="file"
        />
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
          aria-label="Add attachment"
          className="grid size-9 place-items-center rounded-md text-foreground/65 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          disabled={sendMessage.isPending}
          onClick={() => attachmentInputRef.current?.click()}
          title="Add attachment (image, document, audio or video, up to 8 MB)"
          type="button"
        >
          <Paperclip aria-hidden="true" className="size-4" strokeWidth={1.7} />
        </button>
        {attachmentFile ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary py-1 pr-1 pl-3 text-xs text-secondary-foreground">
            <span className="max-w-44 truncate">{attachmentFile.name}</span>
            <button
              aria-label="Remove attachment"
              className="grid size-5 place-items-center rounded-md hover:bg-black/5"
              onClick={() => setAttachmentFile(null)}
              type="button"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ) : null}
        <button
          aria-label="Ask coach"
          className="coach-orb ml-auto grid size-10 place-items-center text-white transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          disabled={
            (!content.trim() && attachmentFile === null) ||
            sendMessage.isPending
          }
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
          Pasted code and attachments are never saved
        </span>
      </div>
    </div>
  )

  return (
    <main
      className="flex min-w-0 flex-1 flex-col lg:h-(--app-panel-height) lg:flex-none lg:flex-row lg:overflow-hidden"
      id="main-content"
    >
      {/* History column */}
      <aside
        aria-label="Saved coaching conversations"
        className={cn(
          'flex min-h-0 flex-col gap-4 border-b border-border p-4 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-5',
          sidebarExpanded ? 'lg:w-[18.5rem] lg:px-5' : 'lg:w-[4.5rem] lg:px-3',
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
            <h1 className="text-lg leading-tight">Your AI coach</h1>
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
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
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
            'hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-border pt-4',
            sidebarExpanded && 'lg:flex',
          )}
        >
          {conversations.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Start with a guided question. Safe chat text is saved until you
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
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card py-1 pr-3 pl-1.5 text-xs font-medium text-foreground">
              <span aria-hidden="true" className="coach-orb size-4" />
              Coach
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
          </div>
        </header>

        {showGreeting ? (
            <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-6 sm:px-8">
              <div className="my-auto flex w-full max-w-[52rem] flex-col items-center">
                <CoachStatStrip className="animate-rise" roadmap={roadmap} />
                <span
                  aria-hidden="true"
                  className="coach-orb animate-orb mt-10 size-20 sm:size-24"
                />
                <p
                  className="animate-rise mt-6 text-center font-heading text-3xl font-bold tracking-[-0.01em] text-foreground sm:text-[2.6rem]"
                  style={{ '--i': 1 } as CSSProperties}
                >
                  Hi, {identity.name}! How can I{' '}
                  <span className="text-primary">help?</span>
                </p>
                <p
                  className="animate-rise mt-3 max-w-xl text-center text-muted-foreground"
                  style={{ '--i': 2 } as CSSProperties}
                >
                  I know your linked profiles, solved history, contests and
                  learning progress. Ask about a concept, a failed attempt, your
                  rating or what to practice next.
                </p>
                <div
                  className="animate-rise mt-6 w-full"
                  style={{ '--i': 3 } as CSSProperties}
                >
                  {composer}
                </div>
                <div
                  className="animate-rise mt-4 grid w-full gap-3 sm:grid-cols-3"
                  style={{ '--i': 4 } as CSSProperties}
                >
                  {guidedPrompts.slice(0, 3).map((item) => {
                    const Icon = promptIcons[item.label] ?? Sparkles
                    return (
                      <button
                        className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-[border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] disabled:pointer-events-none disabled:opacity-60"
                        disabled={sendMessage.isPending}
                        key={item.label}
                        onClick={() => {
                          setContent(item.prompt)
                          void submitMessage(item.prompt)
                        }}
                        type="button"
                      >
                        <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
                          <Icon
                            aria-hidden="true"
                            className="size-4"
                            strokeWidth={1.7}
                          />
                        </span>
                        <span>
                          <span className="block font-medium text-foreground">
                            {item.label}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                            {item.prompt}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {guidedPrompts.slice(3).map((item) => (
                    <button
                      className="rounded-md border border-border bg-card px-3.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-secondary disabled:opacity-60"
                      disabled={sendMessage.isPending}
                      key={item.label}
                      onClick={() => {
                        setContent(item.prompt)
                        void submitMessage(item.prompt)
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <nav
                  aria-label="Mentor tools"
                  className="animate-rise mt-8 w-full border-t border-border pt-5"
                  style={{ '--i': 5 } as CSSProperties}
                >
                  <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Or jump straight to a mentor tool
                  </p>
                  <ul className="mt-3 flex flex-wrap justify-center gap-2">
                    {orderedMentorTools.map((tool) => (
                      <li key={tool.feature}>
                        <Link
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={tool.description}
                          to={tool.path}
                        >
                          <tool.icon
                            aria-hidden="true"
                            className="size-4 text-primary"
                            strokeWidth={1.8}
                          />
                          {tool.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
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
                      <p
                        className="text-sm text-muted-foreground"
                        role="status"
                      >
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
                                  Coach
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
                                  aria-pressed={
                                    selectedAnswer?.id === message.id
                                  }
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
                                    {answerDetailsSummary(
                                      answerDetails(message),
                                    )}
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
                            label="Your coach is working"
                            rows={6}
                          />
                          <p className="text-xs font-semibold text-foreground">
                            Your coach is working
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
              <CoachAnswerPanel
                className="hidden xl:flex"
                {...answerPanelProps}
              />
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
