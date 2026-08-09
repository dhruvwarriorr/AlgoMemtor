import { Button } from '@/components/ui/button'

type CatalogPaginationProps = {
  currentPage: number
  isFetching?: boolean
  onPageChange: (page: number) => void
  totalPages: number
}

export function CatalogPagination({
  currentPage,
  isFetching = false,
  onPageChange,
  totalPages,
}: CatalogPaginationProps) {
  const hasPages = totalPages > 0

  return (
    <nav
      aria-label="Problem catalog pagination"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-muted-foreground" role="status">
        Page {hasPages ? currentPage : 0} of {totalPages}
      </p>
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
