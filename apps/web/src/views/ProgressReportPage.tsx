import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from '@/lib/router'
import type {
  ProgressInsight,
  ProgressNarrative,
  ProgressReport,
} from '@algomemtor/shared-contracts'

import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Crosshair,
  Flame,
  Lightbulb,
  Lock,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from '@/components/icons/algo-icons'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import { GradientCard } from '@/components/motion/GradientCard'
import { PanelStyle } from '@/components/kit/Panel'
import PageContainer from '@/components/layout/PageContainer'
import { HeroStat } from '@/components/kit/stat-cards'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/providers/useNotification'
import { SectionCard } from '@/features/mentor/components/shared'
import {
  AccuracyTubes,
  HintLadder,
  SpeedDumbbells,
  WeekDots,
} from '@/features/mentor/components/report-visuals'
import {
  ChartCard,
  ChartEmpty,
  KpiTile,
} from '@/features/mentor/components/visuals'
import { formatDateTime, mentorErrorMessage } from '@/features/mentor/format'
import { insightTargetPath } from '@/features/mentor/feature-routes'
import {
  useProgressNarrative,
  useProgressReport,
} from '@/features/mentor/hooks'
import { cn } from '@/lib/utils'

const narrativeSteps: readonly AiLoaderStep[] = [
  { label: 'Reading your trends', indicator: 'bar' },
  { label: 'Finding what changed', indicator: 'grid' },
  { label: 'Writing your report', indicator: 'dots' },
]

const pct = (value: number | null) =>
  value === null ? '-' : `${Math.round(value * 100)}%`

const insightTones = {
  positive: {
    label: 'Win',
    icon: CheckCircle2,
    gradient: 'green',
    decoration: TrendingUp,
  },
  warning: {
    label: 'Watch',
    icon: TrendingDown,
    gradient: 'sand',
    decoration: TrendingDown,
  },
  neutral: {
    label: 'Note',
    icon: Sparkles,
    gradient: 'sky',
    decoration: Lightbulb,
  },
} as const

// The change an insight states, when it states one ("from 87% to 81%"),
// to show large above the sentence.
function statedChange(text: string) {
  const match = /(\d+(?:\.\d+)?%?)\s+to\s+(\d+(?:\.\d+)?%?)/.exec(text)
  return match ? { from: match[1] ?? '', to: match[2] ?? '' } : null
}

