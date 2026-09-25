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
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <div
        aria-hidden="true"
        className="profile-cover relative h-28 overflow-hidden sm:h-36"
      >
        <span className="absolute -top-12 right-[8%] size-44 rounded-full border border-white/20" />
        <span className="absolute -right-10 -bottom-28 size-56 rounded-full border border-white/15" />
      </div>

      <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-10 flex flex-col gap-5 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <UserAvatar className="size-20 shrink-0 border-4 border-card text-3xl shadow-soft sm:size-24 sm:text-4xl" />
            <div className="min-w-0 pb-0.5 sm:pb-1">
              <p className="truncate font-heading text-2xl font-bold tracking-[-0.01em] text-foreground sm:text-3xl">
                {identity.name}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {email ?? 'Signed in'}
              </p>
            </div>
          </div>
          {action ? <div className="shrink-0 sm:pb-1">{action}</div> : null}
        </div>

        {chips.length ? (
          <ul className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
            {chips.map((chip) => (
              <li
                className="rounded-md border border-border bg-muted/55 px-2.5 py-1 text-xs font-medium text-foreground"
                key={chip}
              >
                {chip}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
