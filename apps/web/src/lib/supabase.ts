import { createClient } from '@supabase/supabase-js'

function requireEnvironmentVariable(name: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value.trim()
}

const supabaseUrl = requireEnvironmentVariable(
  'VITE_SUPABASE_URL',
  import.meta.env.VITE_SUPABASE_URL,
)
const supabasePublishableKey = requireEnvironmentVariable(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
const siteUrl = requireEnvironmentVariable(
  'VITE_SITE_URL',
  import.meta.env.VITE_SITE_URL,
)

function requireSiteOrigin(value: string): string {
  const url = new URL(value)
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)

  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'VITE_SITE_URL must be an HTTPS URL, or an HTTP loopback URL for local development, without credentials, query parameters, or fragments.',
    )
  }

  return url.origin
}

const siteOrigin = requireSiteOrigin(siteUrl)

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
