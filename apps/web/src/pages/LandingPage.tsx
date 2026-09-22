import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowUpRight,
  BadgeCheck,
  Brain,
  Compass,
  Lightbulb,
  Link2,
  MessagesSquare,
  PowerOff,
  Route,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import coachShot from '@/assets/landing/coach.jpg'
import dashboardShot from '@/assets/landing/dashboard.jpg'
import problemsShot from '@/assets/landing/problems.jpg'
import progressShot from '@/assets/landing/progress.jpg'
import recommendationsShot from '@/assets/landing/recommendations.jpg'
import { LogoMark } from '@/components/brand/LogoMark'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { buttonVariants } from '@/components/ui/button'
import type { AuthStatus } from '@/features/auth/auth-context'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

const platforms = [
  { provider: 'codeforces', name: 'Codeforces', color: 'hover:text-[#1f8acb]' },
  { provider: 'leetcode', name: 'LeetCode', color: 'hover:text-[#ffa116]' },
  {
    provider: 'codechef',
    name: 'CodeChef',
    color: 'hover:text-[#5b4638] dark:hover:text-[#c9a78d]',
  },
  { provider: 'cses', name: 'CSES', color: 'hover:text-primary' },
] as const

const knowledge: ReadonlyArray<{
  icon: LucideIcon
  title: string
  body: string
  tags: ReadonlyArray<string>
  tone: string
}> = [
  {
    icon: UserRound,
    title: 'Your profile',
    body: 'Experience, goals, difficulty comfort and the topics you want to fix, straight from onboarding.',
    tags: ['Goals', 'Experience', 'Focus topics'],
    tone: 'sky-surface',
  },
  {
    icon: BadgeCheck,
    title: 'Your platforms',
    body: 'Verified solves, verdicts, ratings and contests from the public handles you choose to link.',
    tags: ['Verdicts', 'Ratings', 'Contests'],
    tone: 'bg-card border border-border',
  },
  {
    icon: TrendingUp,
    title: 'Your journey',
    body: 'Streaks, topic strength and an adaptive roadmap that updates every time you practice.',
    tags: ['Streaks', 'Topic strength', 'Roadmap'],
    tone: 'bg-sun-soft ring-1 ring-sun/40',
  },
  {
    icon: Brain,
    title: 'Your conversations',
    body: 'Learner memory from past sessions, which you can review, correct or delete at any time.',
    tags: ['Memory', 'Check-ins', 'Hints'],
    tone: 'bg-ink text-ink-foreground',
  },
]

const journey: ReadonlyArray<{
  icon: LucideIcon
  title: string
  body: string
}> = [
  {
    icon: Link2,
    title: 'Link your handles',
    body: 'Add Codeforces, CodeChef or LeetCode. Nothing is fetched without consent.',
  },
  {
    icon: ScanSearch,
    title: 'Your coach reads the evidence',
    body: 'It maps verdicts and topics into a picture of where you really stand.',
  },
  {
    icon: Route,
    title: 'Practice with a reason',
    body: 'Each problem and hint explains which gap it closes.',
  },
  {
    icon: TrendingUp,
    title: 'Get re-assessed',
    body: 'New solves shift your roadmap, so the next step always fits.',
  },
]

const principles = [
  {
    icon: Lightbulb,
    tone: 'bg-sun-soft text-sun-foreground ring-sun/50',
    title: 'Recommend with a reason',
    body: 'Every suggestion says which gap it closes, so you can decide in one read.',
  },
  {
    icon: Link2,
    tone: 'bg-secondary text-primary ring-primary/25',
    title: 'Respect the source',
    body: 'Problems open on their original platform. We store metadata, never statements or editorials.',
  },
  {
    icon: ShieldCheck,
    tone: 'bg-go-soft text-go-foreground ring-go/35',
    title: 'Be honest about evidence',
    body: 'Opening a problem is not solving it. Progress only moves on a verified verdict or your own mark.',
  },
  {
    icon: PowerOff,
    tone: 'bg-muted text-foreground ring-border',
    title: 'Keep AI optional',
    body: 'Search, filters and outbound links keep working when the model is down.',
  },
] as const

