import { createClient } from '@supabase/supabase-js'

function requireEnvironmentVariable(name: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value.trim()
}

// NEXT_PUBLIC_ values are inlined into the browser bundle at build time.
const supabaseUrl = requireEnvironmentVariable(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)
const supabasePublishableKey = requireEnvironmentVariable(
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)
// Auth callbacks return to the site the user is visiting. A build-time site
// URL can accidentally point a deployed app back to a developer's localhost.
const siteOrigin = window.location.origin

export const authRedirectUrl = new URL('/dashboard', siteOrigin).toString()

export const authRecoveryRedirectUrl = new URL(
  '/reset-password',
  siteOrigin,
).toString()

export const authSettingsRedirectUrl = new URL(
  '/settings',
  siteOrigin,
).toString()

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
