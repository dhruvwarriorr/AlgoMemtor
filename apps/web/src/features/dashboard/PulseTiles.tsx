import { useId, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ProviderKey } from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Flame, type IconComponent } from '@/components/icons/algo-icons'
import {
  ActiveDaysIcon,
  ContestsIcon,
  PlatformIcon,
  TopicIcon,
} from '@/components/icons/app-icons'
import { CountUp } from '@/components/motion/CountUp'
import {
  GradientCard,
  type GradientTone,
} from '@/components/motion/GradientCard'
import {
  dashEase as ease,
  titleCase,
} from '@/features/dashboard/dashboard-format'
import { providerColors } from '@/features/mentor/chart-theme'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { cn } from '@/lib/utils'

type TrendDay = { date: string; attempted: number; solved: number }

type TileTone = GradientTone | 'mesh'

const beams: Record<TileTone, [string, string]> = {
  mesh: ['#7dd3fc', '#4ade80'],
  ink: ['#38bdf8', '#f97316'],
  sky: ['#38bdf8', '#818cf8'],
  green: ['#4ade80', '#38bdf8'],
  sand: ['#f59e0b', '#fde68a'],
}

// One live headline number. The surface matches the site's gradient tiles;
// a light runs around the border on hover.
function PulseTile({
  tone,
  label,
  badge,
  decoration,
  value,
  count,
  unit,
  detail,
  visual,
  index,
}: {
  tone: TileTone
  label: string
  badge?: ReactNode
  decoration?: IconComponent
  value?: string
  count?: number
  unit?: string
  detail: string
  visual?: ReactNode
  index: number
}) {
  const reduceMotion = useReducedMotion()
  const [acc, acc2] = beams[tone]
  const style = { '--acc': acc, '--acc-2': acc2 } as CSSProperties
  const shell =
    'pulse-tile beam-frame flex h-full min-h-[9.75rem] min-w-0 flex-col justify-between gap-3 rounded-2xl p-4'
  const body = (
    <>
      <div className="flex min-h-12 items-start justify-between gap-2">
        <p className="min-w-0 pt-0.5 text-sm leading-tight font-medium opacity-75">
          {label}
        </p>
        {visual}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p
            className={cn(
              'min-w-0 truncate font-heading leading-none font-bold tracking-[-0.02em]',
              count === undefined
                ? 'text-[1.3rem] sm:text-[1.6rem]'
                : 'text-[2rem] sm:text-[2.35rem]',
            )}
            title={value ?? String(count ?? 0)}
          >
            {count === undefined ? value : <CountUp value={count} />}
            {unit ? (
              <span className="ml-1 text-sm font-semibold tracking-normal opacity-70">
                {unit}
              </span>
            ) : null}
          </p>
          {badge}
        </div>
        <p className="mt-1.5 truncate text-xs opacity-70">{detail}</p>
      </div>
    </>
  )
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0"
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      transition={{ duration: 0.7, ease, delay: 0.15 + index * 0.07 }}
    >
      {tone === 'mesh' ? (
        <motion.div
          className={cn(shell, 'mesh-card shadow-soft')}
          style={style}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          whileHover={reduceMotion ? undefined : { y: -4, scale: 1.03 }}
        >
          {body}
        </motion.div>
      ) : (
        <GradientCard
          className={shell}
          icon={decoration}
          style={style}
          tone={tone}
        >
          {body}
        </GradientCard>
      )}
    </motion.li>
  )
}

// Daily solves over two weeks as a glowing area, wiped in from the left.
function SolvedSpark({ values }: { values: readonly number[] }) {
  const reduceMotion = useReducedMotion()
  const id = useId().replace(/[^\w-]/g, '')
  if (values.length < 2) return null
  const most = Math.max(1, ...values)
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * 84 + 2,
    y: 36 - (value / most) * 30,
  }))
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const last = points.at(-1)
  return (
    <svg
      aria-hidden="true"
      className="h-10 w-[5.5rem] shrink-0 overflow-visible text-[#bbf7d0]"
      viewBox="0 0 88 40"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <motion.rect
            animate={{ width: 92 }}
            height="44"
            initial={reduceMotion ? false : { width: 0 }}
            transition={{ duration: 1.4, ease, delay: 0.5 }}
            width="92"
            x="-2"
            y="-2"
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <path d={`${line} L 86 40 L 2 40 Z`} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </g>
      {last === undefined ? null : (
        <>
          <circle cx={last.x} cy={last.y} fill="currentColor" r="2.6" />
          {reduceMotion ? null : (
            <motion.circle
              animate={{ r: [3, 8, 3], opacity: [0.8, 0, 0.8] }}
              cx={last.x}
              cy={last.y}
              fill="none"
              initial={{ r: 3 }}
              stroke="currentColor"
              strokeWidth="1.5"
              transition={{ duration: 2.2, repeat: Infinity, delay: 1.9 }}
            />
          )}
        </>
      )}
    </svg>
  )
}