// An insight in the same soft gradient tile as the KPIs below: the tone as
// the label, a stated change as the big value, and the sentence under it.
function InsightCard({
  insight,
  index,
}: {
  insight: ProgressInsight
  index: number
}) {
  const reduceMotion = useReducedMotion()
  const tone = insightTones[insight.tone]
  const Icon = tone.icon
  const change = statedChange(insight.text)
  return (
    <motion.li
      className="min-w-0"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
        delay: 0.08 * index,
      }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <GradientCard
        className="flex h-full min-w-0 flex-col gap-3 p-5 pr-20"
        icon={tone.decoration}
        tone={tone.gradient}
      >
        <p className="flex items-center gap-2 text-sm font-medium opacity-75">
          <Icon aria-hidden="true" className="size-4" />
          {tone.label}
        </p>
        {change !== null ? (
          <p
            aria-hidden="true"
            className="flex items-center gap-2 font-heading text-[1.9rem] leading-none font-bold tracking-[-0.01em] tabular-nums"
          >
            <span className="opacity-55">{change.from}</span>
            <ArrowRight className="size-5 opacity-60" />
            <span>{change.to}</span>
          </p>
        ) : null}
        <p className="text-sm leading-6">{insight.text}</p>
        {insight.link ? (
          <Link
            className={cn(
              buttonVariants({ size: 'sm', variant: 'outline' }),
              'mt-auto self-start bg-card/70 backdrop-blur',
            )}
            to={insightTargetPath(insight.link.target)}
          >
            {insight.link.label} <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </GradientCard>
    </motion.li>
  )
}

function NarrativeCard({
  narrative,
  onRefresh,
  pending,
}: {
  narrative: ProgressNarrative
  onRefresh: () => void
  pending: boolean
}) {
  return (
    <section className="rounded-xl border border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
          <Sparkles aria-hidden="true" className="size-3.5" /> This week's
          insight report
        </p>
        <Button
          disabled={pending}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="ghost"
        >
          <RefreshCw aria-hidden="true" /> Rewrite
        </Button>
      </div>
      <h2 className="mt-2 text-xl text-foreground sm:text-2xl">
        {narrative.headline}
      </h2>
      <p className="mt-2 max-w-3xl text-[0.95rem] leading-7 text-foreground/90">
        {narrative.summary}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(
          [
            ['Wins', narrative.wins],
            ['Watch out', narrative.concerns],
            ['Next steps', narrative.nextSteps],
          ] as const
        ).map(([title, items]) =>
          items.length === 0 ? null : (
            <div key={title}>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Written {formatDateTime(narrative.generatedAt)} from the metrics below.
      </p>
    </section>
  )
}

function ReportKpis({ report }: { report: ProgressReport }) {
  const latestAccuracy = [...report.accuracy]
    .reverse()
    .find((week) => week.rate !== null)
  const hints = report.hintDependency
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <HeroStat
        item={{
          label: 'Current streak',
          value: `${report.consistency.currentStreak}d`,
          hint: `Longest ${report.consistency.longestStreak} days`,
          icon: Flame,
          color: '#f59e0b',
        }}
      />
      <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-6">
        <KpiTile
          className="sm:col-span-2"
          detail="Of the last 30 days"
          icon={CalendarCheck}
          label="Active days"
          tone="green"
          value={report.consistency.activeDaysLast30}
        />
        <KpiTile
          className="sm:col-span-2"
          detail={
            latestAccuracy === undefined
              ? 'No attempts yet'
              : `${latestAccuracy.firstTryAccepted} of ${latestAccuracy.attempted} in the latest week`
          }
          icon={Target}
          label="First-try accuracy"
          tone="sky"
          value={pct(latestAccuracy?.rate ?? null)}
        />
        <KpiTile
          className="sm:col-span-2"
          detail="Doubt Helper, last 12 weeks"
          icon={Crosshair}
          label="Help sessions"
          tone="sand"
          value={hints.sessions}
        />
        <KpiTile
          className="sm:col-span-3"
          detail="1 nudge to 5 full solution"
          icon={Lightbulb}
          label="Average hint"
          tone="sky"
          value={hints.averageHintLevel ?? '-'}
        />
        <KpiTile
          className="col-span-2 sm:col-span-3"
          detail="Sessions that revealed the solution"
          icon={Lock}
          label="Full reveals"
          tone="sand"
          value={pct(hints.solutionRevealRate)}
        />
      </dl>
    </div>
  )
}

const assessmentStyles: Record<string, { label: string; color: string }> = {
  comfortable: { label: 'Comfortable', color: '#22c55e' },
  developing: { label: 'Developing', color: '#0ea5e9' },
  revisit: { label: 'Revisit', color: '#f59e0b' },
  needs_practice: { label: 'Needs practice', color: '#ef4444' },
  insufficient_evidence: { label: 'Too early', color: '#94a3b8' },
}

const assessmentStyle = (assessment: string) =>
  assessmentStyles[assessment] ?? {
    label: assessment.replaceAll('_', ' '),
    color: '#94a3b8',
  }

type TopicRow = ProgressReport['topicProgress'][number]

// recentDays counts days since the topic was last practised; 0 means no date.
const freshnessKey = [
  { label: 'Practised this week', color: '#22c55e', max: 7 },
  { label: 'Fading', color: '#f59e0b', max: 13 },
  { label: 'Stale (2+ weeks)', color: '#ef4444', max: Infinity },
] as const

function freshness(recentDays: number) {
  if (recentDays === 0) {
    return { label: 'No recent practice date', color: '#94a3b8' }
  }
  return freshnessKey.find((item) => recentDays <= item.max) ?? freshnessKey[2]
}

// One line per topic: a status dot, the name, a score bar and the solve
// count, sorted by score. The chips above filter by assessment.
function TopicProgress({ topics }: { topics: readonly TopicRow[] }) {
  const [filter, setFilter] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const groups = [...new Set(topics.map((topic) => topic.assessment))].sort(
    (left, right) =>
      Object.keys(assessmentStyles).indexOf(left) -
      Object.keys(assessmentStyles).indexOf(right),
  )
  const active = filter !== null && groups.includes(filter) ? filter : null
  const ranked = [...topics].sort((left, right) => right.score - left.score)
  const strongest = ranked[0]
  const weakest = ranked.at(-1)
  const visible = topics
    .filter((topic) => active === null || topic.assessment === active)
    .sort((left, right) => right.score - left.score)
  const chip = (key: string | null, label: string, count: number) => (
    <button
      aria-pressed={active === key}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active === key
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
      key={key ?? 'all'}
      onClick={() => setFilter(key)}
      type="button"
    >
      {key === null ? null : (
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: assessmentStyle(key).color }}
        />
      )}
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
  return (
    <ChartCard
      description="Assessed from your provider evidence and recent practice."
      title="Topic progress"
    >
      {topics.length === 0 ? (
        <ChartEmpty>
          Topic progress appears once enough practice evidence is available.
        </ChartEmpty>
      ) : (
        <>
          {strongest && weakest && strongest.topic !== weakest.topic ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {[
                { label: 'Strongest', topic: strongest, color: '#22c55e' },
                {
                  label: 'Needs the most work',
                  topic: weakest,
                  color: '#ef4444',
                },
              ].map((item) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2"
                  key={item.label}
                >
                  <span
                    aria-hidden="true"
                    className="h-8 w-1 rounded-full"
                    style={{ background: item.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.68rem] text-muted-foreground">
                      {item.label}
                    </span>
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {item.topic.name}
                    </span>
                  </span>
                  <span className="font-heading text-xl font-bold tabular-nums">
                    {Math.round(item.topic.score * 100)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {chip(null, 'All', topics.length)}
            {groups.map((group) =>
              chip(
                group,
                assessmentStyle(group).label,
                topics.filter((topic) => topic.assessment === group).length,
              ),
            )}
          </div>
          <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {visible.map((topic, row) => {
              const style = assessmentStyle(topic.assessment)
              const score = Math.round(topic.score * 100)
              const lit = Math.round(topic.score * 10)
              const fresh = freshness(topic.recentDays)
              const recency =
                topic.recentDays === 0
                  ? 'no recent practice date'
                  : `last practised ${topic.recentDays}d ago`
              return (
                <li
                  className="group grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2rem_3.75rem] items-center gap-2.5 rounded-lg px-1 py-0.5 text-sm transition-colors hover:bg-secondary/50 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.25rem_5rem] sm:gap-3"
                  key={topic.topic}
                  title={`${topic.name}: ${style.label}, ${topic.solved} solved, ${recency}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: style.color }}
                    />
                    <span className="truncate font-medium text-foreground">
                      {topic.name}
                    </span>
                  </span>
                  <span
                    aria-label={`${topic.name} score ${score}%, ${style.label}`}
                    className="flex h-3 gap-0.5"
                    role="img"
                  >
                    {Array.from({ length: 10 }, (_, segment) => (
                      <motion.span
                        animate={{
                          opacity: segment < lit ? 1 : 0.22,
                          scaleY: segment < lit ? 1 : 0.6,
                        }}
                        className="flex-1 rounded-[2px] transition-transform duration-200 group-hover:scale-y-110"
                        initial={
                          reduceMotion ? false : { opacity: 0.1, scaleY: 0.3 }
                        }
                        key={segment}
                        style={{
                          background:
                            segment < lit
                              ? `color-mix(in oklab, ${style.color} ${55 + segment * 5}%, transparent)`
                              : 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)',
                        }}
                        transition={{
                          duration: 0.25,
                          delay: Math.min(row, 10) * 0.04 + segment * 0.035,
                        }}
                      />
                    ))}
                  </span>
                  <span className="text-right font-heading font-bold tabular-nums">
                    {score}
                  </span>
                  <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{topic.solved} solved</span>
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: fresh.color }}
                      title={fresh.label}
                    />
                    <span className="sr-only">, {recency}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {freshnessKey.map((item) => (
              <span
                className="inline-flex items-center gap-1.5"
                key={item.label}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ background: item.color }}
                />
                {item.label}
              </span>
            ))}
          </p>
        </>
      )}
    </ChartCard>
  )
}

function ReportBody({ report }: { report: ProgressReport }) {
  return (
    <>
      <ReportKpis report={report} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          description="Share of new problems accepted on the first submission, by week."
          title="First-attempt accuracy"
        >
          {report.accuracy.every((week) => week.rate === null) ? (
            <ChartEmpty>
              Accuracy appears once you attempt new problems.
            </ChartEmpty>
          ) : (
            <AccuracyTubes weeks={report.accuracy} />
          )}
        </ChartCard>
        <ChartCard
          className="lg:col-span-5"
          description="Problems solved and active days per week."
          title="Consistency"
        >
          {report.consistency.weekly.length === 0 ? (
            <ChartEmpty>Weekly activity appears once you practice.</ChartEmpty>
          ) : (
            <WeekDots weeks={report.consistency.weekly} />
          )}
        </ChartCard>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          description="How long a solved contest problem takes you, by difficulty. Minutes run from your previous accepted solve (or the contest start) to this one's accepted submission; each row compares the median of your older half of solves with your newer half."
          title="Solving speed"
        >
          {report.solvingSpeed.length === 0 ? (
            <ChartEmpty>
              Solving speed comes from contest submissions.
            </ChartEmpty>
          ) : (
            <SpeedDumbbells rows={report.solvingSpeed} />
          )}
        </ChartCard>
        <ChartCard
          className="lg:col-span-5"
          description="How much you lean on the Doubt Helper. Lower hint levels mean growing independence."
          title="Hint dependency"
        >
          <HintLadder hints={report.hintDependency} />
        </ChartCard>
      </div>

      <TopicProgress topics={report.topicProgress} />
    </>
  )
}

function ProgressReportPage() {
  const { notify } = useNotification()
  const reportQuery = useProgressReport()
  const narrative = useProgressNarrative()

  const generate = (refresh: boolean) =>
    narrative.mutate(refresh, {
      onError: (error) =>
        notify({
          title: 'The insight report could not be written',
          description: mentorErrorMessage(error, 'Try again shortly.'),
          tone: 'error',
        }),
    })

  const stored = reportQuery.data?.narrative
  const header = (
    <PageHeader
      action={
        <>
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to="/progress"
          >
            Practice log
          </Link>
          {stored === undefined ? (
            <Button
              disabled={narrative.isPending || reportQuery.isPending}
              onClick={() => generate(false)}
              type="button"
            >
              <Sparkles aria-hidden="true" /> Write insight report
            </Button>
          ) : null}
        </>
      }
      description="Your growth, interpreted: topic progress, first-try accuracy, solving speed, consistency and how much you rely on hints."
      title="Progress report"
    />
  )

  if (reportQuery.isPending) {
    return (
      <PageContainer>
        {header}
        <PageSkeleton label="Evaluating your progress" rows={5} />
      </PageContainer>
    )
  }
  if (reportQuery.isError) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message={mentorErrorMessage(
            reportQuery.error,
            'Your progress report could not be built.',
          )}
          onRetry={() => void reportQuery.refetch()}
          title="Report unavailable"
        />
      </PageContainer>
    )
  }

  const report = reportQuery.data.data
  return (
    <PageContainer>
      {header}
      {narrative.isPending ? (
        <div
          className="rounded-xl border border-border bg-card p-6"
          role="status"
        >
          <AiLoader
            steps={narrativeSteps}
            title="Writing your insight report"
          />
        </div>
      ) : stored !== undefined ? (
        <NarrativeCard
          narrative={stored}
          onRefresh={() => generate(true)}
          pending={narrative.isPending}
        />
      ) : null}

      <SectionCard
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame aria-hidden="true" className="size-3.5 text-primary" />
            Updated {formatDateTime(report.generatedAt)}
          </span>
        }
        description="Specific, evidence-based observations and what to do about them."
        id="insights-heading"
        title="Insights"
      >
        {report.insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keep practicing. Insights appear once there is enough activity to
            compare.
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {report.insights.map((insight, index) => (
              <InsightCard index={index} insight={insight} key={insight.id} />
            ))}
          </ul>
        )}
      </SectionCard>

      <ReportBody report={report} />
    </PageContainer>
  )
}

function ProgressReportPageWithPanels() {
  return (
    <PanelStyle variant="classic">
      <ProgressReportPage />
    </PanelStyle>
  )
}

export default ProgressReportPageWithPanels
