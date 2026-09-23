import { cn } from '@/lib/utils'

// Two satellites orbiting a breathing core: the coach is thinking.
export function ThinkingOrbs({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block size-8 shrink-0', className)}
    >
      <span className="thinking-core absolute top-1/2 left-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#e0f7ff,#38bdf8_45%,#0369a1)] shadow-[0_0_14px_rgb(56_189_248/0.7)]" />
      <span className="thinking-orbit absolute inset-0">
        <span className="absolute top-0 left-1/2 size-[22%] -translate-x-1/2 rounded-full bg-[#4ade80] shadow-[0_0_10px_rgb(74_222_128/0.9)]" />
      </span>
      <span className="thinking-orbit absolute inset-[12%] [animation-direction:reverse] [animation-duration:1.7s]">
        <span className="absolute bottom-0 left-1/2 size-[20%] -translate-x-1/2 rounded-full bg-[#7dd3fc] shadow-[0_0_10px_rgb(125_211_252/0.9)]" />
      </span>
    </span>
  )
}
