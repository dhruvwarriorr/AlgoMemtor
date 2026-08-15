import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'

function BookmarksPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Return to external problems you intentionally saved for later."
        title="Bookmarks"
      />
      <EmptyState
        description="Bookmark persistence will be added with learner data. Current catalog bookmark controls remain non-persistent placeholders."
        title="No bookmarks yet"
      />
    </PageContainer>
  )
}

export default BookmarksPage
