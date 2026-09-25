import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { LearnerMemoryPanel } from '@/features/memory/components/LearnerMemoryPanel'

function MemoryPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Add, inspect, and correct the learner guidance AlgoMemtor may use for future recommendations. Memory is separate from provider problem content."
        title="Learner memory"
      />
      <LearnerMemoryPanel showComposer />
    </PageContainer>
  )
}

export default MemoryPage
