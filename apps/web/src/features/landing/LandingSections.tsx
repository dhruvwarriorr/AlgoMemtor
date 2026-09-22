import { useEffect, useRef, useState } from 'react'
import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Bookmark,
  Brain,
  CalendarDays,
  Compass,
  ExternalLink,
  Lightbulb,
  Link2,
  LineChart,
  MessagesSquare,
  PowerOff,
  Route,
  ScanSearch,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

import { LogoMark } from '@/components/brand/LogoMark'
import { Wordmark } from '@/components/brand/Wordmark'
import type { AuthStatus } from '@/features/auth/auth-context'

import { LandingActions } from './LandingActions'

const ease = [0.16, 1, 0.3, 1] as const

function SectionTitle({
  title,
  accent,
  subtitle,
  id,
}: {
  title: string
  accent: string
  subtitle: string
  id: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="mb-14 text-center">
      <motion.h2
        className="text-3xl font-bold tracking-tight text-white sm:text-5xl"
        id={id}
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8, ease }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
      >
        {title} <span className="text-brand-gradient">{accent}</span>
      </motion.h2>
      <p className="mx-auto mt-4 max-w-xl text-white/60">{subtitle}</p>
    </div>
  )
}

/* ---------- Journey timeline ---------- */

const journey = [
  { label: 'Link handles', desc: 'Codeforces, CodeChef, LeetCode.' },
  { label: 'First verdicts', desc: 'Your coach reads what you solved.' },
  { label: 'Gaps surface', desc: 'Weak topics show up in the data.' },
  { label: 'A plan forms', desc: 'An adaptive roadmap, not a list.' },
  { label: 'Practice', desc: 'Each problem says why it fits.' },
  { label: 'Re-assessed', desc: 'New solves shift the plan.' },
  { label: 'Rating climbs', desc: 'Progress you can trace back.' },
]

