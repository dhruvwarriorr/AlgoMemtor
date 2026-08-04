import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'

function OnboardingPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Tell us about your goals, experience, topics, and preferred problem platforms."
        title="Onboarding"
      />

      <section
        aria-labelledby="learning-setup-heading"
        className="space-y-2 rounded-lg border border-border bg-card p-4 sm:p-6"
      >
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="learning-setup-heading"
        >
          Learning Setup
        </h2>
        <p className="text-muted-foreground">
          The preference-based onboarding flow will be added here later.
        </p>
      </section>
    </PageContainer>
  )
}

export default OnboardingPage
