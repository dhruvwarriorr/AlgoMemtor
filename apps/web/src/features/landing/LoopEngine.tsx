import { useId, useRef, useState, type CSSProperties } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'motion/react'

import { LogoMark } from '@/components/brand/LogoMark'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { ArrowUpRight, CheckCircle2 } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

import { landingEase as ease } from './landing-motion'

const platforms = ['codeforces', 'leetcode', 'codechef', 'cses'] as const

const stages = [
  {
    key: 'read',
    title: 'Read',
    body: 'AlgoMemtor reads the public profiles you choose to link: verdicts, ratings, contests and tags.',
  },
  {
    key: 'remember',
    title: 'Remember',
    body: 'Every verdict becomes memory: what you have mastered, where you slip, and how you like to learn.',
  },
  {
    key: 'rank',
    title: 'Rank',
    body: 'A bounded set of real problems is filtered and ranked for your level, each with a reason.',
  },
  {
    key: 'practise',
    title: 'Practise',
    body: 'You solve on the original platform. The result flows back, and the next pick gets sharper.',
  },
] as const

// Diagram layout in a 640×420 box.
const W = 640
const H = 420
const platformY = [72, 164, 256, 348] as const
const PLATFORM_X = 64
const CORE = { x: 262, y: 210 }
const RANK = { x: 430, y: 210 }
const PICK = { x: 566, y: 210 }

const feedPaths = platformY.map(
  (y) =>
    `M ${PLATFORM_X + 26} ${y} C ${PLATFORM_X + 110} ${y}, ${CORE.x - 110} ${CORE.y}, ${CORE.x - 44} ${CORE.y}`,
)
const rankPath = `M ${CORE.x + 44} ${CORE.y} L ${RANK.x - 58} ${RANK.y}`
const pickPath = `M ${RANK.x + 58} ${RANK.y} L ${PICK.x - 62} ${PICK.y}`
const returnPath = `M ${PICK.x} ${PICK.y + 52} C ${PICK.x} ${H - 20}, ${CORE.x} ${H - 10}, ${CORE.x} ${CORE.y + 46}`

const memories = [
  { text: 'Slips on DP base cases', x: 262, y: 92, tone: 'warn' },
  { text: 'Strong at greedy', x: 170, y: 300, tone: 'good' },
  { text: 'Practises on weekdays', x: 350, y: 318, tone: 'note' },
] as const

const candidates = [
  { name: 'Boredom', score: 0.92 },
  { name: 'Vacations', score: 0.81 },
  { name: 'Flowers', score: 0.74 },
  { name: 'Mashmokh', score: 0.52 },
  { name: 'Cut Ribbon', score: 0.46 },
] as const

const pct = (x: number, total: number) => `${(x / total) * 100}%`

function Beam({
  d,
  live,
  color = 'url(#loop-beam)',
  delay = 0,
  duration = 2.2,
  packets = true,
  packetColor = '#7dd3fc',
  reduceMotion,
}: {
  d: string
  live: boolean
  color?: string
  delay?: number
  duration?: number
  packets?: boolean
  packetColor?: string
  reduceMotion: boolean
}) {
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeDasharray="3 6"
        strokeWidth="1.5"
      />
      <motion.path
        animate={{ opacity: live ? 1 : 0 }}
        className={reduceMotion ? undefined : 'beam-dash'}
        d={d}
        fill="none"
        stroke={color}
        strokeDasharray="22 98"
        strokeLinecap="round"
        strokeWidth="2.5"
        style={
          {
            '--beam-duration': `${duration}s`,
            '--beam-delay': `${delay}s`,
          } as CSSProperties
        }
        transition={{ duration: 0.5 }}
      />
      {live && packets && !reduceMotion ? (
        <circle fill={packetColor} r="3.5">
          <animateMotion
            begin={`${delay}s`}
            dur={`${duration}s`}
            path={d}
            repeatCount="indefinite"
          />
        </circle>
      ) : null}
    </g>
  )
}

