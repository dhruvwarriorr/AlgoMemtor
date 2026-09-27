import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import {
  Sparkles,
  Target,
  type IconComponent,
} from '@/components/icons/algo-icons'
import {
  ContestAnalysisIcon,
  DoubtHelperIcon,
  ProgressReportIcon,
  SolutionExplorerIcon,
  TestCaseVisualizerIcon,
  UpsolveIcon,
} from '@/components/icons/mentor-icons'
import { TracePreview } from '@/features/visualizer/stage/TracePreview'
import { cn } from '@/lib/utils'

import { landingEase as ease } from './landing-motion'
import { SectionIntro } from './SectionIntro'
import {
  ApproachDemo,
  CoachChatDemo,
  DialDemo,
  HintLadderDemo,
  PicksDemo,
  RatingDemo,
  UpsolveDemo,
} from './tool-demos'

function ToolCard({
  icon: Icon,
  name,
  title,
  color,
  index,
  className,
  children,
}: {
  icon: IconComponent
  name: string
  title: string
  color: string
  index: number
  className?: string
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.article
      className={cn(
        'group relative isolate flex min-w-0 flex-col gap-5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-5 transition-[border-color,background-color,transform,box-shadow] duration-500 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055] hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] sm:p-6',
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 32 }}
      transition={{ duration: 0.8, ease, delay: (index % 3) * 0.08 }}
      viewport={{ once: true, margin: '-60px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-64 rounded-full opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(closest-side, ${color}33, transparent)`,
        }}
      />
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-rotate-6"
          style={{ color }}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[0.68rem] tracking-[0.2em] text-white/45 uppercase">
            {name}
          </p>
          <h3 className="mt-1 font-heading text-lg leading-snug font-semibold text-[#f4f1ea]">
            {title}
          </h3>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        {children}
      </div>
    </motion.article>
  )
}

// Every mentor tool as a card with a small live preview of it at work.
export function ToolBento() {
  return (
    <section
      aria-labelledby="landing-tools"
      className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:py-32"
    >
      <SectionIntro
        eyebrow="The toolkit"
        index="03"
        title={
          <span id="landing-tools">A mentor for every step of practice.</span>
        }
      >
        Ask, get unstuck, compare approaches, trace your own code, and close the
        gaps a contest leaves behind. Every tool shares the same memory of how
        you solve.
      </SectionIntro>

      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        <ToolCard
          className="md:col-span-2 lg:col-span-7 lg:row-span-2"
          color="#7dd3fc"
          icon={Sparkles}
          index={0}
          name="Coach"
          title="A coach that remembers how you solve."
        >
          <CoachChatDemo />
        </ToolCard>
        <ToolCard
          className="lg:col-span-5"
          color="#4ade80"
          icon={Target}
          index={1}
          name="Recommendations"
          title="Ten real problems a day, each with a reason."
        >
          <PicksDemo />
        </ToolCard>
        <ToolCard
          className="lg:col-span-5"
          color="#fbbf24"
          icon={DoubtHelperIcon}
          index={2}
          name="Doubt Helper"
          title="Five levels of hints before any solution."
        >
          <HintLadderDemo />
        </ToolCard>
        <ToolCard
          className="lg:col-span-4"
          color="#a78bfa"
          icon={TestCaseVisualizerIcon}
          index={3}
          name="Visualizer"
          title="Watch your own code run, step by step."
        >
          <div className="[&>div]:border-white/10 [&>div]:bg-white/[0.03] [&>div]:shadow-none">
            <TracePreview />
          </div>
        </ToolCard>
        <ToolCard
          className="lg:col-span-4"
          color="#38bdf8"
          icon={UpsolveIcon}
          index={4}
          name="Upsolve"
          title="Close what every contest left open."
        >
          <UpsolveDemo />
        </ToolCard>
        <ToolCard
          className="lg:col-span-4"
          color="#F20AC9"
          icon={ProgressReportIcon}
          index={5}
          name="Progress"
          title="Your month, in one glance."
        >
          <DialDemo />
        </ToolCard>
        <ToolCard
          className="lg:col-span-6"
          color="#3b82f6"
          icon={ContestAnalysisIcon}
          index={6}
          name="Contest analysis"
          title="See the climb through every rank."
        >
          <RatingDemo />
        </ToolCard>
        <ToolCard
          className="lg:col-span-6"
          color="#f472b6"
          icon={SolutionExplorerIcon}
          index={7}
          name="Solution Explorer"
          title="Three approaches, from brute force to optimal."
        >
          <ApproachDemo />
        </ToolCard>
      </div>
    </section>
  )
}
