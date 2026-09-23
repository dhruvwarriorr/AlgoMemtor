import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

type SectionHeadingProps = {
  id: string
  title: string
  description?: ReactNode
  link?: { to: string; label: string }
}

function SectionHeading({ id, title, description, link }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          className="text-2xl font-semibold text-foreground sm:text-[1.75rem]"
          id={id}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {link ? (
        <Link
          className="group inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[0_1px_2px_rgb(16_16_18/0.06)] transition-colors hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] hover:text-primary"
          to={link.to}
        >
          {link.label}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      ) : null}
    </div>
  )
}

export { SectionHeading }
