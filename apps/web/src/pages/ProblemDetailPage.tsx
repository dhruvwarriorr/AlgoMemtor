import { useParams } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'

function ProblemDetailPage() {
  const { problemId } = useParams()

  return (
    <PageContainer>
      <PageHeader title="Problem Details" />

      <p className="min-w-0 text-sm text-muted-foreground sm:text-base">
        Problem ID:{' '}
        <code className="inline-block max-w-full break-all rounded-md bg-muted px-2 py-1 font-mono text-sm text-foreground whitespace-normal">
          {problemId}
        </code>
      </p>

      <section
        aria-labelledby="coding-workspace-heading"
        className="space-y-2 rounded-lg border border-border bg-card p-4 sm:p-6"
      >
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="coding-workspace-heading"
        >
          Coding Workspace
        </h2>
        <p className="break-words text-muted-foreground">
          The problem statement and coding workspace will be added here later.
        </p>
      </section>
    </PageContainer>
  )
}

export default ProblemDetailPage
