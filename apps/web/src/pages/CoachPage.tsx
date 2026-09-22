import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  CoachManualTopicStatus,
  CoachRoadmapLane,
  ImprovementTopic,
  ProviderKey,
} from '@algomemtor/shared-contracts'
import {
  ArrowUpRight,
  Bell,
  Check,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Paperclip,
  X,
} from 'lucide-react'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useNotification } from '@/app/useNotification'
import { useAiConsent } from '@/features/profile/hooks/useLearnerSettings'
import {
  useCoachCheckIns,
  useCoachConversation,
  useCoachConversations,
  useCoachPreferences,
  useCoachRoadmap,
  useConfirmCoachAction,
  useCreateCoachConversation,
  useDeleteCoachConversation,
  useMarkCoachCheckIn,
  useRenameCoachConversation,
  useSaveCoachPreferences,
  useSendCoachMessage,
  useSetCoachTopicStatus,
} from '@/features/coach/hooks'
import { AI_POLICY_VERSION } from '@/features/profile/components/AiNoteConsentCard'
import { cn } from '@/lib/utils'
import { CoachRichContent as CoachRichContentView } from '@/features/coach/components/CoachRichContent'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'

const laneLabels: Record<CoachRoadmapLane, string> = {
  current_focus: 'Current focus',
  needs_more_practice: 'Needs more practice',
  recommended_next: 'Recommended next',
  practiced_comfortable: 'Practiced / comfortable',
  revisit_later: 'Revisit later',
  skipped: 'Skipped',
}

const statusLabels: Record<CoachManualTopicStatus, string> = {
  working_on: 'Working on',
  practiced: 'Practiced',
  completed: 'Completed',
  revisit: 'Revisit later',
  skip_for_now: 'Skip for now',
}

