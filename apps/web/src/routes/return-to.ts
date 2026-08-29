const defaultReturnTo = '/dashboard'

function isLocationState(value: unknown): value is {
  pathname: unknown
  search?: unknown
  hash?: unknown
} {
  return value !== null && typeof value === 'object' && 'pathname' in value
}

function locationFromState(state: unknown): unknown {
  if (isLocationState(state)) {
    return state
  }

  if (state && typeof state === 'object' && 'from' in state) {
    return state.from
  }

  return null
}

export function safeReturnTo(state: unknown): string {
  const location = locationFromState(state)

  if (!isLocationState(location) || typeof location.pathname !== 'string') {
    return defaultReturnTo
  }

  if (
    !location.pathname.startsWith('/') ||
    location.pathname.startsWith('//')
  ) {
    return defaultReturnTo
  }

  const search = typeof location.search === 'string' ? location.search : ''
  const hash = typeof location.hash === 'string' ? location.hash : ''

  return `${location.pathname}${search}${hash}`
}

export function postOnboardingDestination(state: unknown): string {
  const destination = safeReturnTo(state)

  return destination === '/login' || destination === '/onboarding'
    ? defaultReturnTo
    : destination
}
