import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'

import { LogoOrbit } from './LogoOrbit'

const letters = 'ALGOMEMTOR'.split('')

// Position of `v` between `from` and `to`, clamped to 0–1.
function span(v: number, from: number, to: number) {
  return Math.min(1, Math.max(0, (v - from) / (to - from)))
}

function ease(t: number) {
  return t * t * (3 - 2 * t)
}

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
  const start = 0.3 + index * 0.02
  const lift = -38 - 22 * (phase + 1)
  // Function transforms: the accelerated native scroll path mis-ranges
  // value-list transforms inside the sticky scene.
  const y = useTransform(
    progress,
    (v) => `${lift * ease(span(v, start, 0.66))}vh`,
  )
  const rotate = useTransform(
    progress,
    (v) => phase * 14 * ease(span(v, start, 0.66)),
  )
  const opacity = useTransform(progress, (v) => 1 - span(v, start + 0.08, 0.62))

  return (
    <motion.span className="inline-block" style={{ y, rotate, opacity }}>
      <WaveLetter index={index} letter={letter} />
    </motion.span>
  )
}

function WaveLetter({ letter, index }: { letter: string; index: number }) {
  return (
    <span
      className="animate-letter-bob wave-text inline-block [--wave-base:#f4f1ea]"
      data-wave-letter=""
      style={{ '--i': index } as CSSProperties}
    >
      {letter}
    </span>
  )
}

// Offset each letter's waves by its position so the liquid reads as one
// continuous surface across the whole word.
function useAlignedWaves(wordRef: RefObject<HTMLDivElement | null>) {
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
  }, [wordRef])
}

const wordClass =
  'flex font-heading text-[14vw] leading-none font-extrabold tracking-[-0.01em] uppercase select-none'

// The whole landing in one pinned scene: the brand word fills with liquid,
// its letters scatter, and the big orbiting logo rises into their place.
export function WaveHero() {
  const reduceMotion = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const wordRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ['start start', 'end end'],
  })
  useAlignedWaves(wordRef)

  // Function transforms keep these on Motion's scroll tracking; the
  // accelerated native path mis-ranges them inside the sticky scene.
  const level = useTransform(
    scrollYProgress,
    (v) => `${30 + 64 * span(v, 0, 0.26)}%`,
  )
  const cueOpacity = useTransform(scrollYProgress, (v) =>
    Math.max(0, 1 - v / 0.06),
  )
  const orbitOpacity = useTransform(scrollYProgress, (v) => span(v, 0.5, 0.72))
  const orbitScale = useTransform(
    scrollYProgress,
    (v) => 0.55 + 0.45 * (1 - (1 - span(v, 0.5, 0.8)) ** 3),
  )
  const orbitBlur = useTransform(
    scrollYProgress,
    (v) => `blur(${((1 - span(v, 0.5, 0.72)) * 16).toFixed(1)}px)`,
  )

  if (reduceMotion) {
    return (
      <section aria-label="AlgoMemtor" className="flex flex-col items-center">
        <div className="flex h-dvh w-full items-center justify-center overflow-hidden">
          <div
            aria-hidden="true"
            className={wordClass}
            ref={wordRef}
            style={{ '--wave-level': '72%' } as CSSProperties}
          >
            {letters.map((letter, index) => (
              <WaveLetter index={index} key={index} letter={letter} />
            ))}
          </div>
        </div>
        <div className="flex min-h-dvh w-full items-center justify-center px-4 py-24">
          <LogoOrbit />
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="AlgoMemtor"
      className="relative h-[280dvh]"
      ref={sceneRef}
    >
      <div className="sticky top-0 flex h-dvh w-full items-center justify-center overflow-hidden">
        <motion.div
          aria-hidden="true"
          className={wordClass}
          ref={wordRef}
          style={{ '--wave-level': level } as unknown as CSSProperties}
        >
          {letters.map((letter, index) => (
            <DriftLetter
              index={index}
              key={index}
              letter={letter}
              progress={scrollYProgress}
            />
          ))}
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-center px-4"
          style={{
            opacity: orbitOpacity,
            scale: orbitScale,
            filter: orbitBlur,
          }}
        >
          <LogoOrbit />
        </motion.div>

        <motion.div
          aria-hidden="true"
          className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-sm text-white/40"
          style={{ opacity: cueOpacity }}
        >
          <span>Scroll to fill</span>
          <span className="h-10 w-px bg-linear-to-b from-white/40 to-transparent" />
        </motion.div>
      </div>
    </section>
  )
}