const stagger = (index: number) => ({ '--i': index }) as CSSProperties

function Cloud({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={cn('cloud animate-drift', className)} />
  )
}

function CtaIcon() {
  return (
    <span className="grid size-8 place-items-center rounded-full bg-white/12 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px dark:bg-black/10">
      <ArrowUpRight aria-hidden="true" />
    </span>
  )
}

function PrimaryActions({ status }: { status: AuthStatus }) {
  if (status === 'loading') {
    return null
  }

  const primaryClass = buttonVariants({
    className: 'group/cta w-full pr-1.5 sm:w-auto',
    size: 'lg',
    variant: 'ink',
  })

  const actions: ReactNode =
    status === 'authenticated' ? (
      <Link className={primaryClass} to="/dashboard">
        Go to Dashboard
        <CtaIcon />
      </Link>
    ) : (
      <>
        <Link className={primaryClass} to="/onboarding">
          Get Started
          <CtaIcon />
        </Link>
        <Link
          className={cn(
            buttonVariants({
              className: 'w-full sm:w-auto',
              size: 'lg',
              variant: 'outline',
            }),
            'border-white/70 bg-white/80 text-[#0b1220] backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-[#eaf1fb] dark:hover:bg-white/15',
          )}
          to="/login"
        >
          Login
        </Link>
      </>
    )

  return (
    <nav
      aria-label="Landing page actions"
      className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center"
    >
      {actions}
    </nav>
  )
}

function Screenshot({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string
  alt: string
  className?: string
  eager?: boolean
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-[1.4rem] bg-white/40 p-1.5 shadow-lift ring-1 ring-white/70 dark:bg-white/5 dark:ring-white/10',
        className,
      )}
    >
      <img
        alt={alt}
        className="block h-auto w-full rounded-[1.05rem]"
        decoding="async"
        fetchPriority={eager ? 'high' : 'auto'}
        height={1000}
        loading={eager ? 'eager' : 'lazy'}
        src={src}
        width={1600}
      />
    </figure>
  )
}