const statusOptions = Object.keys(statusLabels) as CoachManualTopicStatus[]

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

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
    label: 'Analyze my recent contests',
    prompt:
      'Analyze my recent contests and rating movement. What should I change before the next contest?',
  },
  {
    label: 'Update my roadmap',
    prompt:
      'Review my roadmap and suggest an incremental update. Tell me what evidence supports it first.',
  },
  {
    label: 'Explain this concept',
    prompt:
      'Explain a CP/DSA concept I am working on with intuition and an example.',
  },
] as const

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

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function TopicCard({
  topic,
  onStatus,
  statusPending,
}: {
  topic: ImprovementTopic
  onStatus: (status: CoachManualTopicStatus | null) => void
  statusPending: boolean
}) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-foreground">
            {topic.name}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {topic.assessment.replaceAll('_', ' ')} · {percent(topic.score)}{' '}
            score · {percent(topic.confidence)} confidence
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">Manual status for {topic.name}</span>
          <select
            aria-label={`Manual status for ${topic.name}`}
            className="h-8 max-w-36 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={statusPending}
            onChange={(event) =>
              onStatus(
                event.target.value === ''
                  ? null
                  : (event.target.value as CoachManualTopicStatus),
              )
            }
            value={topic.manualStatus ?? ''}
          >
            <option value="">Use assessment</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {topic.reason}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        <div>
          <dt>Problems</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.uniqueProblems}
          </dd>
        </div>
        <div>
          <dt>Observed solves</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.solvedProblems}
          </dd>
        </div>
        <div>
          <dt>Submissions</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.totalSubmissions}
          </dd>
        </div>
        <div>
          <dt>Recent practice</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.recentDays === 0
              ? 'Not observed'
              : `${topic.evidence.recentDays}d ago`}
          </dd>
        </div>
      </dl>
      {topic.suggestions.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Optional practice
          </p>
          <ul className="mt-2 space-y-2">
            {topic.suggestions.map((suggestion) => (
              <li
                className="flex min-w-0 items-start justify-between gap-2 text-sm"
                key={suggestion.id}
              >
                <a
                  className="min-w-0 break-words text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={suggestion.problem.canonicalUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {suggestion.problem.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {suggestion.band} ·{' '}
                    {providerLabels[suggestion.problem.provider]}
                  </span>
                </a>
                <ArrowUpRight
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

function EvidenceList({
  evidence,
}: {
  evidence: readonly {
    label: string
    detail: string
    completeness: 'complete' | 'partial' | 'unknown'
    stale: boolean
  }[]
}) {
  if (evidence.length === 0) return null
  return (
    <details
      className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-3"
      aria-label="Information used by the coach"
    >
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        Why this answer
      </summary>
      <ul className="mt-3 space-y-3">
        {evidence.map((item, index) => (
          <li className="text-xs" key={`${item.label}-${index}`}>
            <p className="font-medium text-foreground">{item.label}</p>
            <p className="mt-1 leading-5 text-muted-foreground">
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </details>
  )
}

function CoachPage() {
  const consentQuery = useAiConsent()
  const conversationsQuery = useCoachConversations()
  const roadmapQuery = useCoachRoadmap()
  const preferencesQuery = useCoachPreferences()
  const checkInsQuery = useCoachCheckIns()
  const createConversation = useCreateCoachConversation()
  const renameConversation = useRenameCoachConversation()
  const deleteConversation = useDeleteCoachConversation()
  const sendMessage = useSendCoachMessage()
  const setTopicStatus = useSetCoachTopicStatus()
  const confirmAction = useConfirmCoachAction()
  const savePreferences = useSaveCoachPreferences()
  const markCheckIn = useMarkCoachCheckIn()
  const { notify } = useNotification()
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null)
  const [content, setContent] = useState('')
  const [transientContext, setTransientContext] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const [showInbox, setShowInbox] = useState(false)
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
  const selectConversation = (conversationId: string | null) => {
    nearPageBottomRef.current = true
    setShowJumpToLatest(false)
    setSelectedConversationId(conversationId)
  }

  const conversations = useMemo(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data?.data],
  )
  const activeConversationId = conversations.some(
    (item) => item.id === selectedConversationId,
  )
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
  const consentEnabled =
    consentQuery.data?.data?.enabled === true &&
    consentQuery.data.data.policyVersion === AI_POLICY_VERSION
  const groupedTopics = useMemo(() => {
    const groups = new Map<CoachRoadmapLane, ImprovementTopic[]>()
    for (const topic of roadmap?.topics ?? []) {
      const values = groups.get(topic.lane) ?? []
      values.push(topic)
      groups.set(topic.lane, values)
    }
    return groups
  }, [roadmap?.topics])

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
    if (!consentEnabled) {
      notify({
        title: 'Personalized coaching is disabled',
        description:
          'Enable it in Settings before starting a coach conversation.',
        tone: 'error',
      })
      return
    }
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
      setContent('')
      setTransientContext('')
      setAttachmentFile(null)
    } catch (error) {
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

  function updatePreferences(
    patch: Partial<NonNullable<typeof preferencesQuery.data>['data']>,
  ) {
    const current = preferencesQuery.data?.data
    if (current === undefined || savePreferences.isPending) return
    void savePreferences
      .mutateAsync({
        weeklyEnabled: current.weeklyEnabled,
        weeklyDay: current.weeklyDay,
        weeklyTime: current.weeklyTime,
        eventEnabled: current.eventEnabled,
        timezone: current.timezone,
        ...patch,
      })
      .catch((error: unknown) =>
        notify({
          title: 'Check-in preference was not saved',
          description:
            error instanceof Error ? error.message : 'Try again shortly.',
          tone: 'error',
        }),
      )
  }

  if (
    conversationsQuery.isPending ||
    roadmapQuery.isPending ||
    preferencesQuery.isPending ||
    consentQuery.isPending
  ) {
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

  if (
    conversationsQuery.isError ||
    roadmapQuery.isError ||
    preferencesQuery.isError ||
    consentQuery.isError
  ) {
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
            void preferencesQuery.refetch()
            void consentQuery.refetch()
          }}
          title="Coach unavailable"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer className="max-w-[1600px] gap-4">
      <PageHeader
        action={
          <Link
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            to="/settings"
          >
            Privacy and consent
          </Link>
        }
        description="Ask anything about competitive programming, algorithms, interviews, debugging, or your learning progress."
        title="Your AI coach"
      />

      {!consentEnabled ? (
        <aside
          className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          role="status"
        >
          <p className="font-semibold">
            Enable personalized AI coaching and learner memory to start a
            conversation.
          </p>
          <p className="mt-1">
            Review the updated privacy choices to let the coach use your
            profile, progress, and connected learning activity.
          </p>
          <Link
            className="mt-3 inline-flex font-medium underline underline-offset-4"
            to="/settings"
          >
            Review consent in Settings
          </Link>
        </aside>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:h-[calc(100svh-13rem)] lg:min-h-[42rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside
          className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm lg:min-h-0 lg:overflow-y-auto"
          aria-label="Saved coaching conversations"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-foreground">Conversations</h2>
            <Button
              aria-label="New coaching conversation"
              onClick={() => {
                void createConversation
                  .mutateAsync({})
                  .then((result) => selectConversation(result.data.id))
              }}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Start with a guided question. Safe chat text is saved until you
              delete it.
            </p>
          ) : (
            <ul className="space-y-2">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      'group flex min-w-0 items-center gap-1 rounded-md border p-1',
                      activeConversationId === conversation.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent',
                    )}
                  >
                    <button
                      className="min-w-0 flex-1 rounded px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => selectConversation(conversation.id)}
                      type="button"
                    >
                      <span className="block truncate font-medium">
                        {conversation.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {conversation.messageCount} messages
                      </span>
                    </button>
                    <Button
                      aria-label={`Rename ${conversation.title}`}
                      onClick={() => {
                        setRenameTarget({
                          id: conversation.id,
                          title: conversation.title,
                        })
                        setRenameTitle(conversation.title)
                      }}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`Delete ${conversation.title}`}
                      onClick={() =>
                        setDeleteTarget({
                          id: conversation.id,
                          title: conversation.title,
                        })
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border pt-4">
            <Button
              className="w-full"
              onClick={() => setShowInbox((value) => !value)}
              type="button"
              variant="outline"
            >
              <Bell aria-hidden="true" /> Check-ins{' '}
              {checkInsQuery.data?.meta.unread
                ? `(${checkInsQuery.data.meta.unread})`
                : ''}
            </Button>
          </div>
        </aside>

        <section
          className="flex h-[70svh] min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:h-auto lg:min-h-0"
          aria-labelledby="conversation-heading"
        >
          <div className="shrink-0 border-b border-border p-4 sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className="truncate text-lg font-semibold text-foreground"
                  id="conversation-heading"
                >
                  {conversationQuery.data?.data.title ??
                    'New coaching conversation'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask for a concept explanation, progressive hint, contest
                  debrief, or evidence-backed next step.
                </p>
              </div>
              <MessageCircle
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
              />
            </div>
            <div
              className="mt-4 flex gap-2 overflow-x-auto pb-1"
              aria-label="Guided coach questions"
            >
              {guidedPrompts.map((item) => (
                <Button
                  className="shrink-0"
                  key={item.label}
                  onClick={() => {
                    setContent(item.prompt)
                    void submitMessage(item.prompt)
                  }}
                  type="button"
                  variant="outline"
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div
            className="min-h-72 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:min-h-96 sm:p-5 lg:min-h-0"
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
            {conversationQuery.isPending ? (
              <p className="text-sm text-muted-foreground" role="status">
                Loading conversation…
              </p>
            ) : conversationQuery.data?.messages.length ? (
              conversationQuery.data.messages.map((message) => (
                <article
                  className={cn(
                    'max-w-3xl rounded-xl border p-3 sm:p-4',
                    message.role === 'user'
                      ? 'ml-auto border-primary/30 bg-primary/5'
                      : 'border-border bg-background',
                  )}
                  key={message.id}
                >
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{message.role === 'user' ? 'You' : 'Coach'}</span>
                    <time dateTime={message.createdAt}>
                      {formatDate(message.createdAt)}
                    </time>
                  </div>
                  <CoachMessageContent
                    content={message.content}
                    role={message.role}
                  />
                  {message.transientContextOmitted ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Temporary code, problem context, or an attachment was
                      omitted from saved history.
                    </p>
                  ) : null}
                  {message.role === 'assistant' ? (
                    <>
                      <EvidenceList evidence={message.evidence} />
                      {message.richContent ? (
                        <CoachRichContentView
                          content={message.richContent}
                          onSuggestedQuestion={(question) => {
                            setContent(question)
                            void submitMessage(question)
                          }}
                        />
                      ) : null}
                      {message.proposals.length ? (
                        <div className="mt-4 space-y-2 border-t border-border pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Suggested actions
                          </p>
                          {message.proposals.map((proposal) => (
                            <div
                              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
                              key={proposal.id}
                            >
                              <span className="min-w-0 text-sm text-foreground">
                                {proposal.label}
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {proposal.reason}
                                </span>
                              </span>
                              <Button
                                disabled={
                                  proposal.status !== 'proposed' ||
                                  confirmAction.isPending
                                }
                                onClick={() =>
                                  void confirmAction.mutateAsync(proposal.id)
                                }
                                size="sm"
                                type="button"
                              >
                                {proposal.status === 'confirmed' ? (
                                  <>
                                    <Check aria-hidden="true" /> Confirmed
                                  </>
                                ) : (
                                  'Confirm'
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
                <Sparkles aria-hidden="true" className="size-7 text-primary" />
                <p className="mt-3 font-medium text-foreground">
                  Your coach is ready
                </p>
                <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                  Start with one of the guided questions or ask anything about
                  CP/DSA. Ask for a hint when working through a specific
                  problem.
                </p>
              </div>
            )}
            <div aria-hidden="true" ref={messageEndRef} />
            {showJumpToLatest ? (
              <Button
                className="mx-auto"
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
                Jump to latest
              </Button>
            ) : null}
            {sendMessage.isPending ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                Reading your profile and learning context…
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
          <form
            className="shrink-0 border-t border-border bg-card p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault()
              void submitMessage()
            }}
          >
            <label className="sr-only" htmlFor="coach-message">
              Ask your coach
            </label>
            <textarea
              className="min-h-20 max-h-36 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!consentEnabled || sendMessage.isPending}
              id="coach-message"
              onChange={(event) => setContent(event.target.value)}
              placeholder="Ask about your next step, a concept, a failed attempt, or a contest…"
              value={content}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Add temporary code or problem context (not saved)
              </summary>
              <textarea
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!consentEnabled || sendMessage.isPending}
                onChange={(event) => setTransientContext(event.target.value)}
                placeholder="Paste only what is needed for this answer. It will be omitted from saved history and audits."
                value={transientContext}
              />
            </details>
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
              <Button
                aria-label="Add attachment"
                disabled={!consentEnabled || sendMessage.isPending}
                onClick={() => attachmentInputRef.current?.click()}
                size="icon"
                type="button"
                variant="outline"
                title="Add attachment"
              >
                <Paperclip aria-hidden="true" />
              </Button>
              {attachmentFile ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                  <span className="max-w-52 truncate">
                    {attachmentFile.name}
                  </span>
                  <button
                    aria-label="Remove attachment"
                    className="rounded-sm p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setAttachmentFile(null)}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Attach one image, document, audio, or video file (up to 8 MB).
                It is sent to Gemini for this answer, not saved in chat history.
              </p>
              <Button
                disabled={
                  !consentEnabled ||
                  (!content.trim() && attachmentFile === null) ||
                  sendMessage.isPending
                }
                type="submit"
              >
                {sendMessage.isPending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Send aria-hidden="true" />
                )}{' '}
                Ask coach
              </Button>
            </div>
          </form>
        </section>
      </div>

      {showInbox ? (
        <section
          className="max-h-[70svh] space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
          aria-labelledby="check-ins-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                className="text-xl font-semibold tracking-tight text-foreground"
                id="check-ins-heading"
              >
                Check-in inbox
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Reviews and reminders based on your learning activity.
              </p>
            </div>
            <Button
              onClick={() => void checkInsQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" /> Refresh
            </Button>
          </div>
          {checkInsQuery.isPending ? (
            <p className="text-sm text-muted-foreground" role="status">
              Checking for new nudges…
            </p>
          ) : checkInsQuery.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Check-ins are temporarily unavailable.
            </p>
          ) : checkInsQuery.data?.data.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {checkInsQuery.data.data.map((checkIn) => (
                <li
                  className={cn(
                    'rounded-lg border p-4',
                    checkIn.dismissed
                      ? 'border-border bg-muted/50 opacity-75'
                      : checkIn.read
                        ? 'border-border bg-background'
                        : 'border-primary/40 bg-primary/5',
                  )}
                  key={checkIn.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {checkIn.type.replaceAll('_', ' ')}
                        {checkIn.dismissed ? ' · dismissed' : ''}
                      </p>
                      <h3 className="mt-1 font-semibold text-foreground">
                        {checkIn.title}
                      </h3>
                    </div>
                    {!checkIn.read && !checkIn.dismissed ? (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {checkIn.content}
                  </p>
                  <EvidenceList evidence={checkIn.evidence} />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={checkIn.createdAt}
                    >
                      {formatDate(checkIn.createdAt)}
                    </time>
                    <div className="flex flex-wrap justify-end gap-2">
                      {!checkIn.read && !checkIn.dismissed ? (
                        <Button
                          onClick={() =>
                            void markCheckIn.mutateAsync({
                              checkInId: checkIn.id,
                              read: true,
                            })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Mark read
                        </Button>
                      ) : null}
                      {checkIn.dismissed ? (
                        <Button
                          onClick={() =>
                            void markCheckIn.mutateAsync({
                              checkInId: checkIn.id,
                              dismissed: false,
                            })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Restore
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            void markCheckIn.mutateAsync({
                              checkInId: checkIn.id,
                              read: true,
                              dismissed: true,
                            })
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No check-ins yet. They will appear here after a weekly review or
              meaningful change.
            </p>
          )}
        </section>
      ) : null}

      <details className="group rounded-2xl border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2
              className="text-xl font-semibold tracking-tight text-foreground"
              id="roadmap-heading"
            >
              Your learning plan
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Review focus areas, next topics, and optional practice.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {roadmap?.topics.length ?? 0} topics
          </span>
        </summary>
        {roadmap ? (
          <div className="grid max-h-[72svh] min-w-0 gap-5 overflow-y-auto border-t border-border p-4 sm:p-5 lg:grid-cols-2">
            {(Object.keys(laneLabels) as CoachRoadmapLane[]).map((lane) => {
              const topics = groupedTopics.get(lane) ?? []
              return (
                <section
                  className="min-w-0 space-y-3"
                  key={lane}
                  aria-labelledby={`roadmap-${lane}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className="font-semibold text-foreground"
                      id={`roadmap-${lane}`}
                    >
                      {laneLabels[lane]}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {topics.length}
                    </span>
                  </div>
                  {topics.length ? (
                    topics.map((topic) => (
                      <TopicCard
                        key={topic.topic}
                        onStatus={(status) =>
                          void setTopicStatus.mutateAsync({
                            topic: topic.topic,
                            status,
                          })
                        }
                        statusPending={setTopicStatus.isPending}
                        topic={topic}
                      />
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nothing here yet.
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        ) : null}
      </details>

      <details className="rounded-2xl border border-border bg-card shadow-sm">
        <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <h2
            className="text-lg font-semibold text-foreground"
            id="check-in-settings-heading"
          >
            Check-in preferences
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Choose when you want weekly reviews and activity-based reminders.
          </p>
        </summary>
        {preferencesQuery.data?.data ? (
          <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                checked={preferencesQuery.data.data.weeklyEnabled}
                className="size-4 accent-primary"
                onChange={(event) =>
                  updatePreferences({ weeklyEnabled: event.target.checked })
                }
                type="checkbox"
              />{' '}
              Weekly review
            </label>
            <label className="text-sm text-foreground">
              Day
              <select
                className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                onChange={(event) =>
                  updatePreferences({ weeklyDay: Number(event.target.value) })
                }
                value={preferencesQuery.data.data.weeklyDay}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
            <label className="text-sm text-foreground">
              Local time
              <input
                className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                onChange={(event) =>
                  updatePreferences({ weeklyTime: event.target.value })
                }
                type="time"
                value={preferencesQuery.data.data.weeklyTime}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                checked={preferencesQuery.data.data.eventEnabled}
                className="size-4 accent-primary"
                onChange={(event) =>
                  updatePreferences({ eventEnabled: event.target.checked })
                }
                type="checkbox"
              />{' '}
              Meaningful event nudges
            </label>
          </div>
        ) : null}
      </details>

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
    </PageContainer>
  )
}

export default CoachPage
