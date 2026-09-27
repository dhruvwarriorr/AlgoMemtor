import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import type { ProviderKey } from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { iconStagger, type IconMotion } from '@/components/icons/icon-motion'
import { PlatformTierBadge } from '@/components/kit/PlatformTierBadge'
import {
  ArrowUpRight,
  BookOpen,
  Pencil,
  Compass,
  Flame,
  Link2,
  Sparkles,
  Target,
  TrendingUp,
  type IconComponent,
} from '@/components/icons/algo-icons'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { CountUp } from '@/components/motion/CountUp'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { ProfileBanner } from '@/features/profile/components/ProfileBanner'
import {
  profileStrength,
  readableValue,
} from '@/features/profile/components/profile-strength'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { providerAccountErrorMessage } from '@/features/profile/api/provider-accounts'
import { useLearnerProfile } from '@/features/profile/hooks/useLearnerProfile'
import { useProviderAccounts } from '@/features/profile/hooks/useProviderAccounts'
import { useUnifiedProfile } from '@/features/platform/hooks'
import { cn } from '@/lib/utils'
import { useCoachName } from '@/features/pet/pet-preference'

const ease = [0.16, 1, 0.3, 1] as const

const levels = [
  'complete_beginner',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const
const difficulties = [
  'new_to_rated_problems',
  'introductory',
  'medium',
  'challenging',
] as const
const logoProviders: readonly string[] = [
  'codeforces',
  'codechef',
  'leetcode',
  'cses',
]

// Each card icon's gesture when its card is hovered.
const cardIconMotion = new Map<IconComponent, IconMotion>([
  [TrendingUp, 'rise'],
  [Target, 'pop'],
  [Flame, 'flicker'],
  [Compass, 'spin'],
  [BookOpen, 'tilt'],
  [Link2, 'tilt'],
  [Sparkles, 'twinkle'],
  [Pencil, 'wiggle'],
])

function ProfileCard({
  title,
  icon: Icon,
  color,
  index,
  className,
  children,
}: {
  title: string
  icon: IconComponent
  color: string
  index: number
  className?: string
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.section
      className={cn(
        'group relative isolate flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      transition={{ duration: 0.6, ease, delay: (index % 3) * 0.07 }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 -z-10 size-44 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(closest-side, ${color}33, transparent)`,
        }}
      />
      <h2 className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-lg transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-rotate-6"
          style={{
            color,
            background: `color-mix(in oklab, ${color} 14%, transparent)`,
          }}
        >
          <Icon
            className="icon-motion size-4"
            data-motion={cardIconMotion.get(Icon) ?? 'pop'}
            style={iconStagger(index)}
          />
        </span>
        {title}
      </h2>
      {children}
    </motion.section>
  )
}

// Experience as a staircase, lit up to the learner's level.
function LevelLadder({ level }: { level: string }) {
  const reduceMotion = useReducedMotion()
  const at = Math.max(0, levels.indexOf(level as (typeof levels)[number]))
  return (
    <div className="flex items-end justify-between gap-4">
      <p className="font-heading text-2xl font-bold text-foreground">
        {readableValue(level)}
      </p>
      <div aria-hidden="true" className="flex h-14 items-end gap-1.5">
        {levels.map((step, index) => (
          <motion.span
            animate={{ height: `${28 + index * 18}%` }}
            className={cn(
              'block w-3 rounded-t-md rounded-b-sm',
              index <= at
                ? 'bg-linear-to-t from-[#0284c7] to-[#38bdf8]'
                : 'bg-muted',
            )}
            initial={reduceMotion ? false : { height: '0%' }}
            key={step}
            title={readableValue(step)}
            transition={{ duration: 0.6, ease, delay: 0.2 + index * 0.08 }}
          />
        ))}
      </div>
    </div>
  )
}

// Difficulty comfort as flames, one per step.
function DifficultyFlames({ comfort }: { comfort: string }) {
  const reduceMotion = useReducedMotion()
  if (comfort === 'let_algomemtor_decide') {
    return (
      <p className="flex items-center gap-2 font-heading text-2xl font-bold text-foreground">
        <Sparkles
          aria-hidden="true"
          className="icon-motion size-5 text-primary"
          data-motion="twinkle"
        />
        AlgoMemtor decides
      </p>
    )
  }
  const at = difficulties.indexOf(comfort as (typeof difficulties)[number])
  return (
    <div className="flex items-end justify-between gap-4">
      <p className="font-heading text-2xl font-bold text-foreground">
        {readableValue(comfort)}
      </p>
      <span aria-hidden="true" className="flex gap-1">
        {difficulties.map((step, index) => (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
            key={step}
            transition={{
              type: 'spring',
              stiffness: 320,
              damping: 16,
              delay: 0.25 + index * 0.08,
            }}
          >
            <Flame
              data-motion="flicker"
              className={cn(
                'icon-motion size-6',
                index <= at
                  ? 'text-[#f97316] drop-shadow-[0_0_6px_rgba(249,115,22,0.6)]'
                  : 'text-muted-foreground/30',
              )}
            />
          </motion.span>
        ))}
      </span>
    </div>
  )
}

function ChipList({
  items,
  empty,
  tone = 'sky',
}: {
  items: readonly string[]
  empty: string
  tone?: 'sky' | 'green' | 'violet'
}) {
  const reduceMotion = useReducedMotion()
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  const toneClass = {
    sky: 'border-[#38bdf8]/35 bg-[#0ea5e9]/10 text-[#0369a1] dark:text-[#7dd3fc]',
    green:
      'border-[#22c55e]/35 bg-[#22c55e]/10 text-[#15803d] dark:text-[#86efac]',
    violet:
      'border-[#a78bfa]/35 bg-[#8b5cf6]/10 text-[#6d28d9] dark:text-[#c4b5fd]',
  }[tone]
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <motion.li
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'rounded-full border px-3 py-1 text-sm font-medium',
            toneClass,
          )}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
          key={item}
          transition={{ duration: 0.35, ease, delay: 0.2 + index * 0.05 }}
        >
          {item}
        </motion.li>
      ))}
    </ul>
  )
}

