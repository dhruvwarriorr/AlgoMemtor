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
import { ReadinessRing } from './ReadinessRing'

// Illustrative topic strengths for the hero preview. Labelled as an example.
const exampleTopics = [
  { label: 'Arrays', value: 82, tone: 'bg-go' },
  { label: 'Two pointers', value: 64, tone: 'bg-primary' },
  { label: 'Greedy', value: 51, tone: 'bg-primary' },
  { label: 'Graphs', value: 38, tone: 'bg-[#ff8a5c]' },
  { label: 'Dynamic programming', value: 27, tone: 'bg-destructive' },
]

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
        className={cn('relative', reduceMotion ? 'h-dvh' : 'h-[170dvh]')}
        ref={sceneRef}
      >
        <div className="sticky top-0 flex h-dvh w-full items-center justify-center overflow-hidden">
          <motion.div
            aria-hidden="true"
            className="flex font-heading text-[14vw] leading-none font-extrabold tracking-[-0.04em] uppercase select-none"
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

      <section className="relative z-20 flex flex-col items-center px-4 pb-32">
        <motion.div
          className="flex w-full max-w-5xl flex-col items-center text-center"
          initial={reduceMotion ? false : { opacity: 0, y: 100 }}
          transition={{ duration: 1.2, ease }}
          viewport={{ once: true, margin: '-100px' }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="glass-panel mb-8 inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs">
            <span className="animate-pulse-glow size-2 rounded-full bg-primary" />
            <span className="font-medium text-white/80">
              AlgoMemtor · The AI coach for competitive programming
            </span>
          </p>

          <h1 className="text-5xl leading-[1.05] font-bold tracking-[-0.04em] text-white sm:text-7xl">
            The AI coach that
            <br />
            <span className="text-primary">knows your CP journey.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-xl leading-relaxed font-light text-white/60">
            It reads your profile and solve history across Codeforces, LeetCode
            and CodeChef, then coaches the topics holding you back.
          </p>

          <div className="mt-12">
            <LandingActions status={status} />
          </div>

          <div className="relative mx-auto mt-24 w-full max-w-4xl">
            <div
              aria-hidden="true"
              className="animate-float-slow absolute -top-16 left-1/4 -z-10 size-80 rounded-full bg-primary/25 blur-3xl"
            />
            <div className="pointer-events-none absolute inset-0 z-10 rounded-3xl bg-linear-to-t from-[#0d0d0f] via-transparent to-transparent" />
            <div className="glass-panel relative rounded-3xl p-6 text-left shadow-[0_0_80px_rgba(255,255,255,0.04)] sm:p-8">
              <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm font-medium text-white/50">
                    Coach readout · Example learner
                  </p>
                  <p className="text-lg font-semibold text-white">
                    Where your practice stands
                  </p>
                </div>
                <div aria-hidden="true" className="flex gap-2">
                  <span className="size-3 rounded-full bg-destructive/60" />
                  <span className="size-3 rounded-full bg-primary/60" />
                  <span className="size-3 rounded-full bg-go/60" />
                </div>
              </div>

              <div className="flex flex-col items-center gap-12 md:flex-row">
                <ReadinessRing label="Contest readiness" value={68} />
                <ul className="w-full flex-1 space-y-4">
                  {exampleTopics.map((topic, index) => (
                    <motion.li
                      initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                      key={topic.label}
                      transition={{ delay: 0.2 + index * 0.1 }}
                      viewport={{ once: true }}
                      whileInView={{ opacity: 1, x: 0 }}
                    >
                      <div className="mb-1.5 flex justify-between text-sm font-medium">
                        <span className="text-white/60">{topic.label}</span>
                        <span className="text-white">{topic.value}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-md bg-white/10">
                        <motion.div
                          className={cn('h-full rounded-md', topic.tone)}
                          initial={reduceMotion ? false : { scaleX: 0 }}
                          style={{ width: `${topic.value}%`, originX: 0 }}
                          transition={{
                            delay: 0.4 + index * 0.1,
                            duration: 1,
                            ease,
                          }}
                          viewport={{ once: true }}
                          whileInView={{ scaleX: 1 }}
                        />
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </section>
    </>
  )
}
