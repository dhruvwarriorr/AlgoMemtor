import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'

function RecommendationsPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Review personalized problem recommendations and why they fit your learning goals."
        title="Recommendations"
      />
      <EmptyState
        description="Personalized recommendations will appear after the recommendation phase is implemented."
        title="No recommendations yet"
      />
    </PageContainer>
  )
}

export default RecommendationsPage