export function JourneyTimeline() {
  const reduceMotion = useReducedMotion()
  return (
    <section
      aria-labelledby="journey-heading"
      className="relative scroll-mt-28 px-4 py-24"
      id="journey"
    >
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          accent="remembered."
          id="journey-heading"
          subtitle="Every verdict adds to what your coach knows about you."
          title="Your CP journey,"
        />
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute top-8 right-0 left-0 hidden h-px bg-linear-to-r from-transparent via-primary/50 to-transparent lg:block"
          />
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-7">
            {journey.map((step, index) => (
              <motion.li
                className="relative flex items-center gap-4 lg:flex-col lg:gap-3 lg:text-center"
                initial={reduceMotion ? false : { opacity: 0, y: 30 }}
                key={step.label}
                transition={{ delay: index * 0.08, duration: 0.7, ease }}
                viewport={{ once: true }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary font-heading text-lg font-bold text-white shadow-[0_0_24px_rgba(255,106,53,0.45)]">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {step.label}
                  </span>
                  <span className="mt-1 block text-xs text-white/55">
                    {step.desc}
                  </span>
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ---------- Why it matters ---------- */

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(reduceMotion ? to : 0)

  useEffect(() => {
    if (!inView || reduceMotion) return
    const controls = animate(0, to, {
      duration: 1.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setShown(Math.round(value)),
    })
    return () => controls.stop()
  }, [inView, reduceMotion, to])

  return (
    <span ref={ref}>
      {shown}
      {suffix}
    </span>
  )
}

// Product facts, not marketing estimates.
const facts = [
  { value: 4, suffix: '', label: 'Platforms your coach reads, CSES included.' },
  {
    value: 30,
    suffix: '-day',
    label: 'Evidence window behind every streak and stat.',
  },
  {
    value: 100,
    suffix: '%',
    label: 'Of problems open on their original platform.',
  },
]

const principles: ReadonlyArray<{
  icon: LucideIcon
  title: string
  desc: string
}> = [
  {
    icon: Lightbulb,
    title: 'Every pick has a reason',
    desc: 'Each suggestion says which gap it closes.',
  },
  {
    icon: Link2,
    title: 'Respects the source',
    desc: 'Metadata only. Never statements or editorials.',
  },
  {
    icon: ShieldCheck,
    title: 'Honest evidence',
    desc: 'Opening a problem is not solving it.',
  },
  {
    icon: PowerOff,
    title: 'AI stays optional',
    desc: 'Search and links work when the model is down.',
  },
  {
    icon: Brain,
    title: 'Memory you control',
    desc: 'Review, correct or delete what it remembers.',
  },
]

export function WhyItMatters() {
  const reduceMotion = useReducedMotion()
  return (
    <section
      aria-labelledby="principles-heading"
      className="relative scroll-mt-28 px-4 py-24"
      id="principles"
    >
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          accent="trust it"
          id="principles-heading"
          subtitle="A coach is only useful if its advice is grounded. These are the rules it follows."
          title="Why you can"
        />
        <div className="mb-14 grid gap-6 sm:grid-cols-3">
          {facts.map((fact, index) => (
            <motion.div
              className="glass-panel-strong rounded-3xl p-8 text-center"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              key={fact.label}
              transition={{ delay: index * 0.1, duration: 0.7, ease }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <p className="mb-2 font-heading text-5xl font-bold tracking-[-0.04em] text-brand-gradient">
                <CountUp suffix={fact.suffix} to={fact.value} />
              </p>
              <p className="text-sm text-white/60">{fact.label}</p>
            </motion.div>
          ))}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {principles.map((item, index) => (
            <motion.li
              className="glass-panel rounded-2xl p-5 transition-shadow duration-300 hover:shadow-glow"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              key={item.title}
              transition={{ delay: index * 0.06, duration: 0.6, ease }}
              viewport={{ once: true }}
              whileHover={reduceMotion ? undefined : { y: -6 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <span className="bg-brand-gradient shadow-glow mb-4 grid size-11 place-items-center rounded-xl">
                <item.icon aria-hidden="true" className="size-5 text-white" />
              </span>
              <p className="mb-1 font-semibold text-white">{item.title}</p>
              <p className="text-xs leading-relaxed text-white/55">
                {item.desc}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- How it works ---------- */

const howSteps = [
  {
    n: '01',
    icon: Link2,
    title: 'Link your handles',
    desc: 'Add public Codeforces, CodeChef or LeetCode profiles. Nothing is fetched without consent.',
  },
  {
    n: '02',
    icon: ScanSearch,
    title: 'Your coach reads the evidence',
    desc: 'Verdicts, ratings and topics become a picture of where you really stand.',
  },
  {
    n: '03',
    icon: Route,
    title: 'Practice with a reason',
    desc: 'Hints, a roadmap and problems that each explain the gap they close.',
  },
]

export function HowItWorks() {
  const reduceMotion = useReducedMotion()
  return (
    <section
      aria-labelledby="how-heading"
      className="relative scroll-mt-28 px-4 py-24"
      id="how-it-works"
    >
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          accent="works"
          id="how-heading"
          subtitle="Three steps between a failed verdict and knowing exactly what to fix."
          title="How it"
        />
        <ol className="relative grid gap-6 md:grid-cols-3">
          {howSteps.map((step, index) => (
            <motion.li
              className="glass-panel-strong group relative rounded-3xl p-8 transition-shadow duration-300 hover:shadow-glow"
              initial={reduceMotion ? false : { opacity: 0, y: 30 }}
              key={step.n}
              transition={{ delay: index * 0.12, duration: 0.7, ease }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <p className="mb-2 font-heading text-6xl font-bold text-brand-gradient opacity-40">
                {step.n}
              </p>
              <span className="bg-brand-gradient shadow-glow mb-5 grid size-14 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110">
                <step.icon aria-hidden="true" className="size-6 text-white" />
              </span>
              <p className="mb-2 text-lg font-semibold text-white">
                {step.title}
              </p>
              <p className="text-sm leading-relaxed text-white/60">
                {step.desc}
              </p>
              {index < howSteps.length - 1 ? (
                <ArrowRight
                  aria-hidden="true"
                  className="absolute top-1/2 -right-6 hidden size-8 -translate-y-1/2 text-primary/50 md:block"
                />
              ) : null}
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------- Coach toolkit ---------- */

const toolkit: ReadonlyArray<{
  icon: LucideIcon
  title: string
  desc: string
}> = [
  {
    icon: MessagesSquare,
    title: 'Progressive hints',
    desc: 'Nudges before answers.',
  },
  {
    icon: Trophy,
    title: 'Contest debriefs',
    desc: 'What changed your rating.',
  },
  {
    icon: Compass,
    title: 'Adaptive roadmap',
    desc: 'Focus topics that update.',
  },
  { icon: Brain, title: 'Learner memory', desc: 'Patterns you can review.' },
  {
    icon: BellRing,
    title: 'Weekly check-ins',
    desc: 'A short review, on your day.',
  },
  { icon: Lightbulb, title: 'Reasoned picks', desc: 'Why each problem fits.' },
  {
    icon: CalendarDays,
    title: 'Solve calendar',
    desc: 'Every day you practiced.',
  },
  { icon: LineChart, title: 'Topic insights', desc: 'Strength across topics.' },
  { icon: Bookmark, title: 'Bookmarks', desc: 'Problems saved for later.' },
  {
    icon: ExternalLink,
    title: 'Original links',
    desc: 'Solve where it lives.',
  },
]

export function CoachToolkit() {
  const reduceMotion = useReducedMotion()
  return (
    <section aria-labelledby="toolkit-heading" className="relative px-4 py-24">
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          accent="practice smarter"
          id="toolkit-heading"
          subtitle="Ten tools, all fed by the same picture of your practice."
          title="Everything you need to"
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {toolkit.map((item, index) => (
            <motion.li
              className="glass-panel group relative overflow-hidden rounded-2xl p-5 transition-shadow duration-300 hover:shadow-glow"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              key={item.title}
              transition={{ delay: (index % 5) * 0.05, duration: 0.6, ease }}
              viewport={{ once: true }}
              whileHover={reduceMotion ? undefined : { y: -6, scale: 1.02 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <span
                aria-hidden="true"
                className="bg-brand-gradient absolute -top-8 -right-8 size-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-25"
              />
              <span className="glass-panel group-hover:bg-brand-gradient relative mb-4 grid size-11 place-items-center rounded-xl transition-colors duration-300">
                <item.icon
                  aria-hidden="true"
                  className="size-5 text-primary transition-colors duration-300 group-hover:text-white"
                />
              </span>
              <p className="relative mb-1 text-sm font-semibold text-white">
                {item.title}
              </p>
              <p className="relative text-xs leading-relaxed text-white/55">
                {item.desc}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Closing CTA + footer ---------- */

export function ClosingCta({ status }: { status: AuthStatus }) {
  const reduceMotion = useReducedMotion()
  return (
    <section
      aria-labelledby="cta-heading"
      className="relative overflow-hidden px-4 py-32"
    >
      <div
        aria-hidden="true"
        className="animate-pulse-glow absolute top-1/2 left-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
      />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="coach-orb animate-orb mb-10 size-20"
        />
        <motion.h2
          className="text-4xl font-bold tracking-tight text-white sm:text-6xl"
          id="cta-heading"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          Ready to meet the coach
          <br />
          that <span className="text-brand-gradient">knows you?</span>
        </motion.h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">
          Link a profile, set a goal, and get a plan built from your own
          verdicts in minutes.
        </p>
        <div className="mt-10">
          <LandingActions status={status} />
        </div>
      </div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer className="relative border-t border-white/10 px-4 py-14">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3">
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            <LogoMark />
            <Wordmark className="text-base [--wave-base:#ffffff]" />
          </div>
          <p className="max-w-sm text-sm text-white/55">
            The AI coach for competitive programming that knows your journey.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="mb-4 text-base font-semibold text-white">
            On this page
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm text-white/55">
            <li>
              <a className="transition-colors hover:text-white" href="#journey">
                Journey
              </a>
            </li>
            <li>
              <a
                className="transition-colors hover:text-white"
                href="#how-it-works"
              >
                How it works
              </a>
            </li>
            <li>
              <a
                className="transition-colors hover:text-white"
                href="#principles"
              >
                Principles
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Attribution</p>
          <p className="glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-white/65">
            <BadgeCheck aria-hidden="true" className="size-3.5 text-primary" />
            Problems belong to their original platforms
          </p>
          <p className="mt-4 text-xs text-white/40">
            © {new Date().getFullYear()} AlgoMemtor
          </p>
        </div>
      </div>
    </footer>
  )
}