function LandingPage() {
  const { status } = useAuth()

  return (
    <main className="-mt-20 flex-1" id="main-content">
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="sky-surface flex min-h-[calc(100dvh-1rem)] w-full flex-col items-center rounded-[2rem] px-4 pt-32 text-center sm:rounded-[2.75rem] sm:pt-36">
          <Cloud className="top-40 -left-24 w-[26rem] [--drift:60px] sm:w-[36rem]" />
          <Cloud className="top-24 -right-28 w-[24rem] opacity-80 [--drift-duration:44s] [--drift:-50px] sm:w-[32rem]" />
          <Cloud className="top-[58%] left-[14%] hidden w-64 opacity-70 [--drift-duration:52s] lg:block" />
          <Cloud className="-right-10 bottom-40 hidden w-[30rem] [--drift:-40px] md:block" />

          <p
            className="animate-rise glass-pill inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[0.8125rem] font-medium text-[#0b1220] dark:text-[#eaf1fb]"
            style={stagger(0)}
          >
            <span aria-hidden="true" className="coach-orb size-5" />
            <span>
              Your personal CP coach
              <span className="hidden sm:inline">
                , powered by your own history
              </span>
            </span>
          </p>

          <h1
            className="animate-rise mt-6 max-w-5xl pb-1 text-[2.6rem] leading-[1.04] text-[#0b1220] sm:text-6xl lg:text-[5rem] dark:text-[#eaf1fb]"
            style={stagger(1)}
          >
            The AI coach that{' '}
            <span className="marker dark:bg-none dark:text-sun">knows</span>{' '}
            your CP journey.
          </h1>

          <p
            className="animate-rise mt-6 max-w-2xl text-lg leading-8 text-[#0b1220]/75 dark:text-[#eaf1fb]/75"
            style={stagger(2)}
          >
            AlgoMemtor learns your profile and solve history across Codeforces,
            LeetCode and CodeChef, then coaches the topics holding you back.
          </p>

          <div
            className="animate-rise mt-9 w-full max-w-sm sm:w-auto sm:max-w-none"
            style={stagger(3)}
          >
            <PrimaryActions status={status} />
          </div>

          <div
            className="animate-rise relative mt-16 w-full max-w-6xl flex-1 sm:mt-20"
            style={stagger(4)}
          >
            <div className="absolute inset-x-0 top-0 mx-auto hidden h-full md:block">
              <Screenshot
                alt="AlgoMemtor dashboard with streak, calendar and coach focus"
                className="absolute top-12 -left-4 w-[44%] -rotate-[4deg] opacity-95"
                src={dashboardShot}
              />
              <Screenshot
                alt="AlgoMemtor problem catalog with provider filters"
                className="absolute top-10 -right-4 w-[44%] rotate-[4deg] opacity-95"
                src={problemsShot}
              />
            </div>
            <Screenshot
              alt="AlgoMemtor coach greeting the learner by name with a message composer and suggested questions"
              className="relative mx-auto w-full md:w-[76%]"
              eager
              src={coachShot}
            />

            <p className="animate-float glass-pill absolute -top-5 left-2 hidden items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-foreground [--tilt:-3deg] sm:flex md:left-[5%]">
              <Brain aria-hidden="true" className="size-4 text-primary" />
              Remembers your weak topics
            </p>
            <p className="animate-float glass-pill absolute top-28 right-2 hidden items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-foreground [--tilt:3deg] [animation-delay:-3s] sm:flex md:right-[3%]">
              <BadgeCheck aria-hidden="true" className="size-4 text-go" />
              Reads verdicts from Codeforces
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="platforms-heading"
        className="w-full px-6 py-16 sm:px-10 lg:px-16"
      >
        <div className="reveal-on-scroll flex flex-col items-center gap-10 lg:flex-row lg:justify-between">
          <h2
            className="max-w-sm text-center text-2xl leading-tight text-foreground lg:text-left"
            id="platforms-heading"
          >
            Coaching built on the platforms you already compete on.
          </h2>
          <ul className="grid grid-cols-2 gap-x-14 gap-y-8 sm:grid-cols-4">
            {platforms.map((platform) => (
              <li key={platform.provider}>
                <span
                  className={cn(
                    'flex items-center gap-3 text-foreground/70 transition-colors duration-300',
                    platform.color,
                  )}
                  title={platform.name}
                >
                  <ProviderLogo
                    className="size-8"
                    provider={platform.provider}
                  />
                  <span className="font-heading text-xl font-semibold tracking-[-0.02em]">
                    {platform.name}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="coach-heading"
        className="grid w-full scroll-mt-24 gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:px-16 lg:py-28"
        id="coach"
      >
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2
            className="reveal-on-scroll text-4xl leading-[1.04] text-foreground sm:text-[3.5rem]"
            id="coach-heading"
          >
            A coach with context, not another chatbot.
          </h2>
          <p className="reveal-on-scroll mt-5 max-w-md text-lg leading-8 text-muted-foreground">
            Before you type a word, your coach already knows how you practice.
            Every answer is grounded in that context and tells you why.
          </p>
          <Link
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'reveal-on-scroll mt-8',
            )}
            to={status === 'authenticated' ? '/coach' : '/onboarding'}
          >
            <MessagesSquare aria-hidden="true" />
            Meet your coach
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {knowledge.map((item) => (
            <li
              className={cn(
                'reveal-on-scroll flex min-h-72 flex-col justify-between rounded-[1.75rem] p-7',
                item.tone,
              )}
              key={item.title}
            >
              {item.tone === 'sky-surface' ? (
                <span
                  aria-hidden="true"
                  className="cloud -top-8 -right-10 w-64 opacity-80"
                />
              ) : null}
              <item.icon
                aria-hidden="true"
                className="size-7"
                strokeWidth={1.6}
              />
              <div>
                <h3 className="text-2xl font-semibold">{item.title}</h3>
                <p className="mt-2 leading-7 opacity-75">{item.body}</p>
                <ul className="mt-5 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <li
                      className="rounded-full bg-current/8 px-3 py-1 text-xs font-medium"
                      key={tag}
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="how-heading"
        className="w-full scroll-mt-24 bg-[linear-gradient(180deg,transparent,var(--sky-soft)_18%,var(--sky-soft)_82%,transparent)] px-6 py-24 sm:px-10 lg:px-16"
        id="how-it-works"
      >
        <div className="reveal-on-scroll flex flex-col items-center text-center">
          <Compass
            aria-hidden="true"
            className="size-8 text-primary"
            strokeWidth={1.6}
          />
          <h2
            className="mt-4 max-w-3xl text-4xl leading-[1.05] text-foreground sm:text-[3.25rem]"
            id="how-heading"
          >
            From your history to your next problem, in one loop.
          </h2>
        </div>
        <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          <span
            aria-hidden="true"
            className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--primary)_45%,transparent),transparent)] md:block"
          />
          {journey.map((step, index) => (
            <li
              className="reveal-on-scroll relative flex flex-col items-center text-center"
              key={step.title}
              style={stagger(index)}
            >
              <span className="grid size-14 place-items-center rounded-full bg-card text-primary shadow-soft ring-1 ring-border">
                <step.icon
                  aria-hidden="true"
                  className="size-6"
                  strokeWidth={1.6}
                />
              </span>
              <h3 className="mt-5 text-xl font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 max-w-64 leading-7 text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="product-heading"
        className="w-full px-6 py-24 sm:px-10 lg:px-16"
      >
        <h2
          className="reveal-on-scroll max-w-3xl text-4xl leading-[1.05] text-foreground sm:text-[3.25rem]"
          id="product-heading"
        >
          Everything your coach sees, in one workspace.
        </h2>

        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <article className="reveal-on-scroll sky-surface flex min-h-[28rem] flex-col rounded-[1.75rem] p-7 sm:p-9 lg:col-span-4">
            <span
              aria-hidden="true"
              className="cloud -top-8 right-10 w-72 opacity-80"
            />
            <Lightbulb
              aria-hidden="true"
              className="size-7"
              strokeWidth={1.6}
            />
            <h3 className="mt-5 max-w-md text-2xl font-semibold sm:text-3xl">
              Every pick explains itself.
            </h3>
            <p className="mt-3 max-w-md opacity-75">
              Problems are ranked against your goals and history, with a short
              reason you can argue with.
            </p>
            <div className="relative mt-8 -mb-9 flex-1 sm:-mr-9">
              <Screenshot
                alt="Recommendation feed with a reason under each problem"
                className="h-full rounded-b-none"
                src={recommendationsShot}
              />
            </div>
          </article>

          <article className="reveal-on-scroll flex min-h-[28rem] flex-col overflow-hidden rounded-[1.75rem] bg-ink p-7 text-ink-foreground sm:p-9 lg:col-span-2">
            <Sparkles
              aria-hidden="true"
              className="size-7 text-sun"
              strokeWidth={1.6}
            />
            <h3 className="mt-5 text-2xl font-semibold sm:text-3xl">
              Where you stand, on one screen.
            </h3>
            <p className="mt-3 opacity-75">
              Solves, streak, calendar and your coach&apos;s current focus,
              without scrolling.
            </p>
            <div className="relative mt-8 -mr-9 -mb-9 flex-1">
              <Screenshot
                alt="Single-screen dashboard"
                className="h-full rounded-br-none"
                src={dashboardShot}
              />
            </div>
          </article>

          <article className="reveal-on-scroll flex min-h-[24rem] flex-col overflow-hidden rounded-[1.75rem] bg-sun-soft p-7 ring-1 ring-sun/40 sm:p-9 lg:col-span-2">
            <BadgeCheck
              aria-hidden="true"
              className="size-7 text-sun-foreground"
              strokeWidth={1.6}
            />
            <h3 className="mt-5 text-2xl font-semibold text-foreground sm:text-3xl">
              Evidence, not guesses.
            </h3>
            <p className="mt-3 text-foreground/75">
              Streaks and topic strength come from dated verdicts across every
              linked account.
            </p>
            <div className="relative mt-8 -mr-9 -mb-9 flex-1">
              <Screenshot
                alt="Progress view with solve history"
                className="h-full rounded-br-none"
                src={progressShot}
              />
            </div>
          </article>

          <article className="reveal-on-scroll flex flex-col justify-between gap-10 rounded-[1.75rem] border border-border bg-card p-7 sm:p-9 lg:col-span-4">
            <div>
              <ArrowUpRight
                aria-hidden="true"
                className="size-7 text-go"
                strokeWidth={1.6}
              />
              <h3 className="mt-5 max-w-lg text-2xl font-semibold text-foreground sm:text-3xl">
                Solve on the original platform.
              </h3>
              <p className="mt-3 max-w-lg text-muted-foreground">
                AlgoMemtor never hosts code or copies statements. One click
                opens the canonical problem, with attribution.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {platforms.map((platform) => (
                <li
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pr-3.5 pl-2 text-sm font-medium text-foreground"
                  key={platform.provider}
                >
                  <ProviderLogo
                    className="size-5 text-foreground/80"
                    provider={platform.provider}
                  />
                  Open on {platform.name}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="principles-heading"
        className="w-full scroll-mt-24 border-t border-border px-6 py-24 sm:px-10 lg:px-16"
        id="principles"
      >
        <h2
          className="reveal-on-scroll max-w-2xl text-4xl leading-[1.05] text-foreground sm:text-[3.25rem]"
          id="principles-heading"
        >
          Four rules your coach never breaks.
        </h2>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {principles.map((principle) => (
            <li
              className="reveal-on-scroll rounded-[1.5rem] border border-border bg-card p-7"
              key={principle.title}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-12 place-items-center rounded-full ring-1',
                  principle.tone,
                )}
              >
                <principle.icon className="size-5" strokeWidth={1.7} />
              </span>
              <h3 className="mt-8 text-xl font-semibold text-foreground">
                {principle.title}
              </h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                {principle.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-2 pb-3 sm:px-3">
        <div className="sky-surface flex w-full flex-col items-center rounded-[2rem] px-4 py-24 text-center sm:rounded-[2.75rem] sm:py-32">
          <Cloud className="top-10 -left-20 w-[28rem]" />
          <Cloud className="-right-24 bottom-4 w-[32rem] [--drift:-50px]" />
          <span
            aria-hidden="true"
            className="coach-orb animate-orb reveal-on-scroll size-20"
          />
          <h2 className="reveal-on-scroll mt-8 max-w-3xl text-4xl leading-[1.05] text-[#0b1220] sm:text-6xl dark:text-[#eaf1fb]">
            Your coach is ready when you are.
          </h2>
          <p className="reveal-on-scroll mt-5 max-w-md text-lg text-[#0b1220]/75 dark:text-[#eaf1fb]/75">
            Link a profile, set a goal, and get a plan made for you in minutes.
          </p>
          <div className="reveal-on-scroll mt-9 w-full max-w-sm sm:w-auto sm:max-w-none">
            <PrimaryActions status={status} />
          </div>
        </div>
      </section>

      <footer className="flex w-full flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-16">
        <div className="flex items-center gap-2.5 text-foreground">
          <LogoMark className="size-8" />
          <span className="font-heading text-base font-bold tracking-[-0.03em]">
            AlgoMemtor
          </span>
        </div>
        <p className="max-w-md">
          Problems belong to Codeforces, LeetCode, CodeChef and CSES. AlgoMemtor
          links to the originals.
        </p>
        <p>© {new Date().getFullYear()} AlgoMemtor</p>
      </footer>
    </main>
  )
}

export default LandingPage
