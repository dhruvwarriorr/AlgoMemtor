import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'

function ProfilePage() {
  return (
    <PageContainer>
      <PageHeader
        description="Your learner information will appear here."
        title="Profile"
      />

      <section
        aria-labelledby="learner-information-heading"
        className="space-y-4"
      >
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="learner-information-heading"
        >
          Learner Information
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <p className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 text-foreground sm:min-w-56">
            Name: Not set
          </p>
          <p className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 text-foreground sm:min-w-56">
            Experience level: Not set
          </p>
          <p className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4 text-foreground sm:min-w-56">
            Learning goals: Not set
          </p>
        </div>
      </section>
    </PageContainer>
  )
}

export default ProfilePage
