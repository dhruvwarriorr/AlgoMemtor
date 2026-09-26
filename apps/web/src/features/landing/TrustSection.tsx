import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  ArrowUpRight,
  Code2,
  Lock,
  ShieldCheck,
  type IconComponent,
} from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

import { landingEase as ease } from './landing-motion'
import { SectionIntro } from './SectionIntro'

const platforms = [
  { key: 'codeforces', name: 'Codeforces' },
  { key: 'leetcode', name: 'LeetCode' },
  { key: 'codechef', name: 'CodeChef' },
  { key: 'cses', name: 'CSES' },
] as const

function Principle({
  icon: Icon,
  title,
  body,
  index,
  children,
}: {
  icon: IconComponent
  title: string
  body: string
  index: number
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.article
      className="group flex min-w-0 flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition-[border-color,background-color,transform] duration-500 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055]"
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      transition={{ duration: 0.8, ease, delay: index * 0.1 }}
      viewport={{ once: true, margin: '-60px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <div
        aria-hidden="true"
        className="flex h-28 items-center justify-center rounded-2xl border border-white/8 bg-[#070b0e]/70"
      >
        {children}
      </div>
      <div>
        <h3 className="flex items-center gap-2 font-heading text-xl font-semibold text-[#f4f1ea]">
          <Icon aria-hidden="true" className="size-5 text-[#7dd3fc]" />
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-white/55">{body}</p>
      </div>
    </motion.article>
  )
}

// A problem card handing off to its home platform.
function HandOff() {
  return (
    <span className="flex items-center gap-3">
      <span className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left">
        <span className="block text-xs font-semibold text-white">Boredom</span>
        <span className="block font-mono text-[0.62rem] text-white/45">
          DP · 1500
        </span>
      </span>
      <span className="landing-handoff flex items-center text-[#7dd3fc]">
        <span className="h-px w-8 bg-linear-to-r from-transparent to-[#7dd3fc]" />
        <ArrowUpRight className="size-4" />
      </span>
      <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0b0c0e]">
        <ProviderLogo className="size-4" provider="codeforces" />
        codeforces.com
      </span>
    </span>
  )
}

// Platform switches: linking is a choice per platform.
function ConsentSwitches() {
  return (
    <span className="grid grid-cols-2 gap-x-5 gap-y-2">
      {platforms.map((platform, index) => (
        <span className="flex items-center gap-2" key={platform.key}>
          <span className="grid size-6 place-items-center rounded-full bg-white text-[#0b0c0e]">
            <ProviderLogo className="size-3.5" provider={platform.key} />
          </span>
          <span
            className={cn(
              'relative h-4 w-7 rounded-full',
              index === 3
                ? 'landing-switch bg-white/15'
                : index === 2
                  ? 'bg-white/15'
                  : 'bg-[#22c55e]',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-3 rounded-full bg-white transition-transform',
                index < 2 ? 'left-3.5' : 'left-0.5',
                index === 3 && 'landing-switch-knob',
              )}
            />
          </span>
        </span>
      ))}
    </span>
  )
}

// A browser window whose run never leaves the device.
function LocalRun() {
  return (
    <span className="w-44 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      <span className="flex items-center gap-1.5 border-b border-white/10 px-2.5 py-1.5">
        <span className="size-1.5 rounded-full bg-white/25" />
        <span className="size-1.5 rounded-full bg-white/25" />
        <span className="ml-1 flex flex-1 items-center gap-1 rounded bg-white/5 px-1.5 font-mono text-[0.55rem] text-white/45">
          <Lock className="size-2.5" />
          your browser
        </span>
      </span>
      <span className="block space-y-1 px-2.5 py-2 font-mono text-[0.58rem] text-white/60">
        <span className="block">▶ run main.cpp</span>
        <span className="block text-[#86efac]">✓ traced 42 steps locally</span>
      </span>
    </span>
  )
}

// Why the product can be trusted, stated as the rules it runs by.
export function TrustSection() {
  const marquee = [...platforms, ...platforms, ...platforms, ...platforms]
  return (
    <section
      aria-labelledby="landing-trust"
      className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:py-32"
    >
      <SectionIntro
        eyebrow="Built on your terms"
        index="04"
        title={<span id="landing-trust">Your practice stays yours.</span>}
      >
        AlgoMemtor is a mentor, not a mirror of other sites. It works from the
        history you share and hands every problem back to where it lives.
      </SectionIntro>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        <Principle
          body="AlgoMemtor shows a problem's title, tags and rating, then sends you to its original page to read, code and submit."
          icon={ArrowUpRight}
          index={0}
          title="Problems stay home"
        >
          <HandOff />
        </Principle>
        <Principle
          body="Link only the public profiles you choose, and refresh or disconnect them whenever you like."
          icon={ShieldCheck}
          index={1}
          title="Your profiles, your say"
        >
          <ConsentSwitches />
        </Principle>
        <Principle
          body="The visualizer traces your own code inside your browser. Nothing is executed on our servers."
          icon={Code2}
          index={2}
          title="Code runs on your machine"
        >
          <LocalRun />
        </Principle>
      </div>

      <div className="mt-16 flex flex-col items-center gap-5">
        <p className="font-mono text-xs tracking-[0.28em] text-white/40 uppercase">
          Reads your public profiles on
        </p>
        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <div className="landing-marquee flex w-max gap-4">
            {marquee.map((platform, index) => (
              <span
                aria-hidden={index >= platforms.length}
                className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3"
                key={`${platform.key}-${index}`}
              >
                <span className="grid size-9 place-items-center rounded-full bg-white text-[#0b0c0e]">
                  <ProviderLogo className="size-5" provider={platform.key} />
                </span>
                <span className="font-heading text-lg font-semibold text-white/85">
                  {platform.name}
                </span>
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/35">
          AlgoMemtor is independent and not affiliated with these platforms.
        </p>
      </div>
    </section>
  )
}
