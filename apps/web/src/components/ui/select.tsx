import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Check } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

// AlgoMemtor's dropdown. It replaces the browser's native select: a trigger
// button and an animated listbox that opens below it (or above, near the
// bottom of the screen), with full keyboard support: arrows, Home/End,
// type-to-find, Enter/Space to choose, and Escape or Tab to close.

export type SelectOption = {
  value: string
  label: ReactNode
  // Plain text for type-to-find when `label` is not a string.
  text?: string
  description?: ReactNode
  disabled?: boolean
}

type SelectProps = {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder?: string
  id?: string
  name?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

const optionText = (option: SelectOption) =>
  option.text ??
  (typeof option.label === 'string' || typeof option.label === 'number'
    ? String(option.label)
    : option.value)

type Placement = {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const listGap = 6
const listMaxHeight = 288

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  id,
  name,
  disabled = false,
  size = 'md',
  className,
  ...aria
}: SelectProps) {
  const reduceMotion = useReducedMotion()
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = options[selectedIndex]

  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger === null) return
    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - listGap - 8
    const above = rect.top - listGap - 8
    const openUp = below < Math.min(listMaxHeight, 180) && above > below
    setPlacement({
      left: Math.max(
        8,
        Math.min(rect.left, window.innerWidth - rect.width - 8),
      ),
      width: Math.max(rect.width, 160),
      maxHeight: Math.max(120, Math.min(listMaxHeight, openUp ? above : below)),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + listGap }
        : { top: rect.bottom + listGap }),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    listRef.current?.focus({ preventScroll: true })
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  useEffect(() => {
    if (!open || active < 0) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (
      let index = from;
      index >= 0 && index < options.length;
      index += step
    ) {
      if (!options[index]?.disabled) return index
    }
    return -1
  }

  function show(start?: number) {
    if (disabled) return
    setActive(
      start ??
        (selectedIndex >= 0 && !options[selectedIndex]?.disabled
          ? selectedIndex
          : firstEnabled(0, 1)),
    )
    setOpen(true)
  }

  function close(focusTrigger = true) {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true })
  }

  function choose(index: number) {
    const option = options[index]
    if (option === undefined || option.disabled) return
    if (option.value !== value) onValueChange(option.value)
    close()
  }

  // Type-to-find: letters typed close together build one search.
  function find(key: string, now: number) {
    typed.current =
      now - typed.current.at < 700
        ? { text: typed.current.text + key.toLowerCase(), at: now }
        : { text: key.toLowerCase(), at: now }
    const start = Math.max(0, active)
    const order = [
      ...options
        .slice(start + 1)
        .map((option, offset) => [option, start + 1 + offset] as const),
      ...options
        .slice(0, start + 1)
        .map((option, index) => [option, index] as const),
    ]
    const match = order.find(
      ([option]) =>
        !option.disabled &&
        optionText(option).toLowerCase().startsWith(typed.current.text),
    )
    return match?.[1]
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      show(
        event.key === 'ArrowUp' && selectedIndex < 0
          ? firstEnabled(options.length - 1, -1)
          : undefined,
      )
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const index = find(event.key, event.timeStamp)
      if (index !== undefined) choose(index)
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const move = (next: number) => {
      event.preventDefault()
      if (next >= 0) setActive(next)
    }
    switch (event.key) {
      case 'ArrowDown':
        move(firstEnabled(active + 1, 1))
        return
      case 'ArrowUp':
        move(firstEnabled(active - 1, -1))
        return
      case 'Home':
        move(firstEnabled(0, 1))
        return
      case 'End':
        move(firstEnabled(options.length - 1, -1))
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(active)
        return
      case 'Escape':
        event.preventDefault()
        // Closing the list must not also close a dialog behind it.
        event.stopPropagation()
        close()
        return
      case 'Tab':
        close(false)
        return
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const index = find(event.key, event.timeStamp)
          if (index !== undefined) setActive(index)
        }
    }
  }

  const list = (
    <AnimatePresence>
      {open && placement !== null ? (
        <motion.ul
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-labelledby={aria['aria-labelledby']}
          className={cn(
            'fixed z-[70] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground outline-none',
            placement.bottom === undefined ? 'origin-top' : 'origin-bottom',
          )}
          exit={{
            opacity: 0,
            scale: 0.97,
            y: placement.bottom === undefined ? -4 : 4,
          }}
          id={listId}
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  scale: 0.96,
                  y: placement.bottom === undefined ? -6 : 6,
                }
          }
          key="list"
          onKeyDown={onListKeyDown}
          ref={listRef}
          role="listbox"
          style={{
            left: placement.left,
            minWidth: placement.width,
            maxHeight: placement.maxHeight,
            ...(placement.top === undefined ? {} : { top: placement.top }),
            ...(placement.bottom === undefined
              ? {}
              : { bottom: placement.bottom }),
          }}
          tabIndex={-1}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isActive = index === active
            return (
              <li
                aria-disabled={option.disabled || undefined}
                aria-selected={isSelected}
                className={cn(
                  'relative flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors select-none',
                  option.disabled && 'cursor-not-allowed opacity-45',
                  isSelected
                    ? 'font-medium text-foreground'
                    : 'text-foreground/85',
                )}
                data-index={index}
                id={`${listId}-${index}`}
                key={option.value}
                onClick={() => choose(index)}
                onPointerMove={() => {
                  if (!option.disabled && active !== index) setActive(index)
                }}
                role="option"
              >
                {isActive ? (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-secondary"
                    layoutId={`${listId}-active`}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 600, damping: 40 }
                    }
                  />
                ) : null}
                <span className="relative grid size-4 shrink-0 place-items-center pt-0.5">
                  {isSelected ? (
                    <Check
                      aria-hidden="true"
                      className="size-3.5 text-primary"
                    />
                  ) : null}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </motion.ul>
      ) : null}
    </AnimatePresence>
  )

  return (
    <>
      <button
        aria-controls={open ? listId : undefined}
        aria-describedby={aria['aria-describedby']}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={aria['aria-invalid'] || undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        className={cn(
          'group inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background text-left text-foreground outline-none transition-[border-color,box-shadow,background-color] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive',
          size === 'sm'
            ? 'h-8 px-2.5 text-sm'
            : 'h-10 px-3 text-base sm:text-sm',
          open && 'border-ring ring-4 ring-ring/15',
          className,
        )}
        disabled={disabled}
        id={id}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span
          className={cn(
            'min-w-0 truncate',
            selected === undefined && 'text-muted-foreground',
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <Chevron
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
            open && 'rotate-180 text-foreground',
          )}
        />
      </button>
      {name === undefined ? null : (
        <input name={name} type="hidden" value={value} />
      )}
      {typeof document === 'undefined'
        ? null
        : createPortal(list, document.body)}
    </>
  )
}
