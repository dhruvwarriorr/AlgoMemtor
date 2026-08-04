import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'

function SubmissionsPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Review your coding submission history."
        title="Submissions"
      />

      <section
        aria-labelledby="submission-history-heading"
        className="space-y-4"
      >
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="submission-history-heading"
        >
          Submission History
        </h2>
        <EmptyState title="No submissions yet." />
      </section>
    </PageContainer>
  )
}

export default SubmissionsPage
