import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { LearnerProfile } from '@algomemtor/shared-contracts'

import { UserAvatar } from '@/components/brand/UserAvatar'
import {
  Flame,
  Target,
  TrendingUp,
  type IconComponent,
} from '@/components/icons/algo-icons'
import { useUserIdentity } from '@/features/auth/user-identity'

import { readableValue, type StrengthItem } from './profile-strength'

const ease = [0.16, 1, 0.3, 1] as const

// A ring that fills with how complete the profile is.
function StrengthRing({ score }: { score: number }) {
  const reduceMotion = useReducedMotion()
  const length = 2 * Math.PI * 26
  return (
    <span className="relative grid size-16 shrink-0 place-items-center">
      <svg aria-hidden="true" className="absolute inset-0" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          fill="none"
          r="26"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="6"
        />
        <motion.circle
          animate={{ strokeDasharray: `${score * length} ${length}` }}
          cx="32"
          cy="32"
          fill="none"
          initial={reduceMotion ? false : { strokeDasharray: `0 ${length}` }}
          r="26"
          stroke="url(#profile-strength)"
          strokeLinecap="round"
          strokeWidth="6"
          transform="rotate(-90 32 32)"
          transition={{ duration: 1.3, ease, delay: 0.3 }}
        />
        <defs>
          <linearGradient id="profile-strength" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
      </svg>
      <span className="font-heading text-base font-bold text-foreground tabular-nums">
        {Math.round(score * 100)}%
      </span>
    </span>
  )
}

// The learner's identity over an aurora cover, what the coach knows at a
// glance, and (when given) how complete the profile is.
export function ProfileBanner({
  email,
  profile,
  action,
  strength,
}: {
  email: string | undefined | null
  profile: LearnerProfile | null | undefined
  action?: ReactNode
  strength?: { score: number; items: readonly StrengthItem[] }
}) {
  const identity = useUserIdentity()
  const reduceMotion = useReducedMotion()
  const chips: ReadonlyArray<{ icon: IconComponent; label: string }> = profile
    ? [
        { icon: TrendingUp, label: readableValue(profile.experience) },
        { icon: Target, label: readableValue(profile.goal) },
        {
          icon: Flame,
          label: `${readableValue(profile.difficultyComfort)} difficulty`,
        },
      ]
    : []
  const missing = strength?.items.filter((item) => !item.done) ?? []

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      transition={{ duration: 0.6, ease }}
    >
      <div
        aria-hidden="true"
        className="relative isolate h-32 overflow-hidden bg-[#050b12] sm:h-40"
      >
        <span className="animate-aurora absolute -top-24 -left-16 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.55),transparent)] blur-2xl" />
        <span className="animate-aurora absolute -right-10 -bottom-32 size-96 rounded-full bg-[radial-gradient(closest-side,rgba(34,197,94,0.4),transparent)] blur-2xl [animation-delay:-6s]" />
        <span className="animate-aurora absolute -top-20 left-1/2 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.3),transparent)] blur-2xl [animation-delay:-3s]" />
        <span className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.22)_1px,transparent_1px)] bg-size-[18px_18px] [mask-image:linear-gradient(90deg,transparent,black_40%,black)]" />
        <svg
          className="absolute -top-16 right-[6%] size-72 text-white"
          viewBox="0 0 200 200"
        >
          {[90, 70, 50].map((radius, index) => (
            <g
              className={reduceMotion ? undefined : 'memory-orbit'}
              key={radius}
              style={{
                transformOrigin: '100px 100px',
                animationDuration: `${30 + index * 12}s`,
                animationDirection: index % 2 ? 'reverse' : 'normal',
              }}
            >
              <circle
                cx="100"
                cy="100"
                fill="none"
                r={radius}
                stroke="currentColor"
                strokeDasharray={index === 1 ? '2 6' : '12 10'}
                strokeOpacity="0.22"
              />
              <circle cx={100 + radius} cy="100" fill="#7dd3fc" r="2.5" />
            </g>
          ))}
        </svg>
      </div>

      <div className="relative px-5 pb-6 sm:px-8 sm:pb-7">
        <div className="-mt-11 flex flex-col gap-5 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <span className="relative grid size-[5.75rem] shrink-0 place-items-center sm:size-[6.75rem]">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#38bdf8,#22c55e,#a78bfa,#38bdf8)] motion-safe:animate-[spin_9s_linear_infinite]"
              />
              <UserAvatar className="relative size-20 border-4 border-card text-3xl sm:size-24 sm:text-4xl" />
            </span>
            <div className="min-w-0 pb-0.5 sm:pb-1">
              <motion.p
                animate={{ opacity: 1, x: 0 }}
                className="truncate font-heading text-2xl font-bold tracking-[-0.01em] text-foreground sm:text-3xl"
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                transition={{ duration: 0.5, ease, delay: 0.15 }}
              >
                {identity.name}
              </motion.p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {email ?? 'Signed in'}
              </p>
            </div>
          </div>
          {action ? <div className="shrink-0 sm:pb-1">{action}</div> : null}
        </div>

        {chips.length || strength ? (
          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between">
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip, index) => (
                <motion.li
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/55 px-3 py-1 text-xs font-medium text-foreground"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  key={chip.label}
                  transition={{
                    duration: 0.4,
                    ease,
                    delay: 0.25 + index * 0.07,
                  }}
                >
                  <chip.icon
                    aria-hidden="true"
                    className="size-3.5 text-primary"
                  />
                  {chip.label}
                </motion.li>
              ))}
            </ul>
            {strength ? (
              <div className="flex items-center gap-3">
                <StrengthRing score={strength.score} />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-foreground">
                    Profile strength
                  </p>
                  {missing.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Your coach has everything it asks for.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Add{' '}
                      {missing.slice(0, 2).map((item, index) => (
                        <span key={item.key}>
                          {index > 0 ? ' and ' : ''}
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            to={item.to}
                          >
                            {item.label.toLowerCase()}
                          </Link>
                        </span>
                      ))}{' '}
                      to sharpen your picks.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.section>
  )
}
