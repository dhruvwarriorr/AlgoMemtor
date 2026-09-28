import { useRef, type CSSProperties } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { Link } from '@/lib/router'

import { ArrowUpRight } from '@/components/icons/algo-icons'
import { useAuth } from '@/features/auth/useAuth'

import { landingEase as ease, progressBetween } from './landing-motion'

const lineClass =
  'wave-text block font-heading leading-[0.9] font-extrabold tracking-[-0.02em] uppercase [--wave-base:#f4f1ea]'

// The same action as the top bar, for whoever reached the end of the story.
function ClosingAction() {
  const { status } = useAuth()
  if (status === 'loading') return null
  const signedIn = status === 'authenticated'
  return (
    <Link
      className="group/cta inline-flex items-center gap-3 rounded-2xl bg-[#f4f1ea] py-2 pr-2 pl-6 text-base font-semibold text-[#0b0c0e] shadow-[0_20px_60px_-20px_rgba(56,189,248,0.8)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.03] active:scale-[0.98]"
      to={signedIn ? '/dashboard' : '/login'}
    >
      {signedIn ? 'Open your dashboard' : 'Start practising'}
      <span className="grid size-10 place-items-center rounded-xl bg-[#0b0c0e] text-[#f4f1ea] transition-transform duration-500 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 [--icon-node:#4ade80]">
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  )
}

// The closing line fills with the same liquid as the brand word at the top
// of the page as it scrolls into view.
export function ClosingCall() {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  })
  const level = useTransform(
    scrollYProgress,
    (v) => `${30 + 40 * progressBetween(v, 0.2, 1)}%`,
  )
  const rise = (delay: number) => ({
    initial: reduceMotion ? false : ({ opacity: 0, y: 24 } as const),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.8, ease, delay },
  })

  return (
    <section
      aria-labelledby="landing-closing"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-28 text-center sm:px-8"
      ref={ref}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.16),transparent)] blur-2xl"
      />
      <motion.p
        {...rise(0)}
        className="flex items-center gap-3 font-mono text-xs tracking-[0.28em] text-[#7dd3fc] uppercase"
      >
        <span className="text-white/35">05</span>
        <span aria-hidden="true" className="h-px w-8 bg-[#7dd3fc]/50" />
        Your turn
      </motion.p>
      <motion.h2
        className="mt-6 select-none"
        id="landing-closing"
        style={
          {
            '--wave-level': reduceMotion ? '70%' : level,
          } as unknown as CSSProperties
        }
      >
        <span className={`${lineClass} text-[15vw] sm:text-[11vw]`}>Start</span>
        <span className={`${lineClass} text-[11vw] sm:text-[8.6vw]`}>
          remembering.
        </span>
      </motion.h2>
      <motion.p
        {...rise(0.1)}
        className="mt-8 max-w-xl text-base leading-7 text-white/60 sm:text-lg"
      >
        Link a public profile and your coach starts learning how you solve.
        Every problem you open still lives on its own platform.
      </motion.p>
      <motion.div {...rise(0.18)} className="mt-10">
        <ClosingAction />
      </motion.div>
    </section>
  )
}
