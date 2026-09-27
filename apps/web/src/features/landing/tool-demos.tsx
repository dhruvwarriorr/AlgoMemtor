import { AnimatePresence, motion } from 'motion/react'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Lock } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

import { landingEase as ease } from './landing-motion'
import { useLoopStep } from './use-loop-step'

// Illustrative miniatures of each tool. They play on a loop while on screen
// and use made-up practice data.

// ---------------------------------------------------------------------------
// Coach: a short exchange where the coach answers from memory.

const chat = [
  { at: 0, from: 'you', text: 'Why do I keep failing DP problems?' },
  {
    at: 2,
    from: 'coach',
    text: 'You missed the base case in 3 of your last 5 DP attempts. Start with Boredom (1500), then Vacations.',
    memory: 'Recalled · DP base cases',
  },
  { at: 4, from: 'you', text: 'Hints only, please. No full answers.' },
  {
    at: 6,
    from: 'coach',
    text: 'Noted. I will keep hints short and save full solutions for when you ask.',
    memory: 'Saved · prefers hints first',
  },
] as const
const typingAt = [1, 5]

export function CoachChatDemo() {
  const { ref, step } = useLoopStep<HTMLDivElement>(10, 1300, 8)
  const visible = chat.filter((message) => message.at <= step)
  return (
    <div
      aria-hidden="true"
      className="flex h-full min-h-80 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#070b0e]/80"
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
        <span className="coach-orb size-7 shadow-[0_0_18px_rgba(56,189,248,0.6)]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Coach</p>
          <p className="flex items-center gap-1.5 text-[0.68rem] text-[#86efac]">
            <span className="size-1.5 rounded-full bg-[#4ade80]" />
            Using your memory
          </p>
        </div>
        <span className="ml-auto rounded-full border border-white/10 px-2.5 py-1 font-mono text-[0.62rem] text-white/50">
          Codeforces · LeetCode
        </span>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-hidden p-4"
        ref={ref}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((message) => (
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                'flex max-w-[88%] flex-col gap-1.5',
                message.from === 'you' ? 'self-end items-end' : 'self-start',
              )}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              key={message.text}
              layout
              transition={{ duration: 0.45, ease }}
            >
              <p
                className={cn(
                  'rounded-2xl px-3.5 py-2 text-sm leading-5',
                  message.from === 'you'
                    ? 'rounded-br-md bg-[#f4f1ea] text-[#0b0c0e]'
                    : 'rounded-bl-md border border-white/10 bg-white/[0.06] text-white/90',
                )}
              >
                {message.text}
              </p>
              {'memory' in message ? (
                <motion.span
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#4ade80]/30 bg-[#22c55e]/10 px-2 py-0.5 text-[0.68rem] text-[#86efac]"
                  initial={{ opacity: 0, x: -8 }}
                  transition={{ delay: 0.35 }}
                >
                  <span className="size-1.5 rounded-full bg-[#4ade80] shadow-[0_0_8px_#4ade80]" />
                  {message.memory}
                </motion.span>
              ) : null}
            </motion.div>
          ))}
          {typingAt.includes(step) ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="flex w-fit items-center gap-1 self-start rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-3.5 py-3"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="typing"
              layout
            >
              {[0, 1, 2].map((dot) => (
                <motion.span
                  animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                  className="size-1.5 rounded-full bg-white/70"
                  key={dot}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    delay: dot * 0.15,
                  }}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="m-3 mt-0 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2 pr-2 pl-3.5 text-sm text-white/40">
        Ask about any problem…
        <span className="ml-auto grid size-7 place-items-center rounded-lg bg-linear-to-br from-[#38bdf8] to-[#22c55e] text-[#04121c]">
          ↗
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recommendations: a deck of picks, each with its reason, dealt in turn.

const picks = [
  {
    title: 'Boredom',
    rating: 1500,
    topic: 'DP',
    reason: 'Your weakest topic this month',
  },
  {
    title: 'Vacations',
    rating: 1400,
    topic: 'DP',
    reason: 'The next step after Boredom',
  },
  {
    title: 'Two Buttons',
    rating: 1400,
    topic: 'Graphs',
    reason: 'You asked for more graphs',
  },
] as const

export function PicksDemo() {
  const { ref, step } = useLoopStep<HTMLDivElement>(picks.length, 2400, 0)
  return (
    <div
      aria-hidden="true"
      className="relative h-40 w-full [perspective:900px]"
      ref={ref}
    >
      {picks.map((pick, index) => {
        const depth = (index - step + picks.length) % picks.length
        return (
          <motion.div
            animate={{
              y: depth * 14,
              scale: 1 - depth * 0.06,
              opacity: 1 - depth * 0.3,
              rotateX: depth * 4,
            }}
            className="absolute inset-x-0 top-0 rounded-2xl border border-white/12 bg-[#0e151b] p-4 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)]"
            key={pick.title}
            style={{ zIndex: picks.length - depth }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-white text-[#0b0c0e]">
                <ProviderLogo className="size-5" provider="codeforces" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-base font-semibold text-white">
                  {pick.title}
                </p>
                <p className="text-xs text-white/50">Codeforces</p>
              </div>
              <span className="rounded-md bg-[#3b82f6]/20 px-1.5 py-0.5 font-mono text-xs font-bold text-[#93c5fd]">
                {pick.rating}
              </span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-white/65">
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/80">
                {pick.topic}
              </span>
              {pick.reason}
            </p>
          </motion.div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Doubt Helper: five hint levels that open one at a time, the solution last.

const rungs = ['Nudge', 'Key idea', 'Approach', 'Outline', 'Solution'] as const

export function HintLadderDemo() {
  const { ref, step } = useLoopStep<HTMLDivElement>(7, 1100, 3)
  const open = Math.min(step, 4)
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5" ref={ref}>
      {rungs.map((rung, index) => {
        const lit = index < open
        const last = index === rungs.length - 1
        return (
          <motion.div
            animate={{
              opacity: lit || index === open ? 1 : 0.45,
              x: index === open ? 6 : 0,
            }}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors duration-300',
              lit
                ? 'border-[#fbbf24]/35 bg-[#f59e0b]/12 text-[#fde68a]'
                : 'border-white/10 bg-white/[0.03] text-white/70',
            )}
            key={rung}
            transition={{ duration: 0.35, ease }}
          >
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full font-mono text-[0.7rem] font-bold',
                lit
                  ? 'bg-[#fbbf24] text-[#1f1300]'
                  : 'bg-white/10 text-white/60',
              )}
            >
              {index + 1}
            </span>
            <span className="flex-1">{rung}</span>
            {last ? (
              <span className="inline-flex items-center gap-1 text-[0.68rem] text-white/50">
                <Lock className="size-3" />
                after you try
              </span>
            ) : null}
          </motion.div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upsolve: contests as stacks of problems; an open one turns upsolved.

const contests = [
  { solved: 3, upsolved: 1, open: 1 },
  { solved: 2, upsolved: 2, open: 1 },
  { solved: 4, upsolved: 0, open: 2 },
  { solved: 2, upsolved: 1, open: 2 },
  { solved: 3, upsolved: 2, open: 0 },
] as const

export function UpsolveDemo() {
  const { ref, step } = useLoopStep<HTMLDivElement>(4, 1600, 3)
  return (
    <div
      aria-hidden="true"
      className="flex h-36 items-end justify-around gap-2"
      ref={ref}
    >
      {contests.map((contest, column) => {
        // One open problem gets upsolved as the loop advances.
        const flipped = column === step
        const blocks = [
          ...Array.from({ length: contest.solved }, () => 'solved'),
          ...Array.from({ length: contest.upsolved }, () => 'upsolved'),
          ...Array.from({ length: contest.open }, (_, index) =>
            flipped && index === 0 ? 'fresh' : 'open',
          ),
        ]
        return (
          <div className="flex w-8 flex-col-reverse gap-1" key={column}>
            {blocks.map((kind, index) => (
              <motion.span
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: kind === 'fresh' ? [1, 1.25, 1] : 1,
                }}
                className={cn(
                  'block h-3.5 rounded-[4px]',
                  kind === 'solved' && 'bg-[#22c55e]',
                  (kind === 'upsolved' || kind === 'fresh') && 'bg-[#0ea5e9]',
                  kind === 'fresh' && 'shadow-[0_0_14px_#38bdf8]',
                  kind === 'open' && 'border border-dashed border-white/30',
                )}
                initial={{ opacity: 0, y: -24 }}
                key={`${index}-${kind === 'fresh' ? 'open' : kind}`}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 20,
                  delay: column * 0.06 + index * 0.03,
                }}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress: thirty days as a radial dial.

const dialDays = Array.from({ length: 30 }, (_, index) =>
  Math.max(
    0,
    Math.round(Math.abs(Math.sin(index * 1.7)) * 5 - (index % 7 === 3 ? 5 : 0)),
  ),
)

const dialStepColors = ['#38bdf8', '#2dd4bf', '#4ade80', '#fbbf24'] as const

export function DialDemo() {
  const { ref, inView, reduceMotion } = useLoopStep<HTMLDivElement>(2, 60000, 1)
  const most = Math.max(1, ...dialDays)
  const solved = dialDays.reduce((sum, value) => sum + value, 0)
  const activeDays = dialDays.filter((value) => value > 0).length
  const share = activeDays / dialDays.length
  const ringLength = 2 * Math.PI * 46
  const headAngle = ((-90 + share * 360) * Math.PI) / 180
  const head = {
    x: 100 + Math.cos(headAngle) * 46,
    y: 100 + Math.sin(headAngle) * 46,
  }
  const shown = inView || reduceMotion
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[15rem]"
      ref={ref}
    >
      <div className="relative aspect-square w-full">
        <svg className="size-full overflow-visible" viewBox="0 0 200 200">
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            style={{
              transformOrigin: '100px 100px',
              animationDuration: '36s',
            }}
          >
            <circle
              cx="100"
              cy="100"
              fill="none"
              r="96"
              stroke="rgba(255,255,255,0.12)"
              strokeDasharray="2 8"
            />
            <circle cx="196" cy="100" fill="#7dd3fc" r="2" />
            <circle cx="4" cy="100" fill="#a78bfa" r="1.5" />
          </g>
          <circle
            cx="100"
            cy="100"
            fill="rgba(255,255,255,0.025)"
            r="39"
            stroke="rgba(255,255,255,0.07)"
          />
          <circle
            cx="100"
            cy="100"
            fill="none"
            r="46"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="5"
          />
          <motion.circle
            animate={{
              strokeDasharray: shown
                ? `${share * ringLength} ${ringLength}`
                : `0 ${ringLength}`,
            }}
            cx="100"
            cy="100"
            fill="none"
            r="46"
            stroke="#F20AC9"
            strokeLinecap="round"
            strokeWidth="5"
            transform="rotate(-90 100 100)"
            transition={{ duration: 1.4, ease }}
          />
          {shown && share > 0 ? (
            <motion.circle
              animate={{ opacity: 1, scale: 1 }}
              cx={head.x}
              cy={head.y}
              fill="#fff0fc"
              initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
              r="3"
              transition={{ delay: 1.4, type: 'spring', stiffness: 300 }}
            />
          ) : null}
          {dialDays.map((value, index) => {
            const angle = ((-90 + (index + 0.5) * 12) * Math.PI) / 180
            const length = value === 0 ? 2 : 7 + 25 * Math.sqrt(value / most)
            const x1 = 100 + Math.cos(angle) * 58
            const y1 = 100 + Math.sin(angle) * 58
            const color =
              index === dialDays.length - 1
                ? '#ef4444'
                : value === 0
                  ? 'rgba(255,255,255,0.2)'
                  : dialStepColors[
                      Math.min(
                        dialStepColors.length - 1,
                        Math.ceil((value / most) * dialStepColors.length) - 1,
                      )
                    ]
            const x2 = 100 + Math.cos(angle) * (58 + length)
            const y2 = 100 + Math.sin(angle) * (58 + length)
            return (
              <g key={index}>
                <motion.line
                  animate={{ x2: shown ? x2 : x1, y2: shown ? y2 : y1 }}
                  stroke={color}
                  strokeLinecap="butt"
                  strokeWidth="4.5"
                  transition={{
                    type: 'spring',
                    stiffness: 110,
                    damping: 13,
                    delay: 0.2 + index * 0.025,
                  }}
                  initial={reduceMotion ? false : { x2: x1, y2: y1 }}
                  x1={x1}
                  x2={x1}
                  y1={y1}
                  y2={y1}
                />
                {index === dialDays.length - 1 && shown && !reduceMotion ? (
                  <motion.circle
                    animate={{ r: [3, 8, 3], opacity: [0.9, 0, 0.9] }}
                    cx={x2}
                    cy={y2}
                    fill="none"
                    initial={{ r: 3 }}
                    stroke={color}
                    strokeWidth="1.5"
                    transition={{ duration: 2.4, repeat: Infinity, delay: 1.2 }}
                  />
                ) : null}
              </g>
            )
          })}
          <text
            fill="#f4f1ea"
            fontSize="30"
            fontWeight="800"
            textAnchor="middle"
            x="100"
            y="103"
          >
            {solved}
          </text>
          <text
            fill="rgba(255,255,255,0.5)"
            fontSize="7"
            letterSpacing="1.8"
            textAnchor="middle"
            x="100"
            y="116"
          >
            SOLVED · 30 DAYS
          </text>
        </svg>
      </div>
      <dl className="mt-1 grid grid-cols-3 gap-1.5 text-center">
        {[
          ['Active days', `${activeDays}/30`],
          ['Best day', `${most}`],
          ['Today', `${dialDays.at(-1) ?? 0}`],
        ].map(([label, value]) => (
          <div
            className="rounded-md border border-white/10 bg-white/[0.05] px-1 py-1.5"
            key={label}
          >
            <dt className="text-[0.48rem] tracking-[0.08em] text-white/45 uppercase">
              {label}
            </dt>
            <dd className="mt-0.5 font-heading text-sm font-bold text-white tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contest analysis: a rating line climbing through rank bands.

const ratingPoints = [
  1120, 1180, 1150, 1260, 1330, 1300, 1410, 1480, 1450, 1560, 1620, 1665,
]
const bands = [
  { name: 'Pupil', min: 1200, color: '#22c55e' },
  { name: 'Specialist', min: 1400, color: '#14b8a6' },
  { name: 'Expert', min: 1600, color: '#3b82f6' },
] as const

export function RatingDemo() {
  const { ref, step, reduceMotion } = useLoopStep<HTMLDivElement>(2, 5200, 1)
  const low = 1050
  const high = 1750
  const y = (value: number) => 12 + (1 - (value - low) / (high - low)) * 116
  const x = (index: number) => 10 + (index / (ratingPoints.length - 1)) * 380
  const line = ratingPoints
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`)
    .join(' ')
  const last = ratingPoints.length - 1
  return (
    <div aria-hidden="true" className="relative w-full" ref={ref}>
      <svg
        className="h-36 w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 400 140"
      >
        {bands.map((band, index) => {
          const top = y(bands[index + 1]?.min ?? high)
          return (
            <g key={band.name}>
              <rect
                fill={band.color}
                fillOpacity="0.08"
                height={y(band.min) - top}
                width="400"
                x="0"
                y={top}
              />
              <line
                stroke={band.color}
                strokeDasharray="3 5"
                strokeOpacity="0.5"
                vectorEffect="non-scaling-stroke"
                x1="0"
                x2="400"
                y1={y(band.min)}
                y2={y(band.min)}
              />
            </g>
          )
        })}
      </svg>
      <motion.div
        animate={{ clipPath: 'inset(-10% 0% -10% 0%)' }}
        className="absolute inset-0"
        initial={
          reduceMotion ? false : { clipPath: 'inset(-10% 100% -10% 0%)' }
        }
        key={step}
        transition={{ duration: 2.2, ease }}
      >
        <svg
          className="h-36 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 400 140"
        >
          <path
            d={line}
            fill="none"
            stroke="#7dd3fc"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4ade80] shadow-[0_0_14px_#4ade80]"
          style={{
            left: `${(x(last) / 400) * 100}%`,
            top: `${(y(ratingPoints[last] ?? 0) / 140) * 100}%`,
          }}
        />
      </motion.div>
      <div className="mt-2 flex items-center justify-between text-[0.68rem] text-white/50">
        {bands.map((band) => (
          <span className="inline-flex items-center gap-1.5" key={band.name}>
            <span
              className="size-2 rounded-full"
              style={{ background: band.color }}
            />
            {band.name} {band.min}+
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Solution Explorer: three approaches, each with its complexity and code.

const approaches = [
  {
    name: 'Brute force',
    cost: 'O(n²)',
    tone: '#f87171',
    code: [
      'for i in range(n):',
      '  for j in range(i, n):',
      '    best = max(best, sum(a[i:j+1]))',
    ],
  },
  {
    name: 'Prefix sums',
    cost: 'O(n)',
    tone: '#fbbf24',
    code: [
      'pre = accumulate(a, initial=0)',
      'low = 0',
      'for p in pre[1:]: best = max(best, p - low)',
    ],
  },
  {
    name: "Kadane's",
    cost: 'O(n)',
    tone: '#4ade80',
    code: [
      'cur = best = a[0]',
      'for x in a[1:]:',
      '  cur = max(x, cur + x); best = max(best, cur)',
    ],
  },
] as const

export function ApproachDemo() {
  const { ref, step } = useLoopStep<HTMLDivElement>(approaches.length, 2600, 2)
  const current = approaches[step] ?? approaches[0]
  return (
    <div aria-hidden="true" className="flex flex-col gap-3" ref={ref}>
      <div className="flex flex-wrap gap-1.5">
        {approaches.map((approach, index) => (
          <span
            className={cn(
              'relative rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300',
              index === step ? 'text-[#0b0c0e]' : 'text-white/60',
            )}
            key={approach.name}
          >
            {index === step ? (
              <motion.span
                className="absolute inset-0 rounded-full bg-[#f4f1ea]"
                layoutId="landing-approach"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="relative">{approach.name}</span>
          </span>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#070b0e] p-3 font-mono text-[0.72rem] leading-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-[#ef4444]/70" />
            <span className="size-2 rounded-full bg-[#f59e0b]/70" />
            <span className="size-2 rounded-full bg-[#22c55e]/70" />
          </span>
          <motion.span
            animate={{ color: current.tone }}
            className="rounded-md bg-white/5 px-1.5 text-[0.68rem] font-bold"
            key={current.cost + current.name}
          >
            {current.cost}
          </motion.span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: 8 }}
            key={current.name}
            transition={{ duration: 0.3 }}
          >
            {current.code.map((line, index) => (
              <p className="truncate text-white/80" key={index}>
                <span className="mr-3 text-white/25">{index + 1}</span>
                {line}
              </p>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
