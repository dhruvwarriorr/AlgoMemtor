import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'

import { landingEase, progressBetween } from './landing-motion'

const letters = 'ALGOMEMTOR'.split('')

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

// One letter of the brand word. Once the word is full it lifts away on its
// own curve, so the word breaks up like a wave rolling through it.
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
  const start = 0.44 + index * 0.02
  const lift = -38 - 22 * (phase + 1)
  // Function transforms: the accelerated native scroll path mis-ranges
  // value-list transforms inside the sticky scene.
  const y = useTransform(
    progress,
    (v) => `${lift * smooth(progressBetween(v, start, 0.95))}vh`,
  )
  const rotate = useTransform(
    progress,
    (v) => phase * 14 * smooth(progressBetween(v, start, 0.95)),
  )
  const opacity = useTransform(
    progress,
    (v) => 1 - progressBetween(v, start + 0.08, 0.92),
  )

  return (
    <motion.span className="inline-block" style={{ y, rotate, opacity }}>
      <WaveLetter letter={letter} />
    </motion.span>
  )
}

function WaveLetter({ letter }: { letter: string }) {
  return (
    <span
      className="wave-text inline-block [--wave-base:#f4f1ea]"
      data-wave-letter=""
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

// The brand word, filled like the closing line: liquid pours in on arrival
// and rises until the word is solid blue, then its letters scatter upward.
export function WaveHero() {
  const reduceMotion = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const wordRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ['start start', 'end end'],
  })
  useAlignedWaves(wordRef)

  // The pour on arrival: from nearly empty to the starting waterline.
  const pour = useMotionValue(reduceMotion ? 30 : 8)
  useEffect(() => {
    if (reduceMotion) return
    const controls = animate(pour, 30, {
      duration: 1.8,
      ease: landingEase,
      delay: 0.3,
    })
    return () => controls.stop()
  }, [pour, reduceMotion])

  const level = useTransform(
    [scrollYProgress, pour],
    ([progress, start]) =>
      `${Number(start) + 72 * progressBetween(Number(progress), 0, 0.4)}%`,
  )
  const cueOpacity = useTransform(scrollYProgress, (v) =>
    Math.max(0, 1 - v / 0.06),
  )

  if (reduceMotion) {
    return (
      <section
        aria-label="AlgoMemtor"
        className="flex h-dvh w-full items-center justify-center overflow-hidden"
      >
        <div
          aria-hidden="true"
          className={wordClass}
          ref={wordRef}
          style={{ '--wave-level': '100%' } as CSSProperties}
        >
          {letters.map((letter, index) => (
            <WaveLetter key={index} letter={letter} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="AlgoMemtor"
      className="relative h-[200dvh]"
      ref={sceneRef}
    >
      <div className="sticky top-0 flex h-dvh w-full items-center justify-center overflow-hidden">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          aria-hidden="true"
          className={wordClass}
          initial={{ opacity: 0, y: 24 }}
          ref={wordRef}
          style={{ '--wave-level': level } as unknown as CSSProperties}
          transition={{ duration: 1, ease: landingEase }}
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
