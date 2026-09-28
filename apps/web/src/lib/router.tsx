'use client'

import NextLink from 'next/link'
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from 'next/navigation'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

// Navigation helpers on top of the Next.js App Router, with the small
// react-router surface the app was written against: `to` links, NavLink
// active classes, navigate(-1), setSearchParams and one-shot navigation
// state. Next.js has no history state of its own, so state rides in the
// history entry under STATE_KEY (Next keeps extra keys on its entries);
// Back and Forward bring it back with the entry, as a browser would.

const STATE_KEY = '__algomemtorState'

type To = string | { pathname?: string; search?: string; hash?: string }

type NavigateOptions = { replace?: boolean; state?: unknown }

// State for a navigation that has been requested but whose history entry
// does not exist yet.
let pending: { href: string; state: unknown } | null = null
const listeners = new Set<() => void>()
let version = 0

const emit = () => {
  version += 1
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

const currentHref = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`

function resolveTo(to: To) {
  if (typeof to === 'string') {
    const url = new URL(to, window.location.href)
    return `${url.pathname}${url.search}${url.hash}`
  }
  const pathname = to.pathname ?? window.location.pathname
  const search =
    to.search === undefined
      ? to.pathname === undefined
        ? window.location.search
        : ''
      : to.search === '' || to.search.startsWith('?')
        ? to.search
        : `?${to.search}`
  const hash =
    to.hash === undefined || to.hash === ''
      ? ''
      : to.hash.startsWith('#')
        ? to.hash
        : `#${to.hash}`
  return `${pathname}${search}${hash}`
}

function setPendingState(href: string, state: unknown) {
  pending = { href, state: state ?? null }
  emit()
}

function readState(): unknown {
  if (pending !== null && pending.href === currentHref()) return pending.state
  const entry: unknown = window.history.state
  return typeof entry === 'object' && entry !== null && STATE_KEY in entry
    ? (entry as Record<string, unknown>)[STATE_KEY]
    : null
}

// Moves pending navigation state onto the history entry once Next.js has
// created it. Rendered once, near the root.
export function NavigationStateSync() {
  const pathname = usePathname()
  const searchParams = useNextSearchParams()
  const storeVersion = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )

  useEffect(() => {
    if (pending === null || pending.href !== currentHref()) return
    const entry: unknown = window.history.state
    window.history.replaceState(
      {
        ...(typeof entry === 'object' && entry !== null ? entry : {}),
        [STATE_KEY]: pending.state,
      },
      '',
    )
    pending = null
  }, [pathname, searchParams, storeVersion])

  return null
}

export type Location = {
  pathname: string
  search: string
  hash: string
  state: unknown
  key: string
}

export function useLocation(): Location {
  const pathname = usePathname()
  const searchParams = useNextSearchParams()
  const storeVersion = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  const search = searchParams.toString()

  // One object per location, so effects that depend on it run once per
  // navigation.
  return useMemo(
    () => ({
      pathname,
      search: search === '' ? '' : `?${search}`,
      hash: window.location.hash,
      state: readState(),
      key: `${pathname}?${search}#${storeVersion}`,
    }),
    [pathname, search, storeVersion],
  )
}

export function useNavigate() {
  const router = useRouter()

  return useCallback(
    (to: To | number, options: NavigateOptions = {}) => {
      if (typeof to === 'number') {
        window.history.go(to)
        return
      }
      const href = resolveTo(to)
      setPendingState(href, options.state)
      // The app restores scroll positions itself (ScrollRestoration).
      if (options.replace === true) router.replace(href, { scroll: false })
      else router.push(href, { scroll: false })
    },
    [router],
  )
}

export function useParams<
  T extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
>(): T {
  const params = useNextParams()
  return useMemo(() => {
    const decoded: Record<string, string> = {}
    for (const [key, value] of Object.entries(params ?? {})) {
      const raw = Array.isArray(value) ? value.join('/') : value
      if (raw === undefined) continue
      try {
        decoded[key] = decodeURIComponent(raw)
      } catch {
        decoded[key] = raw
      }
    }
    return decoded as T
  }, [params])
}

type SearchParamsInit =
  URLSearchParams | string | Record<string, string | readonly string[]>

export function useSearchParams() {
  const searchParams = useNextSearchParams()
  const navigate = useNavigate()
  const current = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  )

  const setSearchParams = useCallback(
    (next: SearchParamsInit, options: NavigateOptions = {}) => {
      let params: URLSearchParams
      if (typeof next === 'string' || next instanceof URLSearchParams) {
        params = new URLSearchParams(next)
      } else {
        params = new URLSearchParams()
        for (const [key, value] of Object.entries(next)) {
          if (typeof value === 'string') params.append(key, value)
          else for (const item of value) params.append(key, item)
        }
      }
      const search = params.toString()
      navigate(
        { pathname: window.location.pathname, search: search && `?${search}` },
        options,
      )
    },
    [navigate],
  )

  return [current, setSearchParams] as const
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: To
  replace?: boolean
  state?: unknown
  children?: ReactNode
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, onClick, ...rest },
  ref,
) {
  const href = typeof to === 'string' ? to : toHref(to)
  return (
    <NextLink
      {...rest}
      ref={ref}
      href={href}
      replace={replace ?? false}
      scroll={false}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        // Only a plain click navigates this tab and carries the state.
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (rest.target !== undefined && rest.target !== '_self')
        ) {
          return
        }
        setPendingState(resolveTo(to), state)
      }}
    />
  )
})

const toHref = (to: Exclude<To, string>) =>
  `${to.pathname ?? ''}${to.search ?? ''}${to.hash ?? ''}`

type NavLinkProps = Omit<LinkProps, 'className' | 'children'> & {
  end?: boolean
  className?: string | ((props: { isActive: boolean }) => string | undefined)
  children?: ReactNode | ((props: { isActive: boolean }) => ReactNode)
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink({ to, end, className, children, ...rest }, ref) {
    const pathname = usePathname()
    const target = (typeof to === 'string' ? to : (to.pathname ?? '')).split(
      /[?#]/,
    )[0]
    const base =
      target !== undefined && target.length > 1
        ? target.replace(/\/+$/, '')
        : target
    const isActive =
      pathname === base ||
      (end !== true && base !== '/' && pathname.startsWith(`${base}/`))
    return (
      <Link
        {...rest}
        ref={ref}
        to={to}
        aria-current={isActive ? 'page' : undefined}
        className={
          typeof className === 'function' ? className({ isActive }) : className
        }
      >
        {typeof children === 'function' ? children({ isActive }) : children}
      </Link>
    )
  },
)

export function Navigate({
  to,
  replace,
  state,
}: {
  to: To
  replace?: boolean
  state?: unknown
}) {
  const navigate = useNavigate()
  useEffect(() => {
    navigate(to, {
      ...(replace === undefined ? {} : { replace }),
      state,
    })
    // Navigate once, when rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
