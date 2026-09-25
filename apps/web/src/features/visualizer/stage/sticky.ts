import { useEffect, useState, type CSSProperties } from 'react'

// A box that may grow but never shrinks while it is mounted. Stepping through
// a run constantly adds and removes items (a stack pops, a chip leaves
// scope); without this everything below would jump up and down each step.
export function useStickyHeight<T extends HTMLElement>(): [
  attach: (node: T | null) => void,
  style: CSSProperties,
] {
  const [node, setNode] = useState<T | null>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const measured =
        entry?.borderBoxSize[0]?.blockSize ??
        node.getBoundingClientRect().height
      setHeight((previous) =>
        measured > previous + 0.5 ? Math.ceil(measured) : previous,
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, height > 0 ? { minHeight: height } : {}]
}
