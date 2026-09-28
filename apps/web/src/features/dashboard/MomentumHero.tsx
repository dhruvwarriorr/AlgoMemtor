import { useState, type FormEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, useNavigate } from '@/lib/router'

import {
  ArrowUpRight,
  CalendarCheck,
  Sparkles,
} from '@/components/icons/algo-icons'
import { CountUp } from '@/components/motion/CountUp'
import { SyncPlatformsButton } from '@/features/connector/SyncPlatformsButton'
import {
  dashEase as ease,
  dayLabel,
} from '@/features/dashboard/dashboard-format'
import { orderedMentorTools } from '@/features/mentor/feature-routes'
import { useTypedExample } from '@/lib/use-typed-example'
import { cn } from '@/lib/utils'
import { useCoachName } from '@/features/pet/pet-preference'

type TrendDay = { date: string; attempted: number; solved: number }

// Solid bar colours in steps of a day's solves against the busiest day in the
// window (a quarter each, lowest first). Days with no solve are grey.
const SOLVED_STEP_COLORS = ['#38bdf8', '#2dd4bf', '#4ade80', '#fbbf24'] as const
const NO_SOLVE_COLOR = 'rgba(255,255,255,0.22)'
// Today's bar is always red so the current day stands out.
const TODAY_COLOR = '#ef4444'

const solvedColor = (solved: number, most: number) =>
  solved <= 0
    ? NO_SOLVE_COLOR
    : SOLVED_STEP_COLORS[
        Math.min(
          SOLVED_STEP_COLORS.length - 1,
          Math.ceil((solved / most) * SOLVED_STEP_COLORS.length) - 1,
        )
      ]

const askExamples = [
  'What should I practise today?',
  'Why do I keep failing DP problems?',
  'Plan my week before the next contest',
  'Which topic is holding my rating back?',
]

