import { useRef } from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'

import { cn } from '@/lib/utils'

import { progressBetween } from './landing-motion'

type Tone = 'plain' | 'verdict' | 'accent' | 'solved'

const statement: ReadonlyArray<{ text: string; tone?: Tone }> = [
  { text: 'You grind for hours. You forget by Friday. Then' },
  { text: 'Wrong answer on test 7', tone: 'verdict' },
  { text: 'again. The problem was never effort. It was memory.' },
  { text: 'AlgoMemtor', tone: 'accent' },
  {
    text: 'remembers every verdict, every weak topic, every contest, and turns them into the',
  },
  { text: 'one problem', tone: 'solved' },
  { text: 'you should solve next.' },
]

// Words in reading order; a highlighted phrase stays together as one chip.
const words: ReadonlyArray<{ text: string; tone: Tone }> = statement.flatMap(
  (part) =>
    part.tone === 'verdict' || part.tone === 'solved'
      ? [{ text: part.text, tone: part.tone }]
      : part.text
          .split(' ')
          .map((text) => ({ text, tone: part.tone ?? 'plain' })),
)

function Word({
  text,
  tone,
  index,
  progress,
}: {
  text: string
  tone: Tone
  index: number
  progress: MotionValue<number>
}) {
  const start = 0.08 + (index / words.length) * 0.72
  const opacity = useTransform(
    progress,
    (v) => 0.14 + 0.86 * progressBetween(v, start, start + 0.06),
  )
  const y = useTransform(
    progress,
    (v) => `${(1 - progressBetween(v, start, start + 0.06)) * 0.18}em`,
  )
  return (
    <motion.span className="inline-block" style={{ opacity, y }}>
      <WordFace text={text} tone={tone} />
    </motion.span>
  )
}

function WordFace({ text, tone }: { text: string; tone: Tone }) {
  if (tone === 'verdict') {
    return (
      <span className="inline-flex items-center gap-[0.3em] rounded-[0.3em] border border-[#f87171]/40 bg-[#ef4444]/12 px-[0.3em] py-[0.02em] font-mono text-[0.72em] font-semibold tracking-tight text-[#fca5a5] align-middle">
        <span className="size-[0.45em] rounded-full bg-[#ef4444] shadow-[0_0_12px_#ef4444]" />
        {text}
      </span>
    )
  }
  if (tone === 'solved') {
    return (
      <span className="inline-flex items-center gap-[0.25em] rounded-[0.3em] border border-[#4ade80]/40 bg-[#22c55e]/12 px-[0.3em] text-[#86efac]">
        {text}
      </span>
    )
  }
  return (
    <span className={cn(tone === 'accent' && 'text-[#7dd3fc]')}>{text}</span>
  )
}

const verdicts = [
  { label: 'WA · test 7', ok: false },
  { label: 'TLE · test 12', ok: false },
  { label: 'AC', ok: true },
  { label: 'WA · test 7', ok: false },
  { label: 'RE · test 3', ok: false },
  { label: 'AC', ok: true },
  { label: 'WA · test 7', ok: false },
  { label: 'AC', ok: true },
] as const

// A slow column of verdicts drifting upward behind the statement.
function VerdictStream({ className }: { className?: string }) {
  const column = [...verdicts, ...verdicts]
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute top-24 bottom-0 overflow-hidden [mask-image:linear-gradient(transparent,black_20%,black_80%,transparent)]',
        className,
      )}
    >
      <div className="landing-drift-up flex flex-col gap-4">
        {column.map((verdict, index) => (
          <span
            className={cn(
              'w-fit rounded-md border px-2.5 py-1 font-mono text-xs whitespace-nowrap',
              verdict.ok
                ? 'border-[#4ade80]/25 bg-[#22c55e]/8 text-[#86efac]/80'
                : 'border-[#f87171]/20 bg-[#ef4444]/6 text-[#fca5a5]/70',
            )}
            key={index}
            style={{ marginLeft: `${(index * 37) % 60}px` }}
          >
            {verdict.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// The problem, said once and large: the statement lights up word by word as
// the section scrolls past.
export function Manifesto() {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })
  const textClass =
    'font-heading text-[1.85rem] leading-[1.22] font-semibold tracking-[-0.02em] text-[#f4f1ea] sm:text-[2.6rem] lg:text-[3.1rem]'

  return (
    <section
      aria-labelledby="landing-manifesto"
      // Pulled up under the brand scene so the statement rises in while the
      // brand letters scatter.
      className={cn(
        'relative',
        reduceMotion ? 'py-32' : '-mt-[55dvh] h-[240dvh]',
      )}
      ref={ref}
    >
      <div
        className={cn(
          'flex w-full items-center overflow-hidden',
          !reduceMotion && 'sticky top-0 h-dvh',
        )}
      >
        <VerdictStream className="right-[4%] hidden w-44 lg:block" />
        <VerdictStream className="left-[3%] hidden w-40 opacity-60 xl:block [&>div]:[animation-duration:44s]" />
        <div className="relative mx-auto w-full max-w-5xl px-5 sm:px-8">
          <p className="mb-8 flex items-center gap-3 font-mono text-xs tracking-[0.28em] text-[#7dd3fc] uppercase">
            <span className="text-white/35">01</span>
            <span aria-hidden="true" className="h-px w-8 bg-[#7dd3fc]/50" />
            <span id="landing-manifesto">Why AlgoMemtor</span>
          </p>
          {reduceMotion ? (
            <p className={textClass}>
              {words.map((word, index) => (
                <span key={index}>
                  <WordFace text={word.text} tone={word.tone} />{' '}
                </span>
              ))}
            </p>
          ) : (
            <p className={textClass}>
              {words.map((word, index) => (
                <span key={index}>
                  <Word
                    index={index}
                    progress={scrollYProgress}
                    text={word.text}
                    tone={word.tone}
                  />{' '}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
