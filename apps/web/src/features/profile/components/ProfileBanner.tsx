import type { ReactNode } from 'react'
import type { LearnerProfile } from '@algomemtor/shared-contracts'

import { UserAvatar } from '@/components/brand/UserAvatar'
import { useUserIdentity } from '@/features/auth/user-identity'

function readable(value: string) {
  const words = value.replaceAll('_', ' ').replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Sky banner with the learner's identity and what the coach knows at a glance.
export function ProfileBanner({
  email,
  profile,
  action,
}: {
  email: string | undefined | null
  profile: LearnerProfile | null | undefined
  action?: ReactNode
}) {
  const identity = useUserIdentity()
  const chips = profile
    ? [
        readable(profile.experience),
        readable(profile.goal),
        `${readable(profile.difficultyComfort)} difficulty`,
      ]
    : []

  return (
    <section className="sky-surface flex flex-col gap-5 rounded-xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
      <span
        aria-hidden="true"
        className="cloud animate-drift -top-8 right-10 w-80 opacity-80"
      />
      <div className="flex min-w-0 items-center gap-4 sm:gap-5">
        <UserAvatar className="size-16 text-2xl ring-4 ring-white/70 sm:size-20 sm:text-3xl dark:ring-white/10" />
        <div className="min-w-0">
          <p className="truncate font-heading text-2xl font-bold tracking-[-0.01em] sm:text-3xl">
            {identity.name}
          </p>
          <p className="truncate text-sm opacity-75">{email ?? 'Signed in'}</p>
          {chips.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <li
                  className="rounded-md bg-white/75 px-3 py-1 text-xs font-medium text-[#101012] backdrop-blur dark:bg-white/10 dark:text-[#f4f1ea]"
                  key={chip}
                >
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  )
}
