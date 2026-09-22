import { cn } from '@/lib/utils'

// Brand monogram: an "A" stroke whose crossbar is a single memory node.
function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full bg-ink text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]',
        className,
      )}
    >
      <svg className="size-[55%]" fill="none" viewBox="0 0 24 24">
        <path
          d="M4.5 20 12 4l7.5 16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.6"
        />
        <circle cx="12" cy="14.2" fill="var(--sun)" r="2.4" />
      </svg>
    </span>
  )
}

export { LogoMark }
