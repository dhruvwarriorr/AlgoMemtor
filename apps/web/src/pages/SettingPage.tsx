import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
  UserRound,
  type IconComponent,
} from '@/components/icons/algo-icons'

import type { Theme } from '@/app/theme-context'
import { useTheme } from '@/app/useTheme'
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
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import { BrowserConnectorCard } from '@/features/profile/components/BrowserConnectorCard'
import { SyncPlatformsButton } from '@/features/connector/SyncPlatformsButton'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'
import { cn } from '@/lib/utils'

type SectionId = 'profile' | 'accounts' | 'platforms' | 'appearance' | 'data'

const sections: ReadonlyArray<{
  id: SectionId
  label: string
  icon: IconComponent
}> = [
  {
    id: 'profile',
    label: 'Profile and goals',
    icon: UserRound,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: ShieldCheck,
  },
  {
    id: 'platforms',
    label: 'Linked platforms',
    icon: Link2,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
  },
  {
    id: 'data',
    label: 'Data and reset',
    icon: Database,
  },
]

function isSectionId(value: string): value is SectionId {
  return sections.some((section) => section.id === value)
}

function SectionTitle({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="border-b border-border pb-5">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
        {title}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
        {description}
      </p>
    </div>
  )
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-4 border-b border-border py-8 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-x-10">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
        description="Choose how AlgoMemtor looks on this device. The choice is saved in this browser."
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
    </>
  )
}

function SettingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const identity = useUserIdentity()
  const profileQuery = useLearnerProfile()
  const saveProfile = useSaveLearnerProfile()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
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
                    'group relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-[background-color,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring lg:w-full',
                    selected
                      ? 'bg-sky-soft text-foreground dark:bg-accent'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                  key={section.id}
                  onClick={() =>
                    void navigate({ hash: section.id }, { replace: true })
                  }
                  type="button"
                >
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-md transition-colors',
                      selected
                        ? 'text-primary'
                        : 'text-muted-foreground group-hover:text-foreground',
                    )}
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

      <div
        className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-8 xl:px-14 xl:py-10"
        key={active}
      >
        <div className="animate-rise mx-auto max-w-6xl">
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
              />
              <div className="mt-8">
                <SectionTitle
                  description="Update the details other AlgoMemtor surfaces use to identify you."
                  title="Personal information"
                />
                <div className="pt-6">
                  <IdentityEditor />
                </div>
              </div>
              <div className="mt-10">
                <SectionTitle
                  description="These answers shape every recommendation and coaching reply. Your sign-in email is managed separately by Supabase Auth."
                  title="Learning profile"
                />
                <div className="pt-6">
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
                </div>
              </div>
            </>
          ) : null}

          {active === 'accounts' ? (
            <>
              <SectionTitle
                description="How you sign in to AlgoMemtor: connect Google, change your password, or get a reset link."
                title="Accounts"
              />
              <div className="pt-6">
                <AccountAccessSettings />
              </div>
            </>
          ) : null}

          {active === 'platforms' ? (
            <>
              <SectionTitle
                description="Link public handles so your coach can read verified solves, ratings and contest history."
                title="Linked platforms"
              />
              <div className="flex flex-col gap-6 pt-8">
                <SyncPlatformsButton />
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
        </div>
      </div>
      <DataResetDialog onClose={() => setResetOpen(false)} open={resetOpen} />
    </main>
  )
}

export default SettingPage
