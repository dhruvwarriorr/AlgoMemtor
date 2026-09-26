import { MemoryIcon } from '@/components/icons/app-icons'
import { PageHero } from '@/components/kit/PageHero'
import PageContainer from '@/components/layout/PageContainer'
import { LearnerMemoryPanel } from '@/features/memory/components/LearnerMemoryPanel'

function MemoryPage() {
  return (
    <PageContainer accent="violet" className="gap-6">
      <PageHero
        eyebrow="Learner memory"
        icon={MemoryIcon}
        info="Add, inspect, and correct the learner guidance AlgoMemtor may use for future recommendations. Memory is separate from provider problem content."
        subtitle="What AlgoMemtor remembers about how you learn."
        title="Learner memory"
      />
      <LearnerMemoryPanel showComposer />
    </PageContainer>
  )
}

export default MemoryPage
