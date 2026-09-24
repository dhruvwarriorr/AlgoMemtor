import { OrbLoader } from '@/components/motion/OrbLoader'

type PageSkeletonProps = {
  rows?: number
  label?: string
  withHeader?: boolean
}

// Loading screen: the thinking orb and a status line, centred in the space
// the page will fill. `rows` and `withHeader` size that space.
function PageSkeleton({
  rows = 4,
  label = 'Loading page',
  withHeader = false,
}: PageSkeletonProps) {
  const minHeight = `${Math.max(10, Math.min(28, 6 + rows * 4 + (withHeader ? 6 : 0)))}rem`

  return (
    <section
      className="grid w-full min-w-0 place-items-center py-10"
      role="status"
      style={{ minHeight }}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="animate-rise">
        <OrbLoader label={`${label.replace(/…$/, '')}…`} />
      </div>
    </section>
  )
}

export { PageSkeleton }
export type { PageSkeletonProps }
