import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'

function LoginPage() {
  return (
    <PageContainer className="max-w-lg">
      <PageHeader
        description="Sign in to continue learning with AlgoMemtor."
        title="Login"
      />

      <form
        className="flex w-full min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="email"
          >
            Email
          </label>
          <input
            autoComplete="email"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="password"
          >
            Password
          </label>
          <input
            autoComplete="current-password"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        <Button className="min-h-11 w-full" type="submit">
          Login
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        New to AlgoMemtor? Create an account to get started.
      </p>
    </PageContainer>
  )
}

export default LoginPage
