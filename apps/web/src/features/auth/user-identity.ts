import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Brain,
  Code2,
  Crown,
  Flame,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { fetchAvatarPhoto } from '@/features/profile/api/avatar'
import { displayNameFromEmail } from '@/lib/display-name'
import { supabase } from '@/lib/supabase'

import type { AuthUser } from './auth-context'
import { useAuth } from './useAuth'

// The learner's display name and avatar live in Supabase user metadata, so
// they follow the account across devices without a new backend table. Only
// a short name and a preset key are stored: an image would ride along in
// every access token.

export type AvatarPreset = {
  id: string
  label: string
  background: string
  icon?: LucideIcon
}

export const avatarPresets: readonly AvatarPreset[] = [
  {
    id: 'sunset',
    label: 'Sunset',
    background: 'linear-gradient(140deg,var(--sky),var(--primary))',
  },
  {
    id: 'ember',
    label: 'Ember',
    background: 'linear-gradient(140deg,#ff8a4c,#c2380b)',
  },
  {
    id: 'ink',
    label: 'Ink',
    background: 'linear-gradient(140deg,#4a4a4d,#101012)',
  },
  {
    id: 'forest',
    label: 'Forest',
    background: 'linear-gradient(140deg,#3fae72,#0f5132)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    background: 'linear-gradient(140deg,#5b8def,#1b3f8f)',
  },
  {
    id: 'violet',
    label: 'Violet',
    background: 'linear-gradient(140deg,#9b7bff,#4a2a9e)',
  },
  {
    id: 'code',
    label: 'Coder',
    background: 'linear-gradient(140deg,#2a2a2d,#101012)',
    icon: Code2,
  },
  {
    id: 'trophy',
    label: 'Contestant',
    background: 'linear-gradient(140deg,#f2b84b,#b86b0a)',
    icon: Trophy,
  },
  {
    id: 'brain',
    label: 'Thinker',
    background: 'linear-gradient(140deg,#9b7bff,#4a2a9e)',
    icon: Brain,
  },
  {
    id: 'flame',
    label: 'Streak',
    background: 'linear-gradient(140deg,#ff8a4c,#c2380b)',
    icon: Flame,
  },
  {
    id: 'zap',
    label: 'Speedrunner',
    background: 'linear-gradient(140deg,#5b8def,#1b3f8f)',
    icon: Zap,
  },
  {
    id: 'crown',
    label: 'Grandmaster',
    background: 'linear-gradient(140deg,#e0484f,#8f1d24)',
    icon: Crown,
  },
]

// Chosen when the learner uploads their own picture. It falls back to the
// default gradient while the photo loads or if it is missing.
export const PHOTO_AVATAR_ID = 'photo'

export const NAME_MAX_LENGTH = 40
const DEFAULT_AVATAR = avatarPresets[0]

export function avatarPreset(id: string | undefined | null) {
  return avatarPresets.find((preset) => preset.id === id) ?? DEFAULT_AVATAR
}

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
    avatar: avatarPreset(style),
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
          avatar_style: usesPhoto
            ? PHOTO_AVATAR_ID
            : avatarPreset(input.avatarId).id,
          // Bumped on each save so every open tab refetches a new photo.
          avatar_version: Date.now(),
        },
      })
      if (error) throw error
    },
  })
}
