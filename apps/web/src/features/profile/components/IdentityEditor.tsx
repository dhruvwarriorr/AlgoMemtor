import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Check,
  ImageUp,
  LoaderCircle,
  Trash2,
} from '@/components/icons/algo-icons'

import { useNotification } from '@/app/useNotification'
import { UserAvatar } from '@/components/brand/UserAvatar'
import { Button } from '@/components/ui/button'
import {
  NAME_MAX_LENGTH,
  PHOTO_AVATAR_ID,
  avatarPreset,
  avatarPresets,
  cleanDisplayName,
  useAvatarPhotoUrl,
  useUpdateUserIdentity,
  useUserIdentity,
} from '@/features/auth/user-identity'
import {
  deleteAvatarPhoto,
  prepareAvatarImage,
  uploadAvatarPhoto,
} from '@/features/profile/api/avatar'
import { cn } from '@/lib/utils'

type PendingPhoto = { blob: Blob; url: string }

// Display name, preset avatar or an uploaded profile picture.
export function IdentityEditor() {
  const identity = useUserIdentity()
  const savedPhotoUrl = useAvatarPhotoUrl()
  const update = useUpdateUserIdentity()
  const { notify } = useNotification()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const savedAvatarId = identity.usesPhoto
    ? PHOTO_AVATAR_ID
    : identity.avatar.id
  const [name, setName] = useState(identity.hasCustomName ? identity.name : '')
  const [avatarId, setAvatarId] = useState(savedAvatarId)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(
    () => () => {
      if (pendingPhoto !== null) URL.revokeObjectURL(pendingPhoto.url)
    },
    [pendingPhoto],
  )

  const photoUrl =
    pendingPhoto?.url ?? (identity.usesPhoto ? savedPhotoUrl : null)
  const usingPhoto = avatarId === PHOTO_AVATAR_ID && photoUrl !== null
  const previewName = cleanDisplayName(name) || identity.name
  const dirty =
    cleanDisplayName(name) !== (identity.hasCustomName ? identity.name : '') ||
    avatarId !== savedAvatarId ||
    pendingPhoto !== null

  async function choosePhoto(file: File | undefined) {
    if (file === undefined) return
    setPreparing(true)
    try {
      const blob = await prepareAvatarImage(file)
      setPendingPhoto({ blob, url: URL.createObjectURL(blob) })
      setAvatarId(PHOTO_AVATAR_ID)
    } catch (error) {
      notify({
        title: 'That photo could not be used',
        description:
          error instanceof Error ? error.message : 'Try another image.',
        tone: 'error',
      })
    } finally {
      setPreparing(false)
    }
  }

  function reset() {
    setName(identity.hasCustomName ? identity.name : '')
    setAvatarId(savedAvatarId)
    setPendingPhoto(null)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      if (avatarId === PHOTO_AVATAR_ID && pendingPhoto !== null) {
        await uploadAvatarPhoto(pendingPhoto.blob)
      }
      if (avatarId !== PHOTO_AVATAR_ID && identity.usesPhoto) {
        // Switching back to a preset removes the stored picture.
        await deleteAvatarPhoto()
      }
      await update.mutateAsync({ name, avatarId })
      setPendingPhoto(null)
      notify({ title: 'Name and avatar saved', tone: 'success' })
    } catch (error) {
      notify({
        title: 'Your name and avatar were not saved',
        description:
          error instanceof Error ? error.message : 'Try again shortly.',
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="grid gap-6 rounded-xl border border-border bg-card p-5 sm:p-6 md:grid-cols-[auto_minmax(0,1fr)]"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex flex-col items-center gap-3 md:pt-1">
        <UserAvatar
          className="size-24 text-4xl"
          name={previewName}
          photoUrl={usingPhoto ? photoUrl : null}
          preset={avatarPreset(avatarId)}
        />
        <p className="max-w-36 truncate text-center text-sm font-medium text-foreground">
          {previewName}
        </p>
        <input
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void choosePhoto(event.target.files?.[0])
            event.target.value = ''
          }}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <Button
          disabled={preparing || saving}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          {preparing ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <ImageUp aria-hidden="true" />
          )}
          {photoUrl ? 'Change photo' : 'Upload photo'}
        </Button>
        {usingPhoto ? (
          <Button
            disabled={saving}
            onClick={() => {
              setPendingPhoto(null)
              setAvatarId(avatarPresets[0].id)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
            Remove photo
          </Button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Display name
          </span>
          <input
            autoComplete="nickname"
            className="h-11 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder={identity.name}
            value={name}
          />
          <span className="text-xs text-muted-foreground">
            Shown in greetings, the coach and your profile. Leave empty to use
            the name from your email.
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-foreground">
            Avatar
          </legend>
          <div className="flex flex-wrap gap-2.5">
            {photoUrl ? (
              <AvatarOption
                label="Your photo"
                onSelect={() => setAvatarId(PHOTO_AVATAR_ID)}
                selected={avatarId === PHOTO_AVATAR_ID}
              >
                <UserAvatar
                  className="size-11"
                  name={previewName}
                  photoUrl={photoUrl}
                />
              </AvatarOption>
            ) : null}
            {avatarPresets.map((preset) => (
              <AvatarOption
                key={preset.id}
                label={preset.label}
                onSelect={() => setAvatarId(preset.id)}
                selected={preset.id === avatarId}
              >
                <UserAvatar
                  className="size-11 text-base"
                  name={previewName}
                  photoUrl={null}
                  preset={preset}
                />
              </AvatarOption>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Photos are cropped to a square, resized on your device, and stored
            with your AlgoMemtor account.
          </p>
        </fieldset>

        <div className="flex items-center gap-3">
          <Button disabled={!dirty || saving || preparing} type="submit">
            {saving ? 'Saving…' : 'Save name and avatar'}
          </Button>
          {dirty ? (
            <Button onClick={reset} type="button" variant="ghost">
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  )
}

function AvatarOption({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'relative rounded-full p-0.5 ring-offset-2 ring-offset-card transition-[box-shadow,transform] duration-200 hover:scale-105',
        selected ? 'ring-2 ring-primary' : 'ring-1 ring-border',
      )}
      onClick={onSelect}
      title={label}
      type="button"
    >
      {children}
      {selected ? (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-4.5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
          <Check aria-hidden="true" className="size-3" />
        </span>
      ) : null}
    </button>
  )
}
