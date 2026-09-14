import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const storagePrefix = 'algomemtor:scroll:'

function locationKey({
  hash,
  pathname,
  search,
}: ReturnType<typeof useLocation>) {
  return `${storagePrefix}${pathname}${search}${hash}`
}

export function ScrollRestoration() {
  const location = useLocation()

  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  useEffect(() => {
    const key = locationKey(location)
    let frame: number | null = null

    function save() {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        window.sessionStorage.setItem(key, String(window.scrollY))
      })
    }

    const stored = Number(window.sessionStorage.getItem(key))
    window.requestAnimationFrame(() => {
      window.scrollTo({
        behavior: 'auto',
        left: 0,
        top: Number.isFinite(stored) && stored >= 0 ? stored : 0,
      })
    })
    window.addEventListener('scroll', save, { passive: true })

    return () => {
      window.removeEventListener('scroll', save)
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.sessionStorage.setItem(key, String(window.scrollY))
    }
  }, [location])

  return null
}
