import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { XCircle } from 'lucide-react'

// Opening sequence: a spotlight lands on a failed verdict, the
// lights cut out, then the coach answers it. Skippable at any point.

type Step = 'waiting' | 'spotlight' | 'dark' | 'coach' | 'leaving'

export function CinematicIntro({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('waiting')
  const timers = useRef<number[]>([])
  const skipRef = useRef<HTMLButtonElement>(null)

  const finish = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    onComplete()
  }, [onComplete])

  const play = useCallback(() => {
    if (step !== 'waiting') return
    const at = (ms: number, fn: () => void) =>
      timers.current.push(window.setTimeout(fn, ms))
    setStep('spotlight')
    at(4800, () => setStep('dark'))
    at(5600, () => setStep('coach'))
    at(8600, () => setStep('leaving'))
    at(9800, finish)
  }, [finish, step])

  // Start on its own shortly after load, like a title card.
  useEffect(() => {
    if (step !== 'waiting') return
    const id = window.setTimeout(play, 1200)
    return () => window.clearTimeout(id)
  }, [play, step])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skipRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') finish()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [finish])

  useEffect(
    () => () => timers.current.forEach((id) => window.clearTimeout(id)),
    [],
  )

  return (
    <motion.div
      animate={{ opacity: step === 'leaving' ? 0 : 1 }}
      aria-label="AlgoMemtor introduction"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[#050506] text-white"
      initial={{ opacity: 1 }}
      role="dialog"
      style={{ pointerEvents: step === 'leaving' ? 'none' : 'auto' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <button
        className="absolute top-6 right-6 z-10 rounded-md px-4 py-2 text-xs font-semibold tracking-[0.2em] text-white/40 uppercase transition-colors hover:text-white focus-visible:text-white focus-visible:outline-2 focus-visible:outline-white/60"
        onClick={finish}
        ref={skipRef}
        type="button"
      >
        Skip intro
      </button>

      <AnimatePresence mode="wait">
        {step === 'waiting' ? (
          <motion.button
            animate={{ opacity: 1 }}
            className="border border-white/10 px-8 py-3 text-sm font-semibold tracking-[0.4em] text-white/45 uppercase transition-colors duration-500 hover:border-white/50 hover:text-white"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            initial={{ opacity: 0 }}
            key="waiting"
            onClick={play}
            type="button"
          >
            [ Begin ]
          </motion.button>
        ) : null}

        {step === 'spotlight' ? (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            key="spotlight"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 26%, rgba(0,0,0,1) 60%)',
              }}
            />
            <motion.div
              animate={{ scale: 1, filter: 'brightness(1)' }}
              className="relative flex flex-col items-center px-6"
              initial={{ scale: 0.92, filter: 'brightness(0)' }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="w-full max-w-md bg-white p-6 text-[#101012] shadow-[0_0_100px_rgba(255,255,255,0.08)]">
                <div className="flex items-center justify-between text-xs text-black/50">
                  <span>Submission · Problem C</span>
                  <span>Attempt 4</span>
                </div>
                <p className="mt-4 flex items-center gap-2 font-mono text-lg font-semibold text-[#c2410c]">
                  <XCircle aria-hidden="true" className="size-5" />
                  Wrong answer on test 7
                </p>
                <p className="mt-2 text-sm text-black/60">
                  Same greedy idea. Same edge case. Third time this week.
                </p>
              </div>
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mt-12 text-center"
                initial={{ opacity: 0, y: 10 }}
                transition={{ delay: 1, duration: 0.9 }}
              >
                <p className="text-xl font-light tracking-[0.3em] text-white/75 uppercase sm:text-2xl">
                  You have seen this verdict before.
                </p>
                <p className="mt-2 text-xl font-bold tracking-[0.3em] uppercase sm:text-2xl">
                  You will see it again.
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        ) : null}

        {step === 'dark' ? (
          <motion.div className="absolute inset-0 bg-black" key="dark" />
        ) : null}

        {step === 'coach' || step === 'leaving' ? (
          <motion.div
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            className="relative flex flex-col items-center px-6 text-center"
            initial={{ opacity: 0, filter: 'blur(20px)', scale: 0.9 }}
            key="coach"
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              aria-hidden="true"
              className="coach-orb mb-8 size-20 shadow-[0_0_90px_rgba(255,106,53,0.6)]"
            />
            <p className="text-4xl font-thin tracking-[0.2em] text-white/90 uppercase sm:text-6xl">
              Unless…
            </p>
            <p className="mt-6 text-lg font-light tracking-[0.25em] text-white/55 uppercase sm:text-xl">
              Your coach remembers why.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
