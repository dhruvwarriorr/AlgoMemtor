import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'

function ProgressPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Track attempted and solved problems without inferring progress from link clicks."
        title="Progress"
      />

      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="overview-heading"
        >
          Overview
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <p className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 text-foreground sm:min-w-48">
            Problems attempted: 0
          </p>
          <p className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 text-foreground sm:min-w-48">
            Problems solved: 0
          </p>
        </div>
      </section>

      <section
        aria-labelledby="recent-activity-heading"
        className="space-y-2 border-t border-border pt-6"
      >
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="recent-activity-heading"
        >
          Recent Activity
        </h2>
        <p className="text-muted-foreground">No activity recorded yet.</p>
      </section>
    </PageContainer>
  )
}

export default ProgressPage
