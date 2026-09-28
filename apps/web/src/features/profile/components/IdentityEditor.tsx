import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ImageUp, LoaderCircle, Trash2 } from '@/components/icons/algo-icons'

import { useNotification } from '@/providers/useNotification'
import { UserAvatar } from '@/components/brand/UserAvatar'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_AVATAR,
  NAME_MAX_LENGTH,
  PHOTO_AVATAR_ID,
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

type PendingPhoto = { blob: Blob; url: string }

// Display name and avatar: the default initial or an uploaded picture.
export function IdentityEditor() {
  const identity = useUserIdentity()
  const savedPhotoUrl = useAvatarPhotoUrl()
  const update = useUpdateUserIdentity()
  const { notify } = useNotification()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const savedAvatarId = identity.usesPhoto ? PHOTO_AVATAR_ID : DEFAULT_AVATAR.id
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
        // Switching back to the default removes the stored picture.
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
      className="grid gap-8 rounded-xl border border-border bg-card p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-7"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Display name
            </span>
            <input
              autoComplete="nickname"
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder={identity.name}
              value={name}
            />
            <span className="text-xs leading-5 text-muted-foreground">
              Used in greetings, coaching, and your profile.
            </span>
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Account email
            </span>
            <input
              className="h-11 w-full min-w-0 cursor-not-allowed rounded-md border border-input bg-muted/60 px-3 text-sm text-muted-foreground outline-none"
              readOnly
              value={identity.email ?? 'Signed in account'}
            />
            <span className="text-xs leading-5 text-muted-foreground">
              Managed by your sign-in account.
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Avatar choice</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Use your uploaded photo or the AlgoMemtor default. Images are
            cropped and resized on your device before upload.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              aria-pressed={avatarId === DEFAULT_AVATAR.id}
              disabled={saving}
              onClick={() => {
                setPendingPhoto(null)
                setAvatarId(DEFAULT_AVATAR.id)
              }}
              size="sm"
              type="button"
              variant={avatarId === DEFAULT_AVATAR.id ? 'default' : 'outline'}
            >
              Use default
            </Button>
            {photoUrl ? (
              <Button
                aria-pressed={avatarId === PHOTO_AVATAR_ID}
                disabled={saving}
                onClick={() => setAvatarId(PHOTO_AVATAR_ID)}
                size="sm"
                type="button"
                variant={avatarId === PHOTO_AVATAR_ID ? 'default' : 'outline'}
              >
                Use my photo
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-3">
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

      <div className="flex min-w-0 flex-col gap-3">
        <span className="text-sm font-medium text-foreground">
          Profile photo
        </span>
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
        <button
          className="group flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-background p-5 text-center outline-none transition-[border-color,background-color,transform] hover:border-primary hover:bg-sky-soft/35 active:scale-[0.99] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={preparing || saving}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void choosePhoto(event.dataTransfer.files[0])
          }}
          type="button"
        >
          <UserAvatar
            className="size-20 text-3xl transition-transform group-hover:scale-105"
            name={previewName}
            photoUrl={usingPhoto ? photoUrl : null}
            preset={DEFAULT_AVATAR}
          />
          <span className="flex items-center gap-2 text-sm font-semibold text-primary">
            {preparing ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <ImageUp aria-hidden="true" />
            )}
            {photoUrl ? 'Replace photo' : 'Upload photo'}
          </span>
          <span className="max-w-52 text-xs leading-5 text-muted-foreground">
            Drop an image here or choose a file up to 20 MB. It is resized on
            your device before upload.
          </span>
        </button>
        {usingPhoto ? (
          <Button
            className="self-start"
            disabled={saving}
            onClick={() => {
              setPendingPhoto(null)
              setAvatarId(DEFAULT_AVATAR.id)
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
    </form>
  )
}
