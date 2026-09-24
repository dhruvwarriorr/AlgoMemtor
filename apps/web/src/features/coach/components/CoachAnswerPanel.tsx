import type { ReactNode } from 'react'
import type { CoachMessage, ProviderKey } from '@algomemtor/shared-contracts'

import {
  BookOpen,
  Check,
  Code2,
  ExternalLink,
  LayoutGrid,
  MessageCircle,
  Sparkles,
  UserRound,
  X,
} from '@/components/icons/algo-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { answerDetails, coachCodeBlockId } from '../answer-details'
import { CodeBlockView } from './CoachMessageContent'
import { RichBlock } from './CoachRichContent'

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

type CoachAnswerPanelProps = {
  message: CoachMessage | undefined
  pending: boolean
  highlightedCode?: number | null
  disabled: boolean
  dismissedProblemKeys: ReadonlySet<string>
  confirmPending: boolean
  onDismissProblem: (provider: ProviderKey, externalId: string) => void
  onAsk: (question: string) => void
  onConfirmProposal: (proposalId: string) => void
  onClose?: () => void
  className?: string
}

// Everything that is not the coach's prose: picked problems, code, web
// links, charts, actions, follow-ups and sources for the selected answer.
export function CoachAnswerPanel({
  message,
  pending,
  highlightedCode = null,
  disabled,
  dismissedProblemKeys,
  confirmPending,
  onDismissProblem,
  onAsk,
  onConfirmProposal,
  onClose,
  className,
}: CoachAnswerPanelProps) {
  const details = answerDetails(message)
  const empty = !details.hasContent && details.followUps.length === 0

  return (
    <aside
      aria-label="Answer details"
      className={cn(
        'flex w-[24rem] shrink-0 flex-col gap-5 overflow-y-auto border-l border-border p-5 2xl:w-[27rem]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Answer details
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pending
              ? 'Preparing problems, code and sources…'
              : message === undefined
                ? 'Problems, code, links and sources for each answer appear here.'
                : `For the answer from ${formatDate(message.createdAt)}.`}
          </p>
        </div>
        {onClose ? (
          <button
            aria-label="Close answer details"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {pending ? (
        <div aria-hidden="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((item) => (
            <div
              className="h-16 animate-pulse rounded-lg bg-secondary/70"
              key={item}
              style={{ animationDelay: `${item * 150}ms` }}
            />
          ))}
        </div>
      ) : null}

      {!pending && message !== undefined && empty ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          This answer is text only. Ask for practice problems, code, or a chart
          and they will show up here.
        </p>
      ) : null}

      {!pending && message !== undefined ? (
        <>
          {details.picked.map((block, index) => (
            <RichBlock
              block={block}
              dismissedProblemKeys={dismissedProblemKeys}
              key={`picked-${index}`}
              onDismissProblem={onDismissProblem}
            />
          ))}

          {details.codeBlocks.length > 0 ? (
            <Section
              icon={<Code2 aria-hidden="true" className="size-3.5" />}
              title="Code from your coach"
            >
              {details.codeBlocks.map((block) => (
                <CodeBlockView
                  code={block.code}
                  highlighted={highlightedCode === block.index}
                  id={coachCodeBlockId(message.id, block.index)}
                  key={block.index}
                  language={block.language}
                />
              ))}
            </Section>
          ) : null}

          {details.web.map((block, index) => (
            <RichBlock block={block} key={`web-${index}`} />
          ))}

          {details.data.length > 0 ? (
            <Section
              icon={<LayoutGrid aria-hidden="true" className="size-3.5" />}
              title="Charts and data"
            >
              {details.data.map((block, index) => (
                <RichBlock block={block} key={`data-${index}`} />
              ))}
            </Section>
          ) : null}

          {details.proposals.length > 0 ? (
            <Section
              icon={<Sparkles aria-hidden="true" className="size-3.5" />}
              title="Suggested actions"
            >
              {details.proposals.map((proposal) => (
                <div
                  className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
                  key={proposal.id}
                >
                  <span className="min-w-0 text-sm text-foreground">
                    {proposal.label}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {proposal.reason}
                    </span>
                  </span>
                  <Button
                    className="self-start"
                    disabled={proposal.status !== 'proposed' || confirmPending}
                    onClick={() => onConfirmProposal(proposal.id)}
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
            </Section>
          ) : null}

          {details.followUps.length > 0 ? (
            <Section
              icon={<MessageCircle aria-hidden="true" className="size-3.5" />}
              title="Ask next"
            >
              <div className="flex flex-col gap-1.5">
                {details.followUps.map((question) => (
                  <button
                    className="rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-[color-mix(in_oklab,var(--primary)_40%,var(--border))] hover:bg-secondary disabled:pointer-events-none disabled:opacity-60"
                    disabled={disabled}
                    key={question}
                    onClick={() => onAsk(question)}
                    type="button"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          {details.sourceCount > 0 ? (
            <Section
              icon={<BookOpen aria-hidden="true" className="size-3.5" />}
              title="Sources"
            >
              <ul className="flex flex-col gap-2">
                {details.citations.map((citation) => (
                  <li
                    className="rounded-lg border border-border px-3 py-2 text-xs"
                    key={citation.id}
                  >
                    {citation.url ? (
                      <a
                        className="inline-flex items-start gap-1 font-medium text-primary underline-offset-4 hover:underline"
                        href={citation.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {citation.title}
                        <ExternalLink
                          aria-hidden="true"
                          className="mt-0.5 size-3 shrink-0"
                        />
                      </a>
                    ) : (
                      <span className="font-medium text-foreground">
                        {citation.title}
                      </span>
                    )}
                    <span className="mt-0.5 block text-muted-foreground">
                      {citation.source === 'web'
                        ? (citation.publisher ?? 'Public reference')
                        : citation.source === 'knowledge'
                          ? 'Learning guide'
                          : 'Your AlgoMemtor data'}
                    </span>
                  </li>
                ))}
                {details.evidence.map((item, index) => (
                  <li
                    className="flex gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                    key={`${item.label}-${index}`}
                  >
                    <UserRound
                      aria-hidden="true"
                      className="mt-0.5 size-3 shrink-0 text-primary"
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {message.richContent ? (
                <p className="text-xs text-muted-foreground">
                  Your data as of {formatDate(message.richContent.dataAsOf)}.
                </p>
              ) : null}
            </Section>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
