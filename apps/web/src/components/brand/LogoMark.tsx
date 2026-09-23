import { cn } from '@/lib/utils'

// Brand monogram: an "A" stroke whose crossbar is a memory node, with liquid
// swaying in the bottom of the badge. The waves are 24 units long, so a
// 24-unit slide loops seamlessly.
const wave =
  'M0 24 C3 22 9 22 12 24 S21 26 24 24 S33 22 36 24 S45 26 48 24 S57 22 60 24 V36 H0 Z'

function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block size-9 shrink-0 overflow-hidden rounded-full bg-ink text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]',
        className,
      )}
    >
      <svg
        className="absolute inset-0 size-full"
        fill="none"
        viewBox="0 0 36 36"
      >
        <g transform="translate(0 1.5)">
          <path
            className="logo-wave-slow"
            d={wave}
            fill="#4ade80"
            fillOpacity="0.5"
          />
        </g>
        <path className="logo-wave" d={wave} fill="#38bdf8" />
        <g transform="translate(8.1 8.1) scale(0.825)">
          <path
            d="M4.5 20 12 4l7.5 16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.6"
          />
          <circle cx="12" cy="14.2" fill="#22c55e" r="2.4" />
        </g>
      </svg>
    </span>
  )
}

export { LogoMark }
