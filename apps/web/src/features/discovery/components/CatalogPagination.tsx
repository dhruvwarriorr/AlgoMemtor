import { Button } from '@/components/ui/button'

type CatalogPaginationProps = {
  currentPage: number
  isFetching?: boolean
  onPageChange: (page: number) => void
  totalPages: number
  ariaLabel?: string
}

export function CatalogPagination({
  currentPage,
  isFetching = false,
  onPageChange,
  totalPages,
  ariaLabel = 'Problem catalog pagination',
}: CatalogPaginationProps) {
  const hasPages = totalPages > 0

  return (
    <nav
      aria-label={ariaLabel}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-2.5 pl-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          Page {hasPages ? currentPage : 0} of {totalPages}
        </p>
        {totalPages > 1 ? (
          <span aria-hidden="true" className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 12) }, (_, index) => (
              <span
                className={
                  index + 1 === currentPage
                    ? 'h-1.5 w-5 rounded-full bg-acc transition-all duration-300'
                    : 'size-1.5 rounded-full bg-border transition-all duration-300'
                }
                key={index}
              />
            ))}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!hasPages || currentPage <= 1 || isFetching}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={!hasPages || currentPage >= totalPages || isFetching}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
