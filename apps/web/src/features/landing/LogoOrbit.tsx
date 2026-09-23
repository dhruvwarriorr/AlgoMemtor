import type { ReactNode } from 'react'

import { LogoMark } from '@/components/brand/LogoMark'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  BadgeCheck,
  Brain,
  CalendarDays,
  Compass,
  LineChart,
  Trophy,
  type IconComponent,
} from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

const orbitPlatforms = ['codeforces', 'leetcode', 'codechef', 'cses'] as const

const orbitSignals: ReadonlyArray<{ icon: IconComponent; label: string }> = [
  { icon: BadgeCheck, label: 'Verdicts' },
  { icon: LineChart, label: 'Ratings' },
  { icon: Compass, label: 'Topics' },
  { icon: Trophy, label: 'Contests' },
  { icon: CalendarDays, label: 'Streaks' },
  { icon: Brain, label: 'Memory' },
]

// Places a child on a ring at `angle`, keeping it upright while the ring
// spins by counter-rotating it at the same speed.
function OrbitItem({
  angle,
  radius,
  duration,
  reverse,
  children,
}: {
  angle: number
  radius: string
  duration: number
  reverse: boolean
  children: ReactNode
}) {
  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{
        transform: `rotate(${angle}deg) translateX(${radius}) rotate(${-angle}deg)`,
      }}
    >
      <div
        className="-translate-x-1/2 -translate-y-1/2 motion-reduce:[animation:none]"
        style={{
          animation: `spin ${duration}s linear infinite ${reverse ? 'normal' : 'reverse'}`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// The big animated mark: the liquid logo at the centre, the platforms it
// reads on an inner ring, and the signals it keeps on an outer ring, each
// ring turning the other way.
export function LogoOrbit({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative aspect-square w-full max-w-[36rem]', className)}
    >
      <span className="absolute inset-[4%] rounded-full border border-white/10" />
      <span className="absolute inset-[20%] rounded-full border border-dashed border-white/12" />
      <span className="absolute inset-[34%] rounded-full bg-[radial-gradient(closest-side,rgb(56_189_248/0.28),rgb(74_222_128/0.12),transparent)]" />

      {/* Outer ring: what the coach reads. */}
      <div
        className="absolute inset-0 motion-reduce:[animation:none]"
        style={{ animation: 'spin 60s linear infinite' }}
      >
        {orbitSignals.map((signal, index) => (
          <OrbitItem
            angle={(index / orbitSignals.length) * 360}
            duration={60}
            key={signal.label}
            radius="clamp(8.5rem, 40vw, 16.5rem)"
            reverse={false}
          >
            <span className="glass-panel-strong flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-white">
              <signal.icon className="size-4 text-[#7dd3fc] [--icon-node:#4ade80]" />
              {signal.label}
            </span>
          </OrbitItem>
        ))}
      </div>

      {/* Inner ring: platforms, turning the other way. */}
      <div
        className="absolute inset-0 motion-reduce:[animation:none]"
        style={{ animation: 'spin 40s linear infinite reverse' }}
      >
        {orbitPlatforms.map((platform, index) => (
          <OrbitItem
            angle={(index / orbitPlatforms.length) * 360 + 45}
            duration={40}
            key={platform}
            radius="clamp(5.5rem, 26vw, 10.5rem)"
            reverse
          >
            <span className="grid size-14 place-items-center rounded-full border border-white/15 bg-white text-[#0b0c0e] shadow-[0_12px_30px_-10px_rgb(0_0_0/0.6)]">
              <ProviderLogo className="size-8" provider={platform} />
            </span>
          </OrbitItem>
        ))}
      </div>

      <div className="absolute inset-0 grid place-items-center">
        <span className="animate-pulse-glow absolute size-44 rounded-full bg-[#38bdf8]/30 blur-2xl" />
        <LogoMark className="relative size-32 shadow-[0_30px_80px_-20px_rgb(56_189_248/0.75)] ring-4 ring-white/10 sm:size-40" />
      </div>
    </div>
  )
}