function AskCoachBar() {
  const coachName = useCoachName()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [question, setQuestion] = useState('')
  const [focused, setFocused] = useState(false)
  const typed = useTypedExample(
    askExamples,
    !reduceMotion && !focused && question === '',
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The question travels in router state, never in the URL.
    void navigate('/coach', { state: { ask: question.trim() } })
  }

  return (
    <form
      className="group/ask relative flex h-14 w-full max-w-xl items-center gap-2 rounded-md border border-white/15 bg-white/[0.07] py-2 pr-2 pl-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[border-color,background-color,box-shadow] duration-300 focus-within:border-[#7dd3fc]/70 focus-within:bg-white/[0.1] focus-within:shadow-[0_0_0_4px_rgba(56,189,248,0.18)]"
      onSubmit={submit}
    >
      <Sparkles
        aria-hidden="true"
        className="size-[18px] shrink-0 text-[#7dd3fc] [--icon-node:#4ade80]"
      />
      <label className="sr-only" htmlFor="dashboard-ask-coach">
        Ask {coachName}
      </label>
      <input
        className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-white outline-none placeholder:text-white/50"
        id="dashboard-ask-coach"
        onBlur={() => setFocused(false)}
        onChange={(event) => setQuestion(event.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={
          focused || reduceMotion
            ? `Ask ${coachName} what to work on…`
            : `${typed}▏`
        }
        value={question}
      />
      <button
        aria-label="Open coach"
        className="grid size-10 shrink-0 place-items-center rounded-sm bg-linear-to-br from-[#38bdf8] to-[#22c55e] text-[#04121c] shadow-[0_8px_24px_-8px_rgba(56,189,248,0.8)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
        type="submit"
      >
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  )
}

function MomentumLine({
  solved,
  activeDays,
  windowDays,
  currentStreak,
  longestStreak,
}: {
  solved: number
  activeDays: number
  windowDays: number
  currentStreak: number
  longestStreak: number
}) {
  const strong = (text: string) => (
    <span className="font-semibold text-white">{text}</span>
  )
  if (solved === 0) {
    return (
      <>
        A fresh stretch. Solve one problem today and your momentum dial starts
        to fill.
      </>
    )
  }
  return (
    <>
      {strong(`${solved} ${solved === 1 ? 'solve' : 'solves'}`)} across{' '}
      {strong(`${activeDays} active ${activeDays === 1 ? 'day' : 'days'}`)} in
      the last {windowDays} days.{' '}
      {currentStreak > 0 ? (
        <>
          Your {strong(`${currentStreak}-day streak`)} is alive, keep it going
          today.
        </>
      ) : longestStreak > 0 ? (
        <>
          Start a new streak today. Your best is{' '}
          {strong(`${longestStreak} days`)}.
        </>
      ) : (
        <>One solve today starts your first streak.</>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// The momentum dial: one bar per day around a ring, oldest at the top and
// running clockwise to today; the inner arc fills with the share of active
// days.

const C = 160
const R0 = 96
const MAXLEN = 48
const RING = 78

function polar(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180
  return { x: C + Math.cos(angle) * radius, y: C + Math.sin(angle) * radius }
}

function MomentumDial({
  trend,
  windowDays,
  activeDays,
  solved,
}: {
  trend: readonly TrendDay[]
  windowDays: number
  activeDays: number
  solved: number
}) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState<number | null>(null)
  const most = Math.max(1, ...trend.map((day) => day.solved))
  const step = 360 / Math.max(1, trend.length)
  const width = Math.min(
    8,
    ((2 * Math.PI * R0) / Math.max(1, trend.length)) * 0.46,
  )
  const share = activeDays / Math.max(1, windowDays)
  const ringLength = 2 * Math.PI * RING
  const head = polar(RING, -90 + 360 * share)
  const focus = active === null ? undefined : trend[active]
  const best = trend.reduce<TrendDay | undefined>(
    (top, day) => (top === undefined || day.solved > top.solved ? day : top),
    undefined,
  )
  const today = trend.at(-1)
  const bars = trend.map((day, index) => {
    const angle = -90 + (index + 0.5) * step
    const intensity = Math.sqrt(day.solved / most)
    const length =
      day.solved > 0 ? 10 + MAXLEN * intensity : day.attempted > 0 ? 6 : 2
    return {
      day,
      angle,
      start: polar(R0, angle),
      end: polar(R0 + length, angle),
      color:
        index === trend.length - 1
          ? TODAY_COLOR
          : solvedColor(day.solved, most),
    }
  })
  const todayBar = bars.at(-1)

  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      <div className="relative">
        <svg
          aria-label={`Last ${trend.length} days: ${solved} solved, ${activeDays} active days`}
          className="w-full overflow-visible"
          onMouseLeave={() => setActive(null)}
          role="img"
          viewBox="0 0 320 320"
        >
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            style={{
              transformOrigin: `${C}px ${C}px`,
              animationDuration: '46s',
            }}
          >
            <circle
              cx={C}
              cy={C}
              fill="none"
              r={156}
              stroke="rgba(255,255,255,0.14)"
              strokeDasharray="2 9"
            />
            <circle cx={C + 156} cy={C} fill="#7dd3fc" r={2.6} />
            <circle cx={C - 156} cy={C} fill="#a78bfa" r={1.8} />
          </g>
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            style={{
              transformOrigin: `${C}px ${C}px`,
              animationDuration: '22s',
              animationDirection: 'reverse',
            }}
          >
            <circle
              cx={C}
              cy={C}
              fill="none"
              r={88}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="1 5"
            />
            <circle cx={C} cy={C - 88} fill="#4ade80" r={2} />
          </g>
          <circle
            cx={C}
            cy={C}
            fill="rgba(255,255,255,0.03)"
            r={RING - 9}
            stroke="rgba(255,255,255,0.07)"
          />
          <circle
            cx={C}
            cy={C}
            fill="none"
            r={RING}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="6"
          />
          <motion.circle
            animate={{
              strokeDasharray: `${share * ringLength} ${ringLength}`,
            }}
            cx={C}
            cy={C}
            fill="none"
            initial={
              reduceMotion ? false : { strokeDasharray: `0 ${ringLength}` }
            }
            r={RING}
            stroke="#F20AC9"
            strokeLinecap="round"
            strokeWidth="6"
            transform={`rotate(-90 ${C} ${C})`}
            transition={{ duration: 1.6, ease, delay: 0.2 }}
          />
          {share > 0 ? (
            <motion.circle
              animate={{ opacity: 1, scale: 1 }}
              cx={head.x}
              cy={head.y}
              fill="#eafff3"
              initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
              r={4}
              transition={{ delay: 1.7, type: 'spring', stiffness: 300 }}
            />
          ) : null}
          {bars.map((bar, index) => (
            <g key={bar.day.date}>
              <motion.line
                animate={{
                  x2: bar.end.x,
                  y2: bar.end.y,
                  opacity: active === null || active === index ? 1 : 0.3,
                }}
                initial={
                  reduceMotion ? false : { x2: bar.start.x, y2: bar.start.y }
                }
                stroke={bar.color}
                strokeLinecap="butt"
                strokeWidth={width}
                transition={{
                  x2: {
                    type: 'spring',
                    stiffness: 110,
                    damping: 13,
                    delay: 0.35 + index * 0.03,
                  },
                  y2: {
                    type: 'spring',
                    stiffness: 110,
                    damping: 13,
                    delay: 0.35 + index * 0.03,
                  },
                  opacity: { duration: 0.2 },
                }}
                x1={bar.start.x}
                y1={bar.start.y}
              />
              <line
                onMouseEnter={() => setActive(index)}
                pointerEvents="stroke"
                stroke="transparent"
                strokeWidth={Math.max(12, width * 2)}
                x1={polar(R0 - 8, bar.angle).x}
                x2={polar(R0 + MAXLEN + 16, bar.angle).x}
                y1={polar(R0 - 8, bar.angle).y}
                y2={polar(R0 + MAXLEN + 16, bar.angle).y}
              />
            </g>
          ))}
          {todayBar !== undefined && !reduceMotion ? (
            <motion.circle
              animate={{ r: [4, 11, 4], opacity: [0.9, 0, 0.9] }}
              cx={todayBar.end.x}
              cy={todayBar.end.y}
              fill="none"
              initial={{ r: 4 }}
              pointerEvents="none"
              stroke={TODAY_COLOR}
              strokeWidth="2"
              transition={{ duration: 2.4, repeat: Infinity, delay: 1.6 }}
            />
          ) : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <motion.div
            animate={{
              opacity: focus === undefined ? 1 : 0,
              scale: focus === undefined ? 1 : 0.94,
            }}
            className="col-start-1 row-start-1"
            transition={{ duration: 0.2 }}
          >
            <CountUp
              className="font-heading text-5xl leading-none font-bold tracking-[-0.02em] text-white"
              value={solved}
            />
            <p className="mt-1.5 text-[0.62rem] font-semibold tracking-[0.2em] text-white/55 uppercase">
              solved · {windowDays} days
            </p>
          </motion.div>
          <motion.div
            animate={{
              opacity: focus === undefined ? 0 : 1,
              scale: focus === undefined ? 1.06 : 1,
            }}
            aria-hidden={focus === undefined}
            className="col-start-1 row-start-1"
            initial={false}
            transition={{ duration: 0.2 }}
          >
            {focus === undefined ? null : (
              <>
                <p className="text-[0.68rem] font-medium text-white/60">
                  {dayLabel(focus.date)}
                </p>
                <p className="font-heading text-4xl leading-none font-bold text-white tabular-nums">
                  {focus.solved}
                </p>
                <p className="mt-1 text-[0.68rem] text-white/60">
                  solved · {focus.attempted} tried
                </p>
              </>
            )}
          </motion.div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          ['Active days', `${activeDays}/${windowDays}`],
          ['Best day', best === undefined ? '—' : `${best.solved}`],
          ['Today', today === undefined ? '—' : `${today.solved}`],
        ].map(([label, value], index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="group/chip cursor-default rounded-xl border border-white/10 bg-white/[0.05] px-2 py-2 backdrop-blur transition-[background-color,border-color,box-shadow] duration-300 hover:border-[#7dd3fc]/45 hover:bg-white/[0.1] hover:shadow-[0_14px_30px_-14px_rgba(56,189,248,0.75)]"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            key={label}
            transition={{
              opacity: { delay: 1.2 + index * 0.1, duration: 0.5, ease },
              y: { type: 'spring', stiffness: 380, damping: 22 },
            }}
            whileHover={reduceMotion ? undefined : { y: -4 }}
          >
            <dt className="text-[0.62rem] tracking-[0.12em] text-white/50 uppercase transition-colors duration-300 group-hover/chip:text-[#7dd3fc]">
              {label}
            </dt>
            <dd className="mt-0.5 font-heading text-lg font-bold text-white tabular-nums transition-transform duration-300 group-hover/chip:scale-110">
              {value}
            </dd>
          </motion.div>
        ))}
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Twinkles() {
  const stars = [
    [8, 18, 0],
    [22, 72, 1.2],
    [36, 12, 2.1],
    [48, 88, 0.6],
    [58, 30, 1.8],
    [66, 64, 2.6],
    [78, 10, 0.9],
    [88, 80, 1.5],
    [94, 38, 2.9],
    [14, 52, 3.3],
  ] as const
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {stars.map(([left, top, delay]) => (
        <span
          className="dash-twinkle absolute size-[3px] rounded-full bg-white"
          key={`${left}-${top}`}
          style={{
            left: `${left}%`,
            top: `${top}%`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </span>
  )
}

export function MomentumHero({
  greetingText,
  name,
  trend,
  windowDays,
  solved,
  activeDays,
  currentStreak,
  longestStreak,
  footer,
}: {
  greetingText: string
  name: string
  trend: readonly TrendDay[]
  windowDays: number
  solved: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  footer?: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const [today] = useState(() =>
    new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date()),
  )

  const rise = (delay: number) => ({
    initial: reduceMotion ? false : ({ opacity: 0, y: 18 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease, delay },
  })

  return (
    <section
      aria-labelledby="dashboard-greeting"
      className="relative isolate overflow-hidden rounded-md bg-[#04070b] text-white shadow-[0_40px_90px_-50px_rgba(14,165,233,0.7)] ring-1 ring-white/10"
    >
      {/* Aurora light, a fading grid and stars. */}
      <span
        aria-hidden="true"
        className="animate-aurora pointer-events-none absolute -top-48 -left-40 -z-10 size-[38rem] rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.42),transparent)] blur-2xl"
      />
      <span
        aria-hidden="true"
        className="animate-aurora pointer-events-none absolute -right-32 -bottom-64 -z-10 size-[40rem] rounded-full bg-[radial-gradient(closest-side,rgba(34,197,94,0.3),transparent)] blur-2xl [animation-delay:-5s]"
      />
      <span
        aria-hidden="true"
        className="animate-aurora pointer-events-none absolute -top-40 right-[18%] -z-10 size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.3),transparent)] blur-2xl [animation-delay:-9s]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-size-[46px_46px] [mask-image:radial-gradient(ellipse_at_72%_50%,black,transparent_68%)]"
      />
      <Twinkles />

      <div className="relative grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 lg:p-10">
        <div className="flex min-w-0 flex-col gap-5">
          <motion.p
            {...rise(0)}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-1 text-xs text-white/75 backdrop-blur"
          >
            {/* Today: the calendar glyph with a live node on its corner. */}
            <span aria-hidden="true" className="relative flex size-4">
              <CalendarCheck className="size-4 text-[#7dd3fc]" />
              <span className="absolute -top-0.5 -right-0.5 flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4ade80] opacity-70 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[#4ade80]" />
              </span>
            </span>
            {today}
          </motion.p>
          <motion.h1
            {...rise(0.08)}
            className="font-heading text-[2.1rem] leading-[1.05] font-bold tracking-[-0.02em] sm:text-5xl xl:text-[3.4rem]"
            id="dashboard-greeting"
          >
            {greetingText}, <span className="text-[#7dd3fc]">{name}</span>
          </motion.h1>
          <motion.p
            {...rise(0.16)}
            className="max-w-xl text-[0.98rem] leading-7 text-white/70"
          >
            <MomentumLine
              activeDays={activeDays}
              currentStreak={currentStreak}
              longestStreak={longestStreak}
              solved={solved}
              windowDays={windowDays}
            />
          </motion.p>
          <motion.div
            {...rise(0.24)}
            className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center [&_button]:h-10 [&_button]:rounded-xl [&_button]:border-white/20! [&_button]:bg-white/[0.07]! [&_button]:text-white! [&_button]:backdrop-blur [&_button:hover:not(:disabled)]:bg-white/[0.14]! [&_p]:text-white/60"
          >
            <AskCoachBar />
            <SyncPlatformsButton compact />
          </motion.div>
          <nav
            aria-label="Mentor tools"
            className="flex min-w-0 flex-wrap gap-2"
          >
            {orderedMentorTools.map((tool, index) => (
              <motion.span
                animate={{ opacity: 1, y: 0 }}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                key={tool.feature}
                transition={{ duration: 0.5, ease, delay: 0.35 + index * 0.06 }}
              >
                <Link
                  className="group/tool inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-sm font-medium text-white/80 backdrop-blur transition-[background-color,border-color,color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] hover:text-white focus-visible:ring-2 focus-visible:ring-[#7dd3fc] focus-visible:outline-none"
                  title={tool.description}
                  to={tool.path}
                >
                  <tool.icon
                    aria-hidden="true"
                    className="size-4 text-[#7dd3fc] transition-transform duration-300 group-hover/tool:scale-110"
                    strokeWidth={1.8}
                  />
                  {tool.label}
                </Link>
              </motion.span>
            ))}
          </nav>
          {footer}
        </div>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={cn('min-w-0')}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
          transition={{ duration: 1, ease, delay: 0.1 }}
        >
          <MomentumDial
            activeDays={activeDays}
            solved={solved}
            trend={trend}
            windowDays={windowDays}
          />
        </motion.div>
      </div>
    </section>
  )
}