function ProfilePage() {
  const coachName = useCoachName()
  const { user } = useAuth()
  const profileQuery = useLearnerProfile()
  const accountsQuery = useProviderAccounts()
  // Ratings and ranks from the stored public profiles, for the tier badges.
  const unifiedProfileQuery = useUnifiedProfile()
  const standingFor = (provider: ProviderKey) => {
    const data = unifiedProfileQuery.data?.data
    const profile = data?.profiles?.find((item) => item.provider === provider)
    const summary = data?.providers.find((item) => item.provider === provider)
    return {
      rating: profile?.rating ?? summary?.rating,
      rank: profile?.rank ?? summary?.rank,
    }
  }

  if (profileQuery.isPending) {
    return (
      <PageContainer>
        <PageSkeleton label="Loading learner profile" rows={4} />
      </PageContainer>
    )
  }

  if (profileQuery.isError) {
    return (
      <PageContainer>
        <ErrorState
          message={learnerProfileErrorMessage(profileQuery.error)}
          onRetry={() => void profileQuery.refetch()}
          title="Learner profile unavailable"
        />
      </PageContainer>
    )
  }

  const profile = profileQuery.data.data

  if (profile === null) {
    return (
      <PageContainer>
        <ErrorState
          message="Complete onboarding to create your recommendation profile."
          title="Learner profile not set up"
        />
      </PageContainer>
    )
  }

  const accounts = accountsQuery.data?.data ?? []
  const strength = profileStrength(
    profile,
    accountsQuery.isSuccess ? accounts.length : undefined,
  )
  const focusTopics =
    profile.topicPreference.mode === 'let_algomemtor_suggest'
      ? []
      : profile.topicPreference.topics.map(readableValue)

  return (
    <PageContainer accent="sky">
      <PageHeader
        description={`Everything ${coachName} knows about you, from goals to linked platform evidence.`}
        title="Profile"
      />

      <ProfileBanner
        action={
          <Link className={buttonVariants({ variant: 'ink' })} to="/settings">
            Edit in settings
          </Link>
        }
        email={user?.email}
        profile={profile}
        strength={strength}
      />

      <div
        aria-label="Learner details"
        className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3"
        role="region"
      >
        <ProfileCard
          color="#38bdf8"
          icon={TrendingUp}
          index={0}
          title="Experience"
        >
          <LevelLadder level={profile.experience} />
        </ProfileCard>
        <ProfileCard color="#22c55e" icon={Target} index={1} title="Goal">
          <p className="font-heading text-2xl leading-tight font-bold text-foreground">
            {readableValue(profile.goal)}
          </p>
        </ProfileCard>
        <ProfileCard
          color="#f97316"
          icon={Flame}
          index={2}
          title="Difficulty comfort"
        >
          <DifficultyFlames comfort={profile.difficultyComfort} />
        </ProfileCard>

        <ProfileCard
          className="md:col-span-2"
          color="#38bdf8"
          icon={Compass}
          index={3}
          title="Weak or focus topics"
        >
          {profile.topicPreference.mode === 'let_algomemtor_suggest' ? (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Sparkles
                aria-hidden="true"
                className="icon-motion size-4 text-primary"
                data-motion="twinkle"
              />
              Let AlgoMemtor suggest
            </p>
          ) : (
            <ChipList empty="No focus topics yet." items={focusTopics} />
          )}
        </ProfileCard>
        <ProfileCard
          color="#a78bfa"
          icon={BookOpen}
          index={4}
          title="Learning style"
        >
          <ChipList
            empty="No learning style set."
            items={profile.learningPreferences.map(readableValue)}
            tone="violet"
          />
        </ProfileCard>

        <ProfileCard
          color="#2d6cdf"
          icon={Link2}
          index={5}
          title="Preferred providers"
        >
          {profile.platformPreferences.platforms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No preference</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {profile.platformPreferences.platforms.map((platform) => (
                <li
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 py-1 pr-3 pl-1 text-sm font-medium text-foreground"
                  key={platform}
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-white text-[#0b0c0e]">
                    {logoProviders.includes(platform) ? (
                      <ProviderLogo
                        className="size-4"
                        provider={platform as ProviderKey}
                      />
                    ) : (
                      <span className="text-[0.65rem] font-bold">
                        {platform.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  {readableValue(platform)}
                </li>
              ))}
            </ul>
          )}
        </ProfileCard>
        <ProfileCard
          color="#22c55e"
          icon={Sparkles}
          index={6}
          title="Preferred topics"
        >
          <ChipList
            empty="No preference"
            items={profile.preferredTopics.map(readableValue)}
            tone="green"
          />
        </ProfileCard>
        <ProfileCard
          color="#f59e0b"
          icon={Pencil}
          index={7}
          title="Notes and timezone"
        >
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                Saved recommendation note
              </dt>
              <dd className="mt-0.5 font-medium break-words text-foreground">
                {profile.recommendationPreference ?? 'No saved note'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Progress timezone
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {profile.timezone ?? 'Browser timezone suggested on save'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Account email</dt>
              <dd className="mt-0.5 font-medium break-all text-foreground">
                {user?.email ?? 'Not set'}
              </dd>
            </div>
          </dl>
        </ProfileCard>
      </div>

      <section aria-labelledby="provider-summary-heading" className="space-y-4">
        <h2
          className="text-xl font-semibold tracking-tight text-foreground"
          id="provider-summary-heading"
        >
          Linked public profiles
        </h2>
        {accountsQuery.isPending ? (
          <PageSkeleton label="Loading linked public profiles" rows={2} />
        ) : accountsQuery.isError ? (
          <ErrorState
            message={providerAccountErrorMessage(accountsQuery.error)}
            onRetry={() => void accountsQuery.refetch()}
            title="Provider profiles unavailable"
          />
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
            <div aria-hidden="true" className="flex -space-x-2">
              {(['codeforces', 'leetcode', 'codechef', 'cses'] as const).map(
                (provider, index) => (
                  <span
                    className="animate-float grid size-11 place-items-center rounded-full border-2 border-card bg-white text-[#0b0c0e] shadow-soft"
                    key={provider}
                    style={{ animationDelay: `${index * -1.2}s` }}
                  >
                    <ProviderLogo className="size-6" provider={provider} />
                  </span>
                ),
              )}
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              No provider accounts are linked. Linking remains optional, and it
              lets {coachName} read verified solves and ratings.
            </p>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to="/settings#platforms"
            >
              Link a public profile
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <li
                className="group flex min-w-0 items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift"
                key={account.provider}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-[#0b0c0e] shadow-soft transition-transform duration-500 group-hover:-rotate-6">
                  <ProviderLogo
                    className="size-7"
                    provider={account.provider}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {readableValue(account.provider)}
                  </p>
                  <a
                    className="block truncate text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    href={account.profileUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {account.handle}
                  </a>
                  {standingFor(account.provider).rating !== undefined ? (
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(standingFor(account.provider).rating ?? 0)}{' '}
                        rating
                      </span>
                      <PlatformTierBadge
                        provider={account.provider}
                        rank={standingFor(account.provider).rank}
                        rating={standingFor(account.provider).rating}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {account.publicStats.status === 'available' ? (
                    <>
                      <p className="font-heading text-xl font-bold text-foreground tabular-nums">
                        {account.publicStats.complete ? '' : '≥'}
                        <CountUp value={account.publicStats.solvedCount} />
                      </p>
                      <p className="text-xs text-muted-foreground">solved</p>
                    </>
                  ) : (
                    <p className="max-w-24 text-xs text-muted-foreground">
                      {account.publicStats.status === 'unavailable'
                        ? 'Solved count unavailable'
                        : 'Solved count not fetched'}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

export default ProfilePage
