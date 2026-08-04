import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'

function ProblemsPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Choose a coding problem to start practising."
        title="Problems"
      />

      <section aria-labelledby="problem-list-heading" className="space-y-4">
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="problem-list-heading"
        >
          Problem List
        </h2>
        <EmptyState title="No problems are available yet." />
      </section>
    </PageContainer>
  )
}

export default ProblemsPage
