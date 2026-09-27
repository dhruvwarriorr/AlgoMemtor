import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'
import {
  ArrowUpRight,
  Check,
  Database,
  Link2,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Target,
  UserRound,
  type IconComponent,
} from '@/components/icons/algo-icons'

import type { Theme } from '@/app/theme-context'
import { useTheme } from '@/app/useTheme'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { UserAvatar } from '@/components/brand/UserAvatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { useUserIdentity } from '@/features/auth/user-identity'
import { useAuth } from '@/features/auth/useAuth'
import { AccountAccessSettings } from '@/features/auth/components/AccountAccessSettings'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { DataResetDialog } from '@/features/profile/components/DataResetDialog'
import { IdentityEditor } from '@/features/profile/components/IdentityEditor'
import { LearnerProfileForm } from '@/features/profile/components/LearnerProfileForm'
import { ProfileBanner } from '@/features/profile/components/ProfileBanner'
import { profileStrength } from '@/features/profile/components/profile-strength'
import { useProviderAccounts } from '@/features/profile/hooks/useProviderAccounts'
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import { BrowserConnectorCard } from '@/features/profile/components/BrowserConnectorCard'
import { SyncPlatformsButton } from '@/features/connector/SyncPlatformsButton'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'
import {
  setPetChoice,
  setPetEnabled,
  usePetChoice,
  usePetEnabled,
} from '@/features/pet/pet-preference'
import { PetChoiceCard } from '@/features/pet/PetChoiceCard'
import { petIds, pets } from '@/features/pet/pets'
import { cn } from '@/lib/utils'
import { useCoachName } from '@/features/pet/pet-preference'
import { petSay } from '@/features/pet/mello-events'
import { petLines } from '@/features/pet/pet-lines'

type SectionId = 'profile' | 'accounts' | 'platforms' | 'appearance' | 'data'

const sections: ReadonlyArray<{
  id: SectionId
  label: string
  icon: IconComponent
  color: string
}> = [
  {
    id: 'profile',
    label: 'Profile and goals',
    icon: UserRound,
    color: '#38bdf8',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: ShieldCheck,
    color: '#22c55e',
  },
  {
    id: 'platforms',
    label: 'Linked platforms',
    icon: Link2,
    color: '#2d6cdf',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    color: '#a78bfa',
  },
  {
    id: 'data',
    label: 'Data and reset',
    icon: Database,
    color: '#ef4444',
  },
]

const ease = [0.16, 1, 0.3, 1] as const

// A card surface for a block of settings.
function SettingsCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-7',
        className,
      )}
    >
      {children}
    </div>
  )
}

function isSectionId(value: string): value is SectionId {
  return sections.some((section) => section.id === value)
}

function SectionTitle({
  title,
  description,
  section,
  icon,
}: {
  title: string
  description: string
  section?: SectionId
  icon?: { icon: IconComponent; color: string }
}) {
  const found = sections.find((item) => item.id === section)
  const meta = icon ?? found
  return (
    <div className="flex items-start gap-4 pb-5">
      {meta ? (
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl shadow-soft"
          style={{
            color: meta.color,
            background: `linear-gradient(135deg, color-mix(in oklab, ${meta.color} 22%, transparent), color-mix(in oklab, ${meta.color} 6%, transparent))`,
          }}
        >
          <meta.icon className="size-6" strokeWidth={1.8} />
        </span>
      ) : null}
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
          {description}
        </p>
      </div>
    </div>
  )
}

