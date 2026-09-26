const storagePrefix = 'algomemtor:scroll:'

export function scrollLocationKey({
  hash,
  pathname,
  search,
}: {
  hash: string
  pathname: string
  search: string
}) {
  return `${storagePrefix}${pathname}${search}${hash}`
}

// Navigation state for an in-page change (such as picking an item kept in the
// URL) that should leave the scroll position where it is.
export const keepScrollState = { keepScroll: true } as const

export function keepsScroll(state: unknown) {
  return (
    typeof state === 'object' &&
    state !== null &&
    'keepScroll' in state &&
    state.keepScroll === true
  )
}
