import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'
import {
  ArrowUpRight,
  Brain,
  Check,
  Database,
  Link2,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

import type { Theme } from '@/app/theme-context'
import { useTheme } from '@/app/useTheme'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { AiNoteConsentCard } from '@/features/profile/components/AiNoteConsentCard'
import { DataResetDialog } from '@/features/profile/components/DataResetDialog'
import { IdentityEditor } from '@/features/profile/components/IdentityEditor'
import { LearnerProfileForm } from '@/features/profile/components/LearnerProfileForm'
import { ProfileBanner } from '@/features/profile/components/ProfileBanner'
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'
import { cn } from '@/lib/utils'

type SectionId = 'profile' | 'platforms' | 'coach' | 'appearance' | 'data'

const sections: ReadonlyArray<{
  id: SectionId
  label: string
  hint: string
  icon: LucideIcon
}> = [
  {
    id: 'profile',
    label: 'Profile and goals',
    hint: 'What your coach knows about you',
    icon: UserRound,
  },
  {
    id: 'platforms',
    label: 'Linked platforms',
    hint: 'Codeforces, CodeChef, LeetCode',
    icon: Link2,
  },
  {
    id: 'coach',
    label: 'Coach and privacy',
    hint: 'Personalization and memory',
    icon: ShieldCheck,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    hint: 'Theme for this device',
    icon: Palette,
  },
  {
    id: 'data',
    label: 'Data and reset',
    hint: 'Remove learner data',
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
    <div className="border-b border-border pb-6">
      <h2 className="text-2xl text-foreground sm:text-[1.75rem]">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-muted-foreground">{description}</p>
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
    <div className="grid gap-4 border-b border-border py-8 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-x-10">
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
  icon: LucideIcon
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
          mode === 'light' ? 'bg-[#f6f4ee]' : 'bg-[#0d0d0f]',
        )}
      >
        <span className="h-2 w-1/2 rounded-md bg-[#ff4d12]" />
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
                    'group relative cursor-pointer rounded-2xl border-2 bg-card p-2 transition-[border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/20',
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
      className="flex min-w-0 flex-1 flex-col lg:flex-row"
      id="main-content"
    >
      <aside className="border-b border-border px-5 pt-6 pb-4 sm:px-8 lg:w-[19rem] lg:shrink-0 lg:border-r lg:border-b-0 lg:px-6 lg:py-9">
        <div className="lg:sticky lg:top-[calc(var(--app-header)+2rem)]">
          <h1 className="text-[2.1rem] leading-none text-foreground">
            Settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tune what your coach knows and how the app behaves.
          </p>
          <nav
            aria-label="Settings sections"
            className="-mx-1 mt-6 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible"
          >
            {sections.map((section) => {
              const selected = active === section.id
              return (
                <button
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    selected
                      ? 'bg-card shadow-soft ring-1 ring-border'
                      : 'hover:bg-card/60',
                  )}
                  key={section.id}
                  onClick={() =>
                    void navigate({ hash: section.id }, { replace: true })
                  }
                  type="button"
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    <section.icon
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={1.7}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold whitespace-nowrap text-foreground">
                      {section.label}
                    </span>
                    <span className="hidden text-xs text-muted-foreground lg:block">
                      {section.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      <div
        className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-12 lg:py-9"
        key={active}
      >
        <div className="animate-rise mx-auto max-w-5xl">
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
                  description="How you appear across AlgoMemtor."
                  title="Name and avatar"
                />
                <div className="pt-6">
                  <IdentityEditor />
                </div>
              </div>
              <div className="mt-10">
                <SectionTitle
                  description="These answers shape every recommendation and coaching reply. Your sign-in email is managed separately by Supabase Auth."
                  title="Profile and goals"
                />
                <div className="pt-6">
                  <LearnerProfileForm
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

          {active === 'platforms' ? (
            <>
              <SectionTitle
                description="Link public handles so your coach can read verified solves, ratings and contest history."
                title="Linked platforms"
              />
              <div className="pt-8">
                <ProviderAccountLinks idPrefix="settings" />
              </div>
            </>
          ) : null}

          {active === 'coach' ? (
            <>
              <SectionTitle
                description="Decide how much your coach may personalize, and review what it remembers."
                title="Coach and privacy"
              />
              <div className="pt-8">
                <AiNoteConsentCard existingUser />
              </div>
              <SettingRow
                description="Patterns the coach has learned from your practice. Correct, archive or delete any of them."
                title="Learner memory"
              >
                <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-md bg-sky-soft text-primary"
                  >
                    <Brain className="size-5" strokeWidth={1.7} />
                  </span>
                  <p className="flex-1 text-sm text-muted-foreground">
                    Memory is used for future recommendations only while
                    personalized coaching is enabled.
                  </p>
                  <Link
                    className={buttonVariants({ variant: 'outline' })}
                    to="/memory"
                  >
                    Review learner memory
                  </Link>
                </div>
              </SettingRow>
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
                <div className="rounded-2xl border border-destructive/35 bg-danger-soft p-5">
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
