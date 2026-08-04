import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'

function SettingPage() {
  return (
    <PageContainer>
      <PageHeader
        description="Manage your profile and preferences."
        title="Settings"
      />

      <form
        className="flex w-full max-w-2xl min-w-0 flex-col gap-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <section
          aria-labelledby="settings-profile-heading"
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="settings-profile-heading"
          >
            Profile
          </h2>

          <div className="flex min-w-0 flex-col gap-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="name"
            >
              Name
            </label>
            <input
              autoComplete="name"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              id="name"
              name="name"
              type="text"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="settings-email"
            >
              Email
            </label>
            <input
              autoComplete="email"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              id="settings-email"
              name="email"
              type="email"
            />
          </div>
        </section>

        <section
          aria-labelledby="preferences-heading"
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="preferences-heading"
          >
            Preferences
          </h2>
          <label className="flex min-w-0 items-start gap-3 text-sm text-foreground">
            <input
              className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              name="emailNotifications"
              type="checkbox"
            />
            <span className="min-w-0 break-words">
              Receive email notifications
            </span>
          </label>
        </section>

        <Button
          className="min-h-11 w-full sm:w-auto sm:self-start"
          type="submit"
        >
          Save changes
        </Button>
      </form>
    </PageContainer>
  )
}

export default SettingPage
