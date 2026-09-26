import { useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

// Smooth path through points (Catmull-Rom as cubic Béziers).
function smoothPath(points: readonly (readonly [number, number])[]) {
  if (points.length === 0) return ''
  const [first] = points
  if (first === undefined) return ''
  let d = `M${first[0]},${first[1]}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2
    if (!p0 || !p1 || !p2 || !p3) continue
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

// A tiny trend line with a soft fill under it that draws itself in.
export function Sparkline({
  values,
  className,
  color = 'var(--acc)',
  fill = true,
}: {
  values: readonly number[]
  className?: string
  color?: string
  fill?: boolean
}) {
  const gradientId = `s${useId().replace(/[^\w-]/g, '')}`
  const reduceMotion = useReducedMotion()
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const points = values.map(
    (value, index) =>
      [
        (index / (values.length - 1)) * 100,
        28 - ((value - min) / span) * 24,
      ] as const,
  )
  const line = smoothPath(points)
  const area = `${line} L100,32 L0,32 Z`
  return (
    <svg
      aria-hidden="true"
      className={cn('h-8 w-full overflow-visible', className)}
      preserveAspectRatio="none"
      viewBox="0 0 100 32"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill ? (
        <motion.path
          d={area}
          fill={`url(#${gradientId})`}
          initial={reduceMotion ? false : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1 }}
        />
      ) : null}
      <motion.path
        d={line}
        fill="none"
        initial={reduceMotion ? false : { pathLength: 0 }}
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.8}
        transition={{ duration: 1.3, ease }}
        vectorEffect="non-scaling-stroke"
        viewport={{ once: true }}
        whileInView={{ pathLength: 1 }}
      />
    </svg>
  )
}

export type TraceBarDatum = {
  label: string
  value: number
  // Shown under the value when the bar is hovered.
  detail?: string
  color?: string
}