// The last seven days as a chain that lights up day by day.
function WeekChain({ days }: { days: readonly TrendDay[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <span aria-hidden="true" className="flex shrink-0 items-end gap-1 pb-1">
      {days.map((day, index) => (
        <motion.span
          animate={{ scale: 1, opacity: 1 }}
          className={cn(
            'block w-2.5 rounded-[4px]',
            day.solved > 0
              ? 'h-4 bg-linear-to-t from-[#f97316] to-[#fbbf24] shadow-[0_0_8px_rgba(249,115,22,0.7)]'
              : 'h-2.5 bg-[color-mix(in_oklab,currentColor_18%,transparent)]',
          )}
          initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
          key={day.date}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 16,
            delay: 0.6 + index * 0.08,
          }}
        />
      ))}
    </span>
  )
}

// Each platform's share of solves as a ring around the leading platform.
function ShareDonut({
  providers,
}: {
  providers: readonly (readonly [ProviderKey, number])[]
}) {
  const reduceMotion = useReducedMotion()
  const total = providers.reduce((sum, [, count]) => sum + count, 0)
  const lead = providers[0]
  if (total === 0 || lead === undefined) return null
  const radius = 19
  const length = 2 * Math.PI * radius
  const gap = providers.length > 1 ? 2.5 : 0
  const arcs = providers.map(([provider, count], index) => {
    const start = providers
      .slice(0, index)
      .reduce((sum, [, previous]) => sum + previous, 0)
    return {
      provider,
      offset: (start / total) * length,
      size: Math.max(0.5, (count / total) * length - gap),
    }
  })
  return (
    <span className="relative grid size-9 shrink-0 place-items-center">
      <svg aria-hidden="true" className="absolute inset-0" viewBox="0 0 48 48">
        <circle
          cx="24"
          cy="24"
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="5"
        />
        {arcs.map((arc, index) => (
          <motion.circle
            animate={{ strokeDasharray: `${arc.size} ${length}` }}
            cx="24"
            cy="24"
            fill="none"
            initial={reduceMotion ? false : { strokeDasharray: `0 ${length}` }}
            key={arc.provider}
            r={radius}
            stroke={providerColors[arc.provider]}
            strokeDashoffset={-arc.offset}
            strokeLinecap="round"
            strokeWidth="5"
            transform="rotate(-90 24 24)"
            transition={{ duration: 0.9, ease, delay: 0.5 + index * 0.2 }}
          />
        ))}
      </svg>
      <ProviderLogo className="size-3.5" provider={lead[0]} />
    </span>
  )
}

// This month's leading topics as rising columns, the top one lit.
function TopicColumns({
  topics,
}: {
  topics: readonly { topic: string; solved: number }[]
}) {
  const reduceMotion = useReducedMotion()
  const most = Math.max(1, ...topics.map((topic) => topic.solved))
  if (topics.length === 0) return null
  return (
    <span aria-hidden="true" className="flex h-8 shrink-0 items-end gap-[3px]">
      {topics.map((topic, index) => (
        <motion.span
          animate={{ height: `${Math.max(14, (topic.solved / most) * 100)}%` }}
          className={cn(
            'block w-1.5 rounded-t-[3px] rounded-b-[1px]',
            index === 0
              ? 'bg-linear-to-t from-[#16a34a] to-[#86efac] shadow-[0_0_10px_rgba(74,222,128,0.6)]'
              : 'bg-[color-mix(in_oklab,currentColor_28%,transparent)]',
          )}
          initial={reduceMotion ? false : { height: '0%' }}
          key={topic.topic}
          title={`${titleCase(topic.topic)}: ${topic.solved}`}
          transition={{ duration: 0.8, ease, delay: 0.5 + index * 0.08 }}
        />
      ))}
    </span>
  )
}

// One arc per day in the window, lit where something happened.
function DayRing({ days }: { days: readonly TrendDay[] }) {
  const reduceMotion = useReducedMotion()
  const count = Math.max(1, days.length)
  const step = 360 / count
  const polar = (radius: number, degrees: number) => {
    const angle = (degrees * Math.PI) / 180
    return {
      x: 26 + Math.cos(angle) * radius,
      y: 26 + Math.sin(angle) * radius,
    }
  }
  return (
    <svg
      aria-hidden="true"
      className="size-9 shrink-0 overflow-visible"
      viewBox="0 0 52 52"
    >
      {days.map((day, index) => {
        const start = -90 + index * step + 1.6
        const end = -90 + (index + 1) * step - 1.6
        const from = polar(21, start)
        const to = polar(21, end)
        const lit = day.solved > 0 || day.attempted > 0
        return (
          <motion.path
            animate={{ opacity: 1 }}
            d={`M ${from.x} ${from.y} A 21 21 0 0 1 ${to.x} ${to.y}`}
            fill="none"
            initial={reduceMotion ? false : { opacity: 0 }}
            key={day.date}
            stroke={lit ? '#f59e0b' : 'currentColor'}
            strokeLinecap="round"
            strokeOpacity={lit ? 1 : 0.16}
            strokeWidth="5"
            transition={{ duration: 0.3, delay: 0.5 + index * 0.025 }}
          />
        )
      })}
    </svg>
  )
}

