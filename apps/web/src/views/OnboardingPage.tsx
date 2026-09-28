import { useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useLocation, useNavigate } from '@/lib/router'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import {
  CheckCircle2,
  Download,
  Link2,
  LogOut,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  type IconComponent,
} from '@/components/icons/algo-icons'
import PageContainer from '@/components/layout/PageContainer'
import { useSignOut } from '@/components/navigation/useSignOut'
import { useNotification } from '@/providers/useNotification'
import { useUserIdentity } from '@/features/auth/user-identity'
import { MelloSprite } from '@/features/pet/MelloSprite'
import { PetChoiceCard } from '@/features/pet/PetChoiceCard'
import { setPetChoice, usePetChoice } from '@/features/pet/pet-preference'
import { petIds, pets } from '@/features/pet/pets'
import { learnerProfileErrorMessage } from '@/features/profile/api/learner-profile'
import { BrowserConnectorCard } from '@/features/profile/components/BrowserConnectorCard'
import { IdentityEditor } from '@/features/profile/components/IdentityEditor'
import { LearnerProfileForm } from '@/features/profile/components/LearnerProfileForm'
import { ProviderAccountLinks } from '@/features/profile/components/ProviderAccountLinks'
import { useConnectorTokens } from '@/features/profile/hooks/useConnectorTokens'
import {
  useLearnerProfile,
  useSaveLearnerProfile,
} from '@/features/profile/hooks/useLearnerProfile'
import { useProviderAccounts } from '@/features/profile/hooks/useProviderAccounts'
import { cn } from '@/lib/utils'
import { postOnboardingDestination } from '@/routes/return-to'

const ease = [0.16, 1, 0.3, 1] as const

type StepId = 'you' | 'coach' | 'connect' | 'profile'

const steps: ReadonlyArray<{
  id: StepId
  label: string
  icon: IconComponent
}> = [
  { id: 'you', label: 'You', icon: UserRound },
  { id: 'coach', label: 'Meet your coach', icon: Sparkles },
  { id: 'connect', label: 'Connect platforms', icon: PlugZap },
  { id: 'profile', label: 'About you', icon: Target },
]

// The step whose section is nearest the top of the screen.
function useActiveStep() {
  const [active, setActive] = useState<StepId>('you')
  useEffect(() => {
    const sections = steps
      .map((step) => document.getElementById(`onboarding-${step.id}`))
      .filter((node): node is HTMLElement => node !== null)
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined')
      return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          )[0]
        const id = visible?.target.id.replace('onboarding-', '')
        const step = steps.find((item) => item.id === id)
        if (step !== undefined) setActive(step.id)
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [])
  return active
}

