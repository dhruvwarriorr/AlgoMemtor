import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { LearnerMemoryPanel } from '@/features/memory/components/LearnerMemoryPanel'
import { cn } from '@/lib/utils'

function MemoryPage() {
  return (
    <PageContainer>
      <PageHeader
        action={
          <Link
            className={cn(buttonVariants({ variant: 'outline' }))}
            to="/settings"
          >
            Privacy settings
          </Link>
        }
        description="Inspect and correct the learner patterns AlgoMemtor may use for future recommendations. Memory is separate from provider problem content."
        title="Learner memory"
      />
      <LearnerMemoryPanel />
    </PageContainer>
  )
}

export default MemoryPage