// Recent contests as medals: green for a rating gain, red for a drop.
function ContestMedals({
  contests,
}: {
  contests: readonly { key: string; delta?: number }[]
}) {
  const reduceMotion = useReducedMotion()
  if (contests.length === 0) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 grid-cols-4 gap-[3px] pb-0.5"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <span
            className="block size-2.5 rounded-full border border-dashed border-[color-mix(in_oklab,currentColor_35%,transparent)]"
            key={index}
          />
        ))}
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 grid-cols-4 gap-[3px] pb-0.5"
    >
      {contests.slice(-8).map((contest, index) => (
        <motion.span
          animate={{ scale: 1, y: 0 }}
          className="block size-2.5 rounded-full ring-2 ring-[color-mix(in_oklab,currentColor_12%,transparent)]"
          initial={reduceMotion ? false : { scale: 0, y: -10 }}
          key={contest.key}
          style={{
            background:
              contest.delta === undefined
                ? 'color-mix(in oklab, currentColor 35%, transparent)'
                : contest.delta >= 0
                  ? 'radial-gradient(circle at 35% 30%, #bbf7d0, #22c55e)'
                  : 'radial-gradient(circle at 35% 30%, #fecaca, #ef4444)',
          }}
          transition={{
            type: 'spring',
            stiffness: 380,
            damping: 14,
            delay: 0.55 + index * 0.07,
          }}
        />
      ))}
    </span>
  )
}

export function PulseTiles({
  trend,
  solved,
  currentStreak,
  longestStreak,
  activeDays,
  windowDays,
  providers,
  topics,
  contests,
}: {
  trend: readonly TrendDay[]
  solved: number
  currentStreak: number
  longestStreak: number
  activeDays: number
  windowDays: number
  providers: readonly (readonly [ProviderKey, number])[]
  topics: readonly { topic: string; solved: number }[]
  contests: readonly { key: string; delta?: number }[]
}) {
  const recent = trend.slice(-14).reduce((sum, day) => sum + day.solved, 0)
  const before = trend.slice(-28, -14).reduce((sum, day) => sum + day.solved, 0)
  const change =
    before === 0 ? undefined : Math.round(((recent - before) / before) * 100)
  const topPlatform = providers[0]
  const platformTotal = providers.reduce((sum, [, count]) => sum + count, 0)
  const leading = [...topics]
    .filter((topic) => topic.solved > 0)
    .sort((left, right) => right.solved - left.solved)
  const topTopic = leading[0]

  return (
    <ul
      aria-label="Last 30 days at a glance"
      className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      <PulseTile
        badge={
          change === undefined ? undefined : (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[0.68rem] font-bold tabular-nums ring-1',
                change >= 0
                  ? 'bg-[#22c55e]/20 text-[#bbf7d0] ring-[#4ade80]/30'
                  : 'bg-[#ef4444]/20 text-[#fecaca] ring-[#f87171]/30',
              )}
              title="Last 14 days compared with the 14 before"
            >
              {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
            </span>
          )
        }
        count={solved}
        detail="new in the last 30 days"
        index={0}
        label="Solved"
        tone="mesh"
        visual={
          <SolvedSpark values={trend.slice(-14).map((day) => day.solved)} />
        }
      />
      <PulseTile
        badge={
          <span
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15',
              currentStreak > 0 ? 'text-[#fb923c]' : 'text-white/40',
            )}
          >
            <Flame
              className={cn('size-[18px]', currentStreak > 0 && 'dash-flame')}
            />
          </span>
        }
        count={currentStreak}
        detail={`Longest: ${longestStreak} ${longestStreak === 1 ? 'day' : 'days'}`}
        index={1}
        label="Solve streak"
        tone="ink"
        unit={currentStreak === 1 ? 'day' : 'days'}
        visual={<WeekChain days={trend.slice(-7)} />}
      />
      <PulseTile
        detail={
          topPlatform
            ? `${topPlatform[1].toLocaleString()} solved · ${Math.round((topPlatform[1] / Math.max(1, platformTotal)) * 100)}%`
            : 'Link a profile'
        }
        decoration={PlatformIcon}
        index={2}
        label="Top platform"
        tone="sky"
        value={topPlatform ? providerLabels[topPlatform[0]] : 'None yet'}
        visual={<ShareDonut providers={providers} />}
      />
      <PulseTile
        detail={topTopic ? `${topTopic.solved} in 30 days` : 'No solves yet'}
        decoration={TopicIcon}
        index={3}
        label="Top topic"
        tone="green"
        value={topTopic ? titleCase(topTopic.topic) : 'None yet'}
        visual={<TopicColumns topics={leading.slice(0, 5)} />}
      />
      <PulseTile
        count={activeDays}
        detail={`of the last ${windowDays} days`}
        decoration={ActiveDaysIcon}
        index={4}
        label="Active days"
        tone="sand"
        visual={<DayRing days={trend.slice(-windowDays)} />}
      />
      <PulseTile
        count={contests.length}
        detail="Last 30 days"
        decoration={ContestsIcon}
        index={5}
        label="Contests"
        tone="sky"
        visual={<ContestMedals contests={contests} />}
      />
    </ul>
  )
}