function goTo(id: StepId) {
  document
    .getElementById(`onboarding-${id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function OnboardingHero({
  name,
  active,
  done,
}: {
  name: string
  active: StepId
  done: Record<StepId, boolean>
}) {
  const reduceMotion = useReducedMotion()
  const pet = pets[usePetChoice()]
  const activeIndex = steps.findIndex((step) => step.id === active)
  // Onboarding gates every other page, so signing out has to be possible
  // from here (for example to switch accounts).
  const { isSigningOut, signOut } = useSignOut()
  return (
    <motion.header
      animate={{ opacity: 1, y: 0 }}
      className="relative isolate overflow-hidden rounded-3xl border border-border bg-[#050b12] text-white"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      transition={{ duration: 0.7, ease }}
    >
      <span
        aria-hidden="true"
        className="animate-aurora absolute -top-28 -left-20 -z-10 size-96 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.5),transparent)] blur-2xl"
      />
      <span
        aria-hidden="true"
        className="animate-aurora absolute -right-16 -bottom-40 -z-10 size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.45),transparent)] blur-2xl [animation-delay:-5s]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] bg-size-[20px_20px] [mask-image:linear-gradient(120deg,transparent,black_45%,black)]"
      />
      <button
        className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7dd3fc] disabled:opacity-60"
        disabled={isSigningOut}
        onClick={() => void signOut()}
        type="button"
      >
        <LogOut aria-hidden="true" className="size-3.5" />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </button>
      <div className="flex flex-col gap-6 p-6 pt-14 sm:p-8 sm:pt-14 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-sm font-medium text-[#7dd3fc]">
            Welcome to AlgoMemtor
          </p>
          <h1 className="mt-2 text-[2rem] leading-[1.05] tracking-[-0.02em] sm:text-[2.6rem]">
            {`Hi ${name}, let’s set you up.`.split(' ').map((word, index) => (
              <motion.span
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="inline-block"
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: 14, filter: 'blur(8px)' }
                }
                key={`${word}-${index}`}
                transition={{ duration: 0.6, ease, delay: 0.06 * index }}
              >
                {word}&nbsp;
              </motion.span>
            ))}
          </h1>
          <p className="mt-3 max-w-xl text-[0.95rem] leading-6 text-white/70">
            Four short steps: your name and picture, your coach, your platforms,
            and how you practise. Everything can be changed later in Settings.
          </p>
        </div>
        <div className="flex shrink-0 items-end gap-3 self-start lg:self-auto">
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            className="relative max-w-[13rem] rounded-2xl rounded-br-md border border-white/15 bg-white/10 px-3 py-2 text-sm leading-5 backdrop-blur"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
            key={pet.id}
            transition={{
              type: 'spring',
              stiffness: 360,
              damping: 22,
              delay: 0.5,
            }}
          >
            I’m <span className="font-semibold">{pet.name}</span>, your coach.
            Let’s get started!
          </motion.span>
          <span className="grid h-[104px] w-[132px] place-items-center">
            <MelloSprite clips={pet.clips} key={pet.id} state="greet" />
          </span>
        </div>
      </div>
      <nav
        aria-label="Setup steps"
        className="border-t border-white/10 bg-black/20 px-4 py-3 sm:px-8"
      >
        <ol className="relative grid grid-cols-4 gap-2">
          <span
            aria-hidden="true"
            className="absolute top-4 right-[12.5%] left-[12.5%] h-px bg-white/15"
          />
          <motion.span
            animate={{
              width: `${(Math.max(0, activeIndex) / (steps.length - 1)) * 75}%`,
            }}
            aria-hidden="true"
            className="absolute top-4 left-[12.5%] h-px bg-linear-to-r from-[#7dd3fc] to-[#a78bfa]"
            initial={false}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
          {steps.map((step, index) => {
            const isActive = step.id === active
            const isDone = done[step.id]
            return (
              <li className="relative flex justify-center" key={step.id}>
                <button
                  aria-current={isActive ? 'step' : undefined}
                  className="group flex flex-col items-center gap-1.5 rounded-lg px-2 py-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#7dd3fc]"
                  onClick={() => goTo(step.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      'relative grid size-8 place-items-center rounded-full border text-xs font-semibold transition-colors duration-300',
                      isDone
                        ? 'border-transparent bg-[#22c55e] text-[#052e12]'
                        : isActive
                          ? 'border-[#7dd3fc] bg-[#0c1a2b] text-[#7dd3fc]'
                          : 'border-white/20 bg-[#0b1220] text-white/60 group-hover:text-white',
                    )}
                  >
                    {isActive && !isDone && !reduceMotion ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 animate-ping rounded-full border border-[#7dd3fc]/60"
                      />
                    ) : null}
                    {isDone ? (
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium transition-colors',
                      isActive ? 'text-white' : 'text-white/55',
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
    </motion.header>
  )
}

function Step({
  id,
  number,
  icon: Icon,
  title,
  description,
  optional = false,
  children,
}: {
  id: StepId
  number: number
  icon: IconComponent
  title: string
  description: ReactNode
  optional?: boolean
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.section
      aria-labelledby={`onboarding-${id}-heading`}
      className="relative min-w-0 scroll-mt-24 sm:pl-14"
      id={`onboarding-${id}`}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      transition={{ duration: 0.6, ease }}
      viewport={{ once: true, margin: '-60px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 hidden size-10 place-items-center rounded-2xl border border-border bg-card text-primary sm:grid"
      >
        <Icon className="size-5" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-xs text-muted-foreground">
          Step {number} of {steps.length}
        </p>
        {optional ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-medium text-secondary-foreground">
            Optional
          </span>
        ) : null}
      </div>
      <h2
        className="mt-1 text-2xl text-foreground"
        id={`onboarding-${id}-heading`}
      >
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-5 min-w-0">{children}</div>
    </motion.section>
  )
}

// A short, visual version of the install steps above the connector card.
const extensionPath: ReadonlyArray<{
  icon: IconComponent
  title: string
  detail: string
}> = [
  {
    icon: Download,
    title: 'Download',
    detail: 'Get the connector for your browser below.',
  },
  {
    icon: PlugZap,
    title: 'Add to browser',
    detail: 'Load it once; it opens AlgoMemtor when ready.',
  },
  {
    icon: CheckCircle2,
    title: 'Connects itself',
    detail: 'No token to copy. The first sync starts at once.',
  },
]

function ExtensionPath() {
  const reduceMotion = useReducedMotion()
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {extensionPath.map((item, index) => (
        <motion.li
          className="relative flex gap-3 rounded-2xl border border-border bg-card p-4"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          key={item.title}
          transition={{ duration: 0.5, ease, delay: index * 0.1 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <item.icon aria-hidden="true" className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              {index + 1}. {item.title}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {item.detail}
            </span>
          </span>
        </motion.li>
      ))}
    </ol>
  )
}

function Checklist({
  items,
}: {
  items: ReadonlyArray<{
    label: string
    done: boolean
    detail: string
    target: StepId
  }>
}) {
  const reduceMotion = useReducedMotion()
  const complete = items.filter((item) => item.done).length
  const share = complete / items.length
  return (
    <aside
      aria-label="Setup progress"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24"
    >
      <div className="flex items-center gap-4">
        <svg
          aria-hidden="true"
          className="size-14 -rotate-90"
          viewBox="0 0 48 48"
        >
          <circle
            className="text-secondary"
            cx="24"
            cy="24"
            fill="none"
            r="20"
            stroke="currentColor"
            strokeWidth="5"
          />
          <motion.circle
            animate={{ pathLength: share }}
            className="text-primary"
            cx="24"
            cy="24"
            fill="none"
            initial={reduceMotion ? false : { pathLength: 0 }}
            r="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="5"
            transition={{ type: 'spring', stiffness: 80, damping: 18 }}
          />
        </svg>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {complete} of {items.length} done
          </p>
          <p className="text-xs text-muted-foreground">
            Finish with “Complete setup” below.
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.label}>
            <button
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => goTo(item.target)}
              type="button"
            >
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300',
                  item.done
                    ? 'border-transparent bg-go text-white dark:text-go-soft'
                    : 'border-border',
                )}
              >
                {item.done ? (
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {item.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {item.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="flex gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        AlgoMemtor uses AI models to turn your profile, progress and eligible
        notes into coaching. It never sends passwords or credentials, and
        problems stay on their own platforms.
      </p>
    </aside>
  )
}

function OnboardingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const identity = useUserIdentity()
  const profileQuery = useLearnerProfile()
  const saveProfile = useSaveLearnerProfile()
  const accounts = useProviderAccounts()
  const tokens = useConnectorTokens()
  const choice = usePetChoice()
  const [coachChosen, setCoachChosen] = useState(false)
  const identityDone = identity.hasCustomName || identity.usesPhoto
  const active = useActiveStep()

  const linked = accounts.data?.data.length ?? 0
  const extensionConnected = (tokens.data?.data.length ?? 0) > 0
  const done: Record<StepId, boolean> = {
    you: identityDone,
    coach: coachChosen,
    connect: linked > 0 || extensionConnected,
    profile: false,
  }

  async function handleSubmit(profile: SaveLearnerProfileRequest) {
    await saveProfile.mutateAsync(profile)
    notify({
      title: 'Learner profile saved',
      description: `${pets[choice].name} has everything needed for your first plan.`,
      tone: 'success',
    })
    void navigate(postOnboardingDestination(location.state), { replace: true })
  }

  return (
    <PageContainer accent="sky" className="gap-10">
      <OnboardingHero active={active} done={done} name={identity.name} />

      <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-14">
          <Step
            description="How you appear across AlgoMemtor. Use your own name and a photo, or keep the defaults from your sign-in."
            icon={UserRound}
            id="you"
            number={1}
            optional
            title="Your name and avatar"
          >
            <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6">
              <IdentityEditor />
            </div>
          </Step>

          <Step
            description={
              <>
                The pet you pick is your AI coach. Its name is your coach’s name
                everywhere in AlgoMemtor, and it hosts the Doubt Helper and
                Solution Explorer chats.
              </>
            }
            icon={Sparkles}
            id="coach"
            number={2}
            title="Meet your coach"
          >
            <fieldset>
              <legend className="sr-only">Choose your coach</legend>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {petIds.map((id) => (
                  <PetChoiceCard
                    key={id}
                    onSelect={() => {
                      setPetChoice(id)
                      setCoachChosen(true)
                    }}
                    pet={pets[id]}
                    selected={choice === id}
                  />
                ))}
              </div>
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setCoachChosen(true)
                  goTo('connect')
                }}
                type="button"
              >
                Keep {pets[choice].name} and continue
              </button>
            </div>
          </Step>

          <Step
            description={
              <>
                The browser connector reads your own signed-in LeetCode, CSES
                and CodeChef history (with CodeChef contest ratings) and
                verifies Codeforces. It is the quickest way to a useful first
                plan. You can also link public handles instead.
              </>
            }
            icon={PlugZap}
            id="connect"
            number={3}
            optional
            title="Connect your platforms"
          >
            <div className="flex min-w-0 flex-col gap-6">
              <ExtensionPath />
              <BrowserConnectorCard idPrefix="onboarding" />
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Link2 aria-hidden="true" className="size-4 text-primary" />
                  Or link public handles
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Public Codeforces, CodeChef and LeetCode data, read with your
                  consent.
                </p>
                <div className="mt-4">
                  <ProviderAccountLinks idPrefix="onboarding" />
                </div>
              </div>
            </div>
          </Step>

          <Step
            description={`Enough for ${pets[choice].name} to make your first recommendations useful. You can change every answer later.`}
            icon={UserRound}
            id="profile"
            number={4}
            title="Tell us about you"
          >
            <LearnerProfileForm
              idPrefix="onboarding-profile"
              initialProfile={profileQuery.data?.data ?? null}
              isLoading={profileQuery.isPending}
              isSaving={saveProfile.isPending}
              loadError={
                profileQuery.isError
                  ? learnerProfileErrorMessage(profileQuery.error)
                  : null
              }
              onChange={() => saveProfile.reset()}
              onRetryLoad={() => void profileQuery.refetch()}
              onSubmit={handleSubmit}
              saveError={
                saveProfile.isError
                  ? learnerProfileErrorMessage(saveProfile.error)
                  : null
              }
              submitLabel="Complete setup"
            />
          </Step>
        </div>

        <Checklist
          items={[
            {
              label: 'Name and avatar',
              done: identityDone,
              detail: identityDone
                ? `Signed in as ${identity.name}.`
                : 'Optional; defaults from your sign-in.',
              target: 'you',
            },
            {
              label: 'Coach chosen',
              done: coachChosen,
              detail: coachChosen
                ? `${pets[choice].name} is your coach.`
                : 'Pick the pet you like.',
              target: 'coach',
            },
            {
              label: 'Browser connector',
              done: extensionConnected,
              detail: extensionConnected
                ? 'Connected and syncing.'
                : 'Optional, recommended.',
              target: 'connect',
            },
            {
              label: 'Platforms linked',
              done: linked > 0,
              detail:
                linked > 0
                  ? `${linked} linked.`
                  : 'Optional; link any time later.',
              target: 'connect',
            },
            {
              label: 'Your profile',
              done: false,
              detail: 'Goals, level and topics.',
              target: 'profile',
            },
          ]}
        />
      </div>
    </PageContainer>
  )
}

export default OnboardingPage
