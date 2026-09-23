import { cn } from '@/lib/utils'

// "AlgoMemtor" set in the display face with liquid moving through the letters.
function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'wave-text font-heading font-bold tracking-[-0.01em] [--wave-level:46%]',
        className,
      )}
    >
      AlgoMemtor
    </span>
  )
}

export { Wordmark }
