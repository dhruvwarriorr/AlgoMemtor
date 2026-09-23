import {
  useAvatarPhotoUrl,
  useUserIdentity,
  type AvatarPreset,
} from '@/features/auth/user-identity'
import { cn } from '@/lib/utils'

// The signed-in learner's avatar: their uploaded photo when they chose one,
// otherwise a preset. `preset`, `name` and `photoUrl` let pickers preview a
// choice before it is saved.
function UserAvatar({
  className,
  preset,
  name,
  photoUrl,
}: {
  className?: string
  preset?: AvatarPreset
  name?: string
  /** Explicit photo (e.g. an unsaved preview); null forces the preset. */
  photoUrl?: string | null
}) {
  const identity = useUserIdentity()
  const savedPhoto = useAvatarPhotoUrl()
  const photo =
    photoUrl !== undefined ? photoUrl : preset === undefined ? savedPhoto : null
  const style = preset ?? identity.avatar
  const initial = (name ?? identity.name).trim().charAt(0).toUpperCase() || '?'
  const Icon = style.icon

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center overflow-hidden rounded-full font-heading text-sm font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]',
        className,
      )}
      style={{ background: style.background }}
    >
      {photo ? (
        <img
          alt=""
          className="size-full object-cover"
          draggable={false}
          src={photo}
        />
      ) : Icon ? (
        <Icon className="size-[48%]" strokeWidth={2} />
      ) : (
        initial
      )}
    </span>
  )
}

export { UserAvatar }
