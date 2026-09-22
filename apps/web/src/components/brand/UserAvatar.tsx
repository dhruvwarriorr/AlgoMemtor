import { displayNameFromEmail } from '@/lib/display-name'
import { cn } from '@/lib/utils'

function UserAvatar({
  email,
  className,
}: {
  email: string | undefined | null
  className?: string
}) {
  const initial = displayNameFromEmail(email).charAt(0).toUpperCase()

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(140deg,var(--sky),var(--primary))] font-heading text-sm font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]',
        className,
      )}
    >
      {initial}
    </span>
  )
}

export { UserAvatar }
