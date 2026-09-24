import { useMutation, useQuery } from '@tanstack/react-query'
import type { IconComponent } from '@/components/icons/algo-icons'

import { fetchAvatarPhoto } from '@/features/profile/api/avatar'
import { displayNameFromEmail } from '@/lib/display-name'
import { supabase } from '@/lib/supabase'

import type { AuthUser } from './auth-context'
import { useAuth } from './useAuth'

// The learner's display name and avatar live in Supabase user metadata, so
// they follow the account across devices without a new backend table. Only
// a short name and an avatar style key are stored: an uploaded picture lives
// in the core API because an image would ride along in every access token.

export type AvatarPreset = {
  id: string
  label: string
  background: string
  icon?: IconComponent
}

// Learners choose between this default (their initial on the brand
// gradient) and their own uploaded picture. Older accounts that saved one of
// the retired preset styles fall back to this default.
export const DEFAULT_AVATAR: AvatarPreset = {
  id: 'default',
  label: 'Default',
  background: 'linear-gradient(140deg,var(--sky),var(--primary))',
}

// Chosen when the learner uploads their own picture. It falls back to the
// default gradient while the photo loads or if it is missing.
export const PHOTO_AVATAR_ID = 'photo'

export const NAME_MAX_LENGTH = 40

export function cleanDisplayName(value: string) {
  return (
    value
      // Drop control characters so a pasted name cannot break layouts.
      .replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX_LENGTH)
  )
}

export function identityFromUser(user: AuthUser | null) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const saved =
    typeof metadata.display_name === 'string'
      ? cleanDisplayName(metadata.display_name)
      : ''
  const style =
    typeof metadata.avatar_style === 'string' ? metadata.avatar_style : null
  return {
    name: saved || displayNameFromEmail(user?.email),
    hasCustomName: saved.length > 0,
    avatar: DEFAULT_AVATAR,
    usesPhoto: style === PHOTO_AVATAR_ID,
    photoVersion:
      typeof metadata.avatar_version === 'number' ? metadata.avatar_version : 0,
    email: user?.email ?? null,
  }
}

export function useUserIdentity() {
  const { user } = useAuth()
  return identityFromUser(user)
}

// Data URL for the learner's uploaded picture, or null when none is used.
export function useAvatarPhotoUrl() {
  const identity = useUserIdentity()
  const query = useQuery({
    queryKey: ['me', 'avatar', identity.photoVersion],
    queryFn: ({ signal }) => fetchAvatarPhoto(signal),
    enabled: identity.usesPhoto,
    staleTime: Infinity,
    retry: 1,
  })
  return identity.usesPhoto ? (query.data ?? null) : null
}

export function useUpdateUserIdentity() {
  return useMutation({
    mutationFn: async (input: { name: string; avatarId: string }) => {
      const name = cleanDisplayName(input.name)
      const usesPhoto = input.avatarId === PHOTO_AVATAR_ID
      const { error } = await supabase.auth.updateUser({
        data: {
          // An empty name clears the override and falls back to the email.
          display_name: name || null,
          avatar_style: usesPhoto ? PHOTO_AVATAR_ID : DEFAULT_AVATAR.id,
          // Bumped on each save so every open tab refetches a new photo.
          avatar_version: Date.now(),
        },
      })
      if (error) throw error
    },
  })
}