// The engine behind every pick, drawn as a live diagram: platforms feed a
// memory core, the core ranks real problems, the pick goes out to its
// platform, and the solve flows back in.
function EngineDiagram({ stage }: { stage: number }) {
  const reduceMotion = useReducedMotion() ?? false
  const id = useId().replace(/[^\w-]/g, '')
  return (
    <div className="relative mx-auto aspect-[640/420] w-full max-w-[48rem]">
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible"
        viewBox={`0 0 ${W} ${H}`}
      >
        <defs>
          <linearGradient id="loop-beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0" />
            <stop offset="55%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <radialGradient id={`${id}-halo`}>
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>
        {feedPaths.map((d, index) => (
          <Beam
            d={d}
            delay={index * 0.45}
            key={d}
            live={stage >= 0}
            reduceMotion={reduceMotion}
          />
        ))}
        <Beam
          d={rankPath}
          duration={1.6}
          live={stage >= 2}
          reduceMotion={reduceMotion}
        />
        <Beam
          d={pickPath}
          duration={1.6}
          live={stage >= 3}
          reduceMotion={reduceMotion}
        />
        <Beam
          color="#4ade80"
          d={returnPath}
          duration={2.6}
          live={stage >= 3}
          packetColor="#4ade80"
          reduceMotion={reduceMotion}
        />
        <motion.circle
          animate={reduceMotion ? {} : { opacity: [0.55, 1, 0.55] }}
          cx={CORE.x}
          cy={CORE.y}
          fill={`url(#${id}-halo)`}
          r={stage >= 1 ? 88 : 66}
          style={{ transition: 'r 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        {[54, 68].map((radius, index) => (
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            key={radius}
            style={{
              transformOrigin: `${CORE.x}px ${CORE.y}px`,
              animationDuration: `${index === 0 ? 12 : 20}s`,
              animationDirection: index === 0 ? 'normal' : 'reverse',
            }}
          >
            <circle
              cx={CORE.x}
              cy={CORE.y}
              fill="none"
              r={radius}
              stroke={
                stage >= 1 ? 'rgba(125,211,252,0.4)' : 'rgba(255,255,255,0.12)'
              }
              strokeDasharray={index === 0 ? '2 6' : '10 8'}
              style={{ transition: 'stroke 0.6s' }}
            />
            <circle
              cx={CORE.x + radius}
              cy={CORE.y}
              fill={index === 0 ? '#4ade80' : '#7dd3fc'}
              r={3}
            />
          </g>
        ))}
        {stage >= 3 && !reduceMotion ? (
          <text
            fill="#86efac"
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
            x={(PICK.x + CORE.x) / 2}
            y={H - 16}
          >
            Accepted · memory updated
          </text>
        ) : null}
      </svg>

      {platforms.map((platform, index) => (
        <motion.span
          animate={{
            scale: stage === 0 ? 1.08 : 1,
          }}
          className="absolute grid aspect-square w-[8.5%] min-w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b0c0e]"
          key={platform}
          style={{
            left: pct(PLATFORM_X, W),
            top: pct(platformY[index] ?? 0, H),
          }}
          transition={{ duration: 0.5 }}
        >
          <ProviderLogo className="size-[55%]" provider={platform} />
        </motion.span>
      ))}

      <motion.span
        animate={{ scale: stage === 1 ? 1.12 : 1 }}
        className="absolute aspect-square w-[14%] -translate-x-1/2 -translate-y-1/2"
        style={{ left: pct(CORE.x, W), top: pct(CORE.y, H) }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
      >
        <LogoMark className="size-full shadow-[0_20px_60px_-10px_rgba(56,189,248,0.8)] ring-2 ring-white/15" />
      </motion.span>

      <AnimatePresence>
        {stage >= 1
          ? memories.map((memory, index) => (
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2.5 py-1 text-[0.62rem] font-medium whitespace-nowrap backdrop-blur sm:text-xs',
                  memory.tone === 'warn' &&
                    'border-[#fbbf24]/40 bg-[#f59e0b]/15 text-[#fde68a]',
                  memory.tone === 'good' &&
                    'border-[#4ade80]/40 bg-[#22c55e]/15 text-[#bbf7d0]',
                  memory.tone === 'note' &&
                    'border-[#7dd3fc]/40 bg-[#0ea5e9]/15 text-[#bae6fd]',
                )}
                exit={{ opacity: 0, scale: 0.6 }}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                key={memory.text}
                style={{ left: pct(memory.x, W), top: pct(memory.y, H) }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 18,
                  delay: index * 0.12,
                }}
              >
                {memory.text}
              </motion.span>
            ))
          : null}
      </AnimatePresence>

      <motion.div
        animate={{
          opacity: stage >= 2 ? 1 : 0.35,
          borderColor:
            stage === 2 ? 'rgba(125,211,252,0.6)' : 'rgba(255,255,255,0.12)',
        }}
        className="absolute flex w-[19%] -translate-x-1/2 -translate-y-1/2 flex-col gap-[0.3rem] rounded-xl border bg-white/[0.04] p-[1.2%] backdrop-blur"
        style={{ left: pct(RANK.x, W), top: pct(RANK.y, H) }}
        transition={{ duration: 0.4 }}
      >
        {candidates.map((candidate, index) => {
          const kept = index < 3
          return (
            <motion.span
              animate={{
                opacity: stage >= 2 ? (kept ? 1 : 0.25) : 0.6,
                x: stage >= 2 && !kept ? 6 : 0,
              }}
              className="flex items-center gap-1 text-[0.5rem] text-white/80 sm:text-[0.62rem]"
              key={candidate.name}
              transition={{ duration: 0.4, delay: index * 0.06 }}
            >
              <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              <span
                className={cn(
                  'rounded px-1 font-mono tabular-nums',
                  stage >= 2 && index === 0
                    ? 'bg-[#22c55e]/25 text-[#86efac]'
                    : 'bg-white/8 text-white/60',
                )}
              >
                {stage >= 2 ? candidate.score.toFixed(2) : '··'}
              </span>
            </motion.span>
          )
        })}
      </motion.div>

      <motion.div
        animate={{
          opacity: stage >= 3 ? 1 : 0.3,
          y: stage >= 3 ? '-50%' : '-42%',
        }}
        className="absolute w-[21%] -translate-x-1/2 rounded-xl border border-white/15 bg-[#0b1216]/90 p-[1.4%] text-white backdrop-blur"
        style={{ left: pct(PICK.x, W), top: pct(PICK.y, H) }}
        transition={{ duration: 0.5, ease }}
      >
        <span className="flex items-center gap-1 text-[0.5rem] text-white/55 sm:text-[0.62rem]">
          <ProviderLogo className="size-3" provider="codeforces" />
          Next pick
        </span>
        <span className="mt-0.5 block text-[0.7rem] font-semibold sm:text-sm">
          Boredom
        </span>
        <span className="mt-0.5 flex flex-wrap gap-1 text-[0.45rem] sm:text-[0.58rem]">
          <span className="rounded bg-[#3b82f6]/25 px-1 text-[#bfdbfe]">
            1500
          </span>
          <span className="rounded bg-white/10 px-1">DP</span>
        </span>
        <span className="mt-1 flex items-center gap-1 text-[0.45rem] text-[#86efac] sm:text-[0.58rem]">
          {stage >= 3 ? (
            <CheckCircle2 className="size-3" />
          ) : (
            <ArrowUpRight className="size-3" />
          )}
          {stage >= 3 ? 'Solved on Codeforces' : 'Opens on Codeforces'}
        </span>
      </motion.div>
    </div>
  )
}

