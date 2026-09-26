import { useId, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'

import { ArrowUpRight } from '@/components/icons/algo-icons'
import { ThinkingOrbs } from '@/components/motion/ThinkingOrbs'
import { dashEase as ease } from '@/features/dashboard/dashboard-format'
import { cn } from '@/lib/utils'

type FocusTopic = { topic: string; name: string; detail: string }

// Where each topic sits in the 320×200 network, lead topic first.
const slots = [
  { x: 236, y: 100 },
  { x: 196, y: 34 },
  { x: 196, y: 166 },
  { x: 296, y: 44 },
] as const
const ORB = { x: 62, y: 100 }

function beamPath(to: { x: number; y: number }) {
  return `M ${ORB.x} ${ORB.y} C ${ORB.x + 70} ${ORB.y}, ${to.x - 90} ${to.y}, ${to.x - 34} ${to.y}`
}

// The coach as a glowing core with beams of light running out to the topics
// it is working on. With nothing due, the beams idle towards empty slots.
export function CoachCore({
  unavailable,
  topics,
  dismissing,
  dismissFailed,
  onDismiss,
  className,
}: {
  unavailable: boolean
  topics: readonly FocusTopic[]
  dismissing: boolean
  dismissFailed: boolean
  onDismiss: (topic: string) => void
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const id = useId().replace(/[^\w-]/g, '')
  const [lead] = topics
  const nodes = topics.slice(0, 4)

  return (
    <section
      aria-labelledby="coach-focus-heading"
      className={cn(
        'mesh-card relative isolate flex min-h-80 min-w-0 flex-col overflow-hidden rounded-2xl p-5 shadow-soft',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="animate-aurora absolute -top-16 -right-16 -z-10 size-52 rounded-full bg-[radial-gradient(closest-side,rgb(125_211_252/0.35),transparent)]"
      />
      <div className="flex items-center justify-between gap-3">
        <h2
          className="shimmer-text font-sans text-sm font-medium text-white/70 [--shimmer:#ffffff]"
          id="coach-focus-heading"
        >
          Your coach is focusing on
        </h2>
        <ThinkingOrbs className="size-8" />
      </div>

      <div className="relative mt-2 aspect-[16/10] w-full">
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 320 200"
        >
          <defs>
            <radialGradient id={`${id}-core`}>
              <stop offset="0%" stopColor="#e0f7ff" />
              <stop offset="45%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0369a1" />
            </radialGradient>
            <linearGradient id={`${id}-beam`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0" />
              <stop offset="50%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          {slots.map((slot, index) => {
            const live = nodes[index] !== undefined
            return (
              <g key={`${slot.x}-${slot.y}`}>
                <motion.path
                  animate={{ pathLength: 1, opacity: 1 }}
                  d={beamPath(slot)}
                  fill="none"
                  initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  stroke={
                    live ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)'
                  }
                  strokeDasharray={live ? undefined : '3 5'}
                  strokeWidth="1.5"
                  transition={{
                    duration: 0.9,
                    ease,
                    delay: 0.3 + index * 0.12,
                  }}
                />
                {live ? (
                  <path
                    className="beam-dash"
                    d={beamPath(slot)}
                    fill="none"
                    stroke={`url(#${id}-beam)`}
                    strokeDasharray="18 102"
                    strokeLinecap="round"
                    strokeWidth={index === 0 ? 3 : 2}
                    style={
                      {
                        '--beam-duration': `${2.2 + index * 0.4}s`,
                        '--beam-delay': `${index * 0.35}s`,
                      } as CSSProperties
                    }
                  />
                ) : null}
              </g>
            )
          })}
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            style={{
              transformOrigin: `${ORB.x}px ${ORB.y}px`,
              animationDuration: '9s',
            }}
          >
            <circle
              cx={ORB.x}
              cy={ORB.y}
              fill="none"
              r={24}
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="2 5"
            />
            <circle cx={ORB.x + 24} cy={ORB.y} fill="#4ade80" r={2.5} />
          </g>
          <circle cx={ORB.x} cy={ORB.y} fill={`url(#${id}-core)`} r={15} />
        </svg>
        {slots.map((slot, index) => {
          const topic = nodes[index]
          if (topic === undefined) {
            return (
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                aria-hidden="true"
                className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/25 bg-white/[0.03]"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                key={`${slot.x}-${slot.y}`}
                style={{
                  left: `${((slot.x - 22) / 320) * 100}%`,
                  top: `${(slot.y / 200) * 100}%`,
                }}
                transition={{ delay: 0.8 + index * 0.12, duration: 0.4 }}
              />
            )
          }
          return (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'absolute max-w-[46%] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border backdrop-blur',
                index === 0
                  ? 'border-[#7dd3fc]/60 bg-[#0ea5e9]/25 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_24px_-4px_rgba(56,189,248,0.8)]'
                  : 'border-white/15 bg-white/10 px-2.5 py-1 text-xs text-white/85',
              )}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              key={topic.topic}
              style={{
                left: `${(slot.x / 320) * 100}%`,
                top: `${(slot.y / 200) * 100}%`,
              }}
              title={topic.name}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 18,
                delay: 0.9 + index * 0.12,
              }}
            >
              {topic.name}
            </motion.span>
          )
        })}
      </div>

      {unavailable ? (
        <p
          className="mt-2 rounded-xl border border-white/15 bg-white/10 p-3 text-sm text-white/80"
          role="status"
        >
          Your coaching focus is temporarily unavailable. Open Coach to retry
          it.
        </p>
      ) : lead ? (
        <div className="mt-1">
          <p className="font-heading text-2xl leading-tight font-bold tracking-[-0.01em]">
            {lead.name}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-white/70">
            {lead.detail}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-white/25 px-3 py-1 text-xs transition-colors duration-300 hover:bg-white/10 disabled:opacity-50"
              disabled={dismissing}
              onClick={() => onDismiss(lead.topic)}
              type="button"
            >
              Dismiss this focus
            </button>
          </div>
          {dismissFailed ? (
            <p className="mt-2 text-xs" role="alert">
              Could not dismiss this focus. Try again.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 max-w-sm text-sm text-white/75">
          No topics are due right now. Your coach will surface the next step as
          new activity arrives.
        </p>
      )}
      <div className="mt-auto pt-4">
        <Link
          className="group/cta inline-flex w-fit items-center gap-2 rounded-xl bg-[#f4f1ea] py-1.5 pr-1.5 pl-4 text-sm font-medium text-[#0b0c0e] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
          to="/coach"
        >
          Continue with coach
          <span className="grid size-7 place-items-center rounded-lg bg-[#0b0c0e] text-[#f4f1ea] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 group-hover/cta:scale-110 [--icon-node:#4ade80]">
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </span>
        </Link>
      </div>
    </section>
  )
}