// Bars that rise in; hovering one dims the rest and traces its height back
// to the axis with the exact value.
export function TraceBars({
  data,
  height = 168,
  format = (value) => value.toLocaleString(),
  className,
  label,
  showLabels = true,
}: {
  data: readonly TraceBarDatum[]
  height?: number
  format?: (value: number) => string
  className?: string
  label: string
  showLabels?: boolean
}) {
  const [active, setActive] = useState<number | null>(null)
  const reduceMotion = useReducedMotion()
  const max = Math.max(1, ...data.map((item) => item.value))
  const activeItem = active === null ? undefined : data[active]

  return (
    <figure className={cn('min-w-0', className)}>
      <div
        aria-hidden="true"
        className="relative"
        onPointerLeave={() => setActive(null)}
        style={{ height }}
      >
        {/* Baseline guides. */}
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <span
            className="absolute inset-x-0 border-t border-dashed border-border/70"
            key={step}
            style={{ bottom: `${step * 100}%` }}
          />
        ))}
        {activeItem ? (
          <motion.span
            animate={{ bottom: `${(activeItem.value / max) * 100}%` }}
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-acc"
            initial={false}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <span className="absolute -top-3 left-0 rounded-md bg-acc px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold text-white tabular-nums shadow-soft dark:text-[#0b0c0e]">
              {format(activeItem.value)}
            </span>
          </motion.span>
        ) : null}
        <div className="absolute inset-0 flex items-end gap-[6%] pl-10">
          {data.map((item, index) => (
            <div
              className="relative flex h-full min-w-0 flex-1 items-end"
              key={`${item.label}-${index}`}
              onPointerEnter={() => setActive(index)}
            >
              <motion.span
                animate={{
                  scaleY: 1,
                  opacity: active === null || active === index ? 1 : 0.28,
                }}
                className="block w-full origin-bottom rounded-t-md"
                initial={reduceMotion ? false : { scaleY: 0, opacity: 1 }}
                style={{
                  height: `${Math.max(2, (item.value / max) * 100)}%`,
                  background:
                    item.color ??
                    'linear-gradient(to top, color-mix(in oklab, var(--acc) 55%, transparent), var(--acc))',
                }}
                transition={{
                  scaleY: { duration: 0.8, ease, delay: 0.04 * index },
                  opacity: { duration: 0.2 },
                }}
              />
            </div>
          ))}
        </div>
      </div>
      {showLabels ? (
        <div aria-hidden="true" className="mt-2 flex gap-[6%] pl-10">
          {data.map((item, index) => (
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-center font-mono text-[0.65rem] text-muted-foreground transition-colors',
                active === index && 'text-foreground',
              )}
              key={`${item.label}-${index}`}
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      <figcaption className="sr-only">
        {label}:{' '}
        {data.map((item) => `${item.label} ${format(item.value)}`).join(', ')}
      </figcaption>
      {activeItem?.detail ? (
        <p
          aria-hidden="true"
          className="mt-1 pl-10 text-xs text-muted-foreground"
        >
          {activeItem.label}: {activeItem.detail}
        </p>
      ) : null}
    </figure>
  )
}

export type HeatRow = {
  label: string
  cells: readonly { value: number; title?: string }[]
}

// A cohort-style grid: rows of cells whose tint follows the value.
export function HeatGrid({
  rows,
  columns,
  label,
  className,
  format = (value) => String(value),
}: {
  rows: readonly HeatRow[]
  columns: readonly string[]
  label: string
  className?: string
  format?: (value: number) => string
}) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(
    1,
    ...rows.flatMap((row) => row.cells.map((c) => c.value)),
  )
  return (
    <div className={cn('min-w-0 overflow-x-auto', className)}>
      <table className="w-full border-separate border-spacing-1 text-xs">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th className="w-24" scope="col">
              <span className="sr-only">Row</span>
            </th>
            {columns.map((column) => (
              <th
                className="px-1 pb-1 text-center font-mono text-[0.65rem] font-normal text-muted-foreground"
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.label}>
              <th
                className="truncate pr-2 text-left font-medium text-foreground"
                scope="row"
              >
                {row.label}
              </th>
              {row.cells.map((cell, cellIndex) => {
                const share = cell.value / max
                return (
                  <td className="p-0" key={cellIndex}>
                    <motion.span
                      animate={{ opacity: 1, scale: 1 }}
                      className="grid h-8 min-w-9 place-items-center rounded-md font-mono text-[0.68rem] tabular-nums"
                      initial={
                        reduceMotion ? false : { opacity: 0, scale: 0.6 }
                      }
                      style={{
                        background:
                          cell.value === 0
                            ? 'color-mix(in oklab, var(--foreground) 5%, transparent)'
                            : `color-mix(in oklab, var(--acc) ${Math.round(18 + share * 72)}%, transparent)`,
                        color: share > 0.55 ? '#fff' : 'var(--foreground)',
                      }}
                      title={cell.title}
                      transition={{
                        duration: 0.35,
                        ease,
                        delay: 0.02 * (rowIndex * row.cells.length + cellIndex),
                      }}
                    >
                      {cell.value === 0 ? '' : format(cell.value)}
                    </motion.span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type Segment = { label: string; value: number; color: string }

// A stacked bar with a legend; each segment grows in.
export function SegmentBar({
  segments,
  className,
  label,
  legend = true,
}: {
  segments: readonly Segment[]
  className?: string
  label: string
  legend?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className={cn('min-w-0', className)}>
      <div
        aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
      >
        {total > 0
          ? segments.map((segment, index) =>
              segment.value > 0 ? (
                <motion.span
                  animate={{ width: `${(segment.value / total) * 100}%` }}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  initial={reduceMotion ? false : { width: 0 }}
                  key={segment.label}
                  style={{ background: segment.color }}
                  transition={{ duration: 0.9, ease, delay: 0.08 * index }}
                />
              ) : null,
            )
          : null}
      </div>
      {legend ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {segments.map((segment) => (
            <li
              className="inline-flex items-center gap-1.5"
              key={segment.label}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: segment.color }}
              />
              <span className="text-muted-foreground">{segment.label}</span>
              <span className="font-mono font-semibold text-foreground tabular-nums">
                {segment.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// A slim arc gauge (0–1) with its value in the middle.
export function ArcGauge({
  value,
  className,
  children,
  color = 'var(--acc)',
}: {
  value: number
  className?: string
  children?: ReactNode
  color?: string
}) {
  const reduceMotion = useReducedMotion()
  const clamped = Math.min(1, Math.max(0, value))
  // A 240° arc, open at the bottom.
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const arc = circumference * (240 / 360)
  return (
    <div className={cn('relative grid place-items-center', className)}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full rotate-[150deg]"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={radius}
          stroke="var(--muted)"
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={7}
        />
        <motion.circle
          animate={{ strokeDasharray: `${arc * clamped} ${circumference}` }}
          cx="50"
          cy="50"
          fill="none"
          initial={
            reduceMotion ? false : { strokeDasharray: `0 ${circumference}` }
          }
          r={radius}
          stroke={color}
          strokeLinecap="round"
          strokeWidth={7}
          transition={{ duration: 1.4, ease, delay: 0.2 }}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  )
}