function StageList({ stage }: { stage: number }) {
  return (
    <ol className="flex flex-col gap-2">
      {stages.map((item, index) => {
        const active = index === stage
        const done = index < stage
        return (
          <li
            className={cn(
              'rounded-2xl border px-4 py-3 transition-[background-color,border-color,opacity] duration-500',
              active
                ? 'border-[#7dd3fc]/40 bg-white/[0.06]'
                : 'border-transparent opacity-60',
            )}
            key={item.key}
          >
            <p className="flex items-center gap-3">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs transition-colors duration-500',
                  active
                    ? 'border-[#7dd3fc] bg-[#7dd3fc] text-[#04121c]'
                    : done
                      ? 'border-[#4ade80]/60 text-[#86efac]'
                      : 'border-white/20 text-white/50',
                )}
              >
                {done ? '✓' : index + 1}
              </span>
              <span className="font-heading text-lg font-semibold text-[#f4f1ea]">
                {item.title}
              </span>
            </p>
            <AnimatePresence initial={false}>
              {active ? (
                <motion.p
                  animate={{ height: 'auto', opacity: 1 }}
                  className="overflow-hidden pl-10 text-sm leading-6 text-white/60"
                  exit={{ height: 0, opacity: 0 }}
                  initial={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <span className="block pt-1">{item.body}</span>
                </motion.p>
              ) : null}
            </AnimatePresence>
          </li>
        )
      })}
    </ol>
  )
}

// The loop, pinned: scrolling walks through read, remember, rank and
// practise while the diagram lights up each stage.
export function LoopEngine() {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const [stage, setStage] = useState(0)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    setStage(Math.min(stages.length - 1, Math.floor(value * stages.length)))
  })

  const heading = (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-3 font-mono text-xs tracking-[0.28em] text-[#7dd3fc] uppercase">
        <span className="text-white/35">02</span>
        <span aria-hidden="true" className="h-px w-8 bg-[#7dd3fc]/50" />
        The loop
      </p>
      <h2
        className="font-heading text-[2.2rem] leading-[1.02] font-bold tracking-[-0.025em] text-[#f4f1ea] sm:text-5xl"
        id="landing-loop"
      >
        Every solve makes the next pick sharper.
      </h2>
    </div>
  )

  if (reduceMotion) {
    return (
      <section
        aria-labelledby="landing-loop"
        className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"
      >
        <div className="flex flex-col gap-6">
          {heading}
          <ol className="flex flex-col gap-3">
            {stages.map((item, index) => (
              <li className="text-sm leading-6 text-white/60" key={item.key}>
                <span className="font-heading text-base font-semibold text-[#f4f1ea]">
                  {index + 1}. {item.title}.
                </span>{' '}
                {item.body}
              </li>
            ))}
          </ol>
        </div>
        <EngineDiagram stage={3} />
      </section>
    )
  }

  return (
    <section
      aria-labelledby="landing-loop"
      className="relative h-[420dvh]"
      ref={ref}
    >
      <div className="sticky top-0 flex h-dvh w-full items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-5 pt-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:pt-0">
          <div className="flex flex-col gap-5">
            {heading}
            <StageList stage={stage} />
          </div>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[10%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.18),transparent)] blur-2xl"
            />
            <EngineDiagram stage={stage} />
            <div
              className="mt-4 flex justify-center gap-1.5"
              aria-hidden="true"
            >
              {stages.map((item, index) => (
                <span
                  className={cn(
                    'h-1.5 rounded-full transition-[width,background-color] duration-500',
                    index === stage ? 'w-8 bg-[#7dd3fc]' : 'w-1.5 bg-white/20',
                  )}
                  key={item.key}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