function SettingRow({
  title,
  description,
  aside,
  children,
}: {
  title: string
  description: string
  // Extra content under the description, in the left column.
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mb-4 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft transition-shadow duration-300 hover:shadow-lift sm:p-7 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-x-10">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {aside}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const themeOptions: ReadonlyArray<{
  value: Theme
  label: string
  icon: IconComponent
}> = [
  { value: 'system', label: 'System preference', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

// A miniature of the app shell painted in the theme's colours.
function ThemePreview({ theme }: { theme: Theme }) {
  const pane = (mode: 'light' | 'dark') => (
    <div
      className={cn(
        'flex h-full flex-1 gap-1.5 p-2',
        mode === 'light' ? 'bg-[#f0ede3]' : 'bg-[#0a0a0b]',
      )}
    >
      <div className="flex w-1/4 flex-col gap-1 pt-1">
        <span
          className={cn(
            'h-2 rounded-md',
            mode === 'light' ? 'bg-[#101012]' : 'bg-[#f4f1ea]',
          )}
        />
        <span
          className={cn(
            'h-1.5 rounded-md',
            mode === 'light' ? 'bg-white' : 'bg-[#17171a]',
          )}
        />
        <span
          className={cn(
            'h-1.5 w-3/4 rounded-md',
            mode === 'light' ? 'bg-[#101012]/15' : 'bg-white/15',
          )}
        />
      </div>
      <div
        className={cn(
          'flex flex-1 flex-col gap-1 rounded-md p-1.5',
          mode === 'light' ? 'bg-[#f6f4ee]' : 'bg-[#0a0a0b]',
        )}
      >
        <span className="h-2 w-1/2 rounded-md bg-[#0ea5e9]" />
        <div className="flex flex-1 gap-1">
          <span
            className={cn(
              'flex-1 rounded',
              mode === 'light' ? 'bg-white' : 'bg-[#17171a]',
            )}
          />
          <span className="flex-1 rounded bg-[#f5c33b]/70" />
        </div>
      </div>
    </div>
  )

  return (
    <div aria-hidden="true" className="flex h-24 overflow-hidden rounded-xl">
      {theme === 'dark' ? (
        pane('dark')
      ) : theme === 'light' ? (
        pane('light')
      ) : (
        <>
          {pane('light')}
          {pane('dark')}
        </>
      )}
    </div>
  )
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <>
      <SectionTitle
        description="Choose how AlgoMemtor looks on this device and which coach pet comes along. These choices are saved in this browser."
        section="appearance"
        title="Appearance"
      />
      <SettingRow
        description="Follow your system or pick a fixed theme."
        title="Interface theme"
      >
        <fieldset>
          <legend className="sr-only">Interface theme</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            {themeOptions.map((option) => {
              const selected = theme === option.value
              return (
                <label
                  className={cn(
                    'group relative cursor-pointer rounded-xl border-2 bg-card p-2 transition-[border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/20',
                    selected
                      ? 'border-primary'
                      : 'border-border hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))]',
                  )}
                  key={option.value}
                >
                  <input
                    checked={selected}
                    className="sr-only"
                    name="interface-theme"
                    onChange={() => setTheme(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  <ThemePreview theme={option.value} />
                  <span className="flex items-center gap-2 px-1.5 pt-3 pb-1 text-sm font-medium text-foreground">
                    <option.icon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                      strokeWidth={1.7}
                    />
                    {option.label}
                  </span>
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-3.5 left-3.5 grid size-6 place-items-center rounded-md bg-primary text-primary-foreground shadow-md"
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </label>
              )
            })}
          </div>
        </fieldset>
      </SettingRow>
      <CoachPetSetting />
    </>
  )
}

function CoachPetSetting() {
  const enabled = usePetEnabled()
  const choice = usePetChoice()
  const pet = pets[choice]

  return (
    <SettingRow
      aside={
        <div className="mt-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-foreground">Show pet</p>
            <PetSwitch enabled={enabled} />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {enabled
              ? `${pet.name} is on. Drag ${pet.name} anywhere; click to ask about the page you are on.`
              : `${pet.name} is off and will not appear on any page.`}
          </p>
        </div>
      }
      description="The pet you choose is your AI coach: its name is your coach's name everywhere in AlgoMemtor. It follows you across pages, reacts as you work, reads the page you are on when you ask a question, and hosts the Doubt Helper and Solution Explorer chats."
      title="Coach pet"
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-foreground">
          Choose your pet
        </legend>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {petIds.map((id) => (
            <PetChoiceCard
              key={id}
              onSelect={() => {
                if (id === choice) return
                setPetChoice(id)
                petSay(petLines.petChosen(pets[id].name))
              }}
              pet={pets[id]}
              selected={choice === id}
            />
          ))}
        </div>
      </fieldset>
    </SettingRow>
  )
}

function PetSwitch({ enabled }: { enabled: boolean }) {
  return (
    <button
      aria-checked={enabled}
      aria-label="Show the coach pet"
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
        enabled ? 'border-primary bg-primary' : 'border-border bg-muted',
      )}
      onClick={() => setPetEnabled(!enabled)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'block size-5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none',
          enabled ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}

function SettingPage() {
  const coachName = useCoachName()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const identity = useUserIdentity()
  const profileQuery = useLearnerProfile()
  const saveProfile = useSaveLearnerProfile()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const accountsQuery = useProviderAccounts()
  const profile = profileQuery.data?.data
  const strength = profile
    ? profileStrength(
        profile,
        accountsQuery.isSuccess ? accountsQuery.data.data.length : undefined,
      )
    : undefined
  const hash = location.hash.replace('#', '')
  const active: SectionId = isSectionId(hash) ? hash : 'profile'

  async function handleSubmit(profile: SaveLearnerProfileRequest) {
    setSuccessMessage(null)
    try {
      await saveProfile.mutateAsync(profile)
      setSuccessMessage('Your learner profile changes have been saved.')
    } catch {
      // The form renders the mutation's validated error state. Catching here
      // prevents an unhandled rejection from escaping the submit handler.
    }
  }

  function handleChange() {
    setSuccessMessage(null)
    saveProfile.reset()
  }

  return (
    <main
      className="grid min-w-0 flex-1 bg-background/35 lg:grid-cols-[17.5rem_minmax(0,1fr)]"
      id="main-content"
    >
      <aside className="w-full min-w-0 border-b border-border bg-card px-5 pt-6 pb-4 sm:px-8 lg:flex lg:min-h-(--app-panel-height) lg:flex-col lg:border-r lg:border-b-0 lg:px-5 lg:py-7">
        <div className="lg:sticky lg:top-[calc(var(--app-header)+2rem)]">
          <h1 className="text-[1.9rem] leading-none text-foreground">
            Settings
          </h1>
          <p className="mt-2 max-w-56 text-sm leading-5 text-muted-foreground">
            Manage your learning profile, connected platforms, and app
            preferences.
          </p>
          <nav
            aria-label="Settings sections"
            className="-mx-1 mt-6 flex max-w-full gap-1.5 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible"
          >
            {sections.map((section) => {
              const selected = active === section.id
              return (
                <button
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'group relative isolate flex shrink-0 items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-[color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring lg:w-full',
                    selected
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground lg:hover:translate-x-0.5',
                  )}
                  key={section.id}
                  onClick={() =>
                    void navigate({ hash: section.id }, { replace: true })
                  }
                  type="button"
                >
                  {selected ? (
                    <motion.span
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-xl border border-border bg-background shadow-soft dark:bg-muted/60"
                      layoutId="settings-active"
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 34,
                      }}
                    />
                  ) : null}
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg transition-[background-color,color,transform] duration-300 group-hover:scale-105"
                    style={{
                      color: selected ? section.color : undefined,
                      background: selected
                        ? `color-mix(in oklab, ${section.color} 16%, transparent)`
                        : undefined,
                    }}
                  >
                    <section.icon
                      aria-hidden="true"
                      className="size-[1.05rem]"
                      strokeWidth={1.8}
                    />
                  </span>
                  <span className="min-w-0 text-sm font-semibold whitespace-nowrap">
                    {section.label}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="mt-auto hidden border-t border-border pt-5 lg:flex lg:items-center lg:gap-3">
          <UserAvatar className="size-10 shrink-0 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {identity.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email ?? 'Signed in'}
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-8 xl:px-14 xl:py-10">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-6xl"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          key={active}
          transition={{ duration: 0.45, ease }}
        >
          {active === 'profile' ? (
            <>
              <ProfileBanner
                action={
                  <Link
                    className={buttonVariants({ variant: 'outline' })}
                    to="/profile"
                  >
                    View profile
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                }
                email={user?.email}
                profile={profileQuery.data?.data}
                {...(strength === undefined ? {} : { strength })}
              />
              <div className="mt-8">
                <SectionTitle
                  description="Update the details other AlgoMemtor surfaces use to identify you."
                  section="profile"
                  title="Personal information"
                />
                <SettingsCard>
                  <IdentityEditor />
                </SettingsCard>
              </div>
              <div className="mt-10">
                <SectionTitle
                  description="These answers shape every recommendation and coaching reply. Your sign-in email is managed separately by Supabase Auth."
                  icon={{ icon: Target, color: '#22c55e' }}
                  title="Learning profile"
                />
                <SettingsCard>
                  <LearnerProfileForm
                    combinePracticeNotes
                    idPrefix="settings-profile"
                    initialProfile={profileQuery.data?.data ?? null}
                    isLoading={profileQuery.isPending}
                    isSaving={saveProfile.isPending}
                    loadError={
                      profileQuery.isError
                        ? learnerProfileErrorMessage(profileQuery.error)
                        : null
                    }
                    onChange={handleChange}
                    onRetryLoad={() => void profileQuery.refetch()}
                    onSubmit={handleSubmit}
                    saveError={
                      saveProfile.isError
                        ? learnerProfileErrorMessage(saveProfile.error)
                        : null
                    }
                    submitLabel="Save profile changes"
                    successMessage={successMessage}
                  />
                </SettingsCard>
              </div>
            </>
          ) : null}

          {active === 'accounts' ? (
            <>
              <SectionTitle
                description="How you sign in to AlgoMemtor: connect Google, change your password, or get a reset link."
                section="accounts"
                title="Accounts"
              />
              <SettingsCard>
                <AccountAccessSettings />
              </SettingsCard>
            </>
          ) : null}

          {active === 'platforms' ? (
            <>
              <SectionTitle
                description={`Link public handles so ${coachName} can read verified solves, ratings and contest history.`}
                section="platforms"
                title="Linked platforms"
              />
              <div className="flex flex-col gap-6">
                <SettingsCard className="flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 bg-linear-to-br from-card to-[color-mix(in_oklab,#2d6cdf_8%,var(--card))]">
                  <div aria-hidden="true" className="flex -space-x-2">
                    {(
                      ['codeforces', 'leetcode', 'codechef', 'cses'] as const
                    ).map((provider, index) => (
                      <motion.span
                        animate={{ opacity: 1, y: 0 }}
                        className="grid size-10 place-items-center rounded-full border-2 border-card bg-white text-[#0b0c0e] shadow-soft"
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        key={provider}
                        transition={{
                          duration: 0.4,
                          ease,
                          delay: index * 0.07,
                        }}
                      >
                        <ProviderLogo className="size-5" provider={provider} />
                      </motion.span>
                    ))}
                  </div>
                  <SyncPlatformsButton />
                </SettingsCard>
                <ProviderAccountLinks idPrefix="settings" />
                <BrowserConnectorCard idPrefix="settings" />
              </div>
            </>
          ) : null}

          {active === 'appearance' ? <AppearanceSection /> : null}

          {active === 'data' ? (
            <>
              <SectionTitle
                description="Manage the learner data stored for your account."
                section="data"
                title="Data and reset"
              />
              <SettingRow
                description="Remove AlgoMemtor learner data while keeping your sign-in account."
                title="Reset learner data"
              >
                <div className="rounded-xl border border-destructive/35 bg-danger-soft p-5">
                  <p className="max-w-2xl text-sm leading-6 text-danger-foreground">
                    This cannot be undone. The cleanup may run in the background
                    and returns you to onboarding.
                  </p>
                  <Button
                    className="mt-4 bg-destructive text-white hover:bg-[color-mix(in_oklab,var(--destructive),black_12%)] dark:text-[#1a0503]"
                    onClick={() => setResetOpen(true)}
                    type="button"
                  >
                    Reset AlgoMemtor data
                  </Button>
                </div>
              </SettingRow>
            </>
          ) : null}
        </motion.div>
      </div>
      <DataResetDialog onClose={() => setResetOpen(false)} open={resetOpen} />
    </main>
  )
}

export default SettingPage
