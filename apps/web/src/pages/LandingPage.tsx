import { Link } from 'react-router-dom'

function LandingPage() {
  return (
    <main>
      <header>
        <h1>Learn with AlgoMemtor</h1>
        <p>
          Build your problem-solving skills with a coding mentor that learns
          alongside you.
        </p>
      </header>

      <nav
        aria-label="Landing page actions"
        className="mt-6 flex justify-center gap-4"
      >
        <Link
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          to="/onboarding"
        >
          Get Started
        </Link>
        <Link
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
          to="/login"
        >
          Login
        </Link>
      </nav>
    </main>
  )
}

export default LandingPage
