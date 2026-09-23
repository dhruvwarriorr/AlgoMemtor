import { useEffect, useRef, type CSSProperties } from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'

import type { AuthStatus } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

import { LandingActions } from './LandingActions'

const ease = [0.16, 1, 0.3, 1] as const
const letters = 'ALGOMEMTOR'.split('')

// One letter of the brand word. On scroll it lifts away on its own curve, so
// the word breaks up like a wave rolling through it.
function DriftLetter({
  letter,
  index,
  progress,
}: {
  letter: string
  index: number
  progress: MotionValue<number>
}) {
  const phase = Math.sin(index * 0.9)
  const start = 0.32 + index * 0.025
  const y = useTransform(
    progress,
    [start, 0.9],
    ['0vh', `${-38 - 22 * (phase + 1)}vh`],
  )
  const rotate = useTransform(progress, [start, 0.9], [0, phase * 14])
  const opacity = useTransform(progress, [start + 0.15, 0.85], [1, 0])

  return (
    <motion.span className="inline-block" style={{ y, rotate, opacity }}>
      <span
        className="animate-letter-bob wave-text inline-block [--wave-base:#f4f1ea]"
        data-wave-letter=""
        style={{ '--i': index } as CSSProperties}
      >
        {letter}
      </span>
    </motion.span>
  )
}

export function WaveHero({ status }: { status: AuthStatus }) {
  const reduceMotion = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const wordRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ['start start', 'end start'],
  })
  // First the letters fill with liquid, then they drift apart.
  const level = useTransform(scrollYProgress, [0, 0.3], ['30%', '94%'])
  // A function transform keeps this on Motion's scroll tracking; the
  // accelerated native path mis-ranges it inside the sticky scene.
  const cueOpacity = useTransform(scrollYProgress, (v) =>
    Math.max(0, 1 - v / 0.08),
  )

  // Offset each letter's waves by its position so the liquid reads as one
  // continuous surface across the whole word.
  useEffect(() => {
    const word = wordRef.current
    if (!word) return
    const align = () => {
      const origin = word.getBoundingClientRect().left
      word
        .querySelectorAll<HTMLElement>('[data-wave-letter]')
        .forEach((node) => {
          const offset = node.getBoundingClientRect().left - origin
          node.style.setProperty('--wave-offset', `${-offset}px`)
        })
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(word)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <section
        aria-label="AlgoMemtor"
        className={cn('relative', reduceMotion ? 'h-dvh' : 'h-[135dvh]')}
        ref={sceneRef}
      >
        <div className="sticky top-0 flex h-dvh w-full items-center justify-center overflow-hidden">
          <motion.div
            aria-hidden="true"
            className="flex font-heading text-[14vw] leading-none font-extrabold tracking-[-0.01em] uppercase select-none"
            ref={wordRef}
            style={
              reduceMotion
                ? ({ '--wave-level': '72%' } as CSSProperties)
                : ({ '--wave-level': level } as unknown as CSSProperties)
            }
          >
            {letters.map((letter, index) =>
              reduceMotion ? (
                <span
                  className="wave-text inline-block [--wave-base:#f4f1ea]"
                  data-wave-letter=""
                  key={index}
                >
                  {letter}
                </span>
              ) : (
                <DriftLetter
                  index={index}
                  key={index}
                  letter={letter}
                  progress={scrollYProgress}
                />
              ),
            )}
          </motion.div>

          {reduceMotion ? null : (
            <motion.div
              aria-hidden="true"
              className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-sm text-white/40"
              style={{ opacity: cueOpacity }}
            >
              <span>Scroll to fill</span>
              <span className="h-10 w-px bg-linear-to-b from-white/40 to-transparent" />
            </motion.div>
          )}
        </div>
      </section>

      <section className="relative z-20 flex flex-col items-center px-4 py-20 sm:py-24">
        <motion.div
          className="flex w-full max-w-4xl flex-col items-center text-center"
          initial={reduceMotion ? false : { opacity: 0, y: 100 }}
          transition={{ duration: 1.2, ease }}
          viewport={{ once: true, margin: '-100px' }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="glass-panel mb-8 inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs sm:text-sm">
            <span className="animate-pulse-glow size-2 rounded-full bg-primary" />
            <span className="font-medium text-white/80">
              Your CP journey, in one place
            </span>
          </p>

          <h1 className="text-5xl leading-[1.05] font-bold tracking-[-0.01em] text-white sm:text-7xl lg:text-8xl">
            One coach.
            <br />
            <span className="text-brand-gradient">Every platform.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed font-light text-white/65 sm:text-xl">
            Bring your public solves and contest history together. Get a coach
            that understands your progress and helps you decide what to practice
            next.
          </p>

          <div className="mt-10">
            <LandingActions status={status} />
          </div>
        </motion.div>
      </section>
    </>
  )
}
