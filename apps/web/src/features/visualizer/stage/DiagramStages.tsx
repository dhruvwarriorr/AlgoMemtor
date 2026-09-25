import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

import type { CallTreeView } from '../scene/calls'
import type {
  CellState,
  GraphNodeState,
  GraphView,
  ListView,
  RecordView,
  TreeView,
} from '../scene/types'
import { AnimatedText, PointerTag } from './primitives'
import { cellStateClass } from './styles'

const NODE_RADIUS = 20
// CSS (not Motion) animates colours: they are CSS variables.
const colourTransition =
  'fill 0.25s ease, stroke 0.25s ease, stroke-width 0.2s ease'

const graphFill: Record<GraphNodeState, string> = {
  none: 'var(--go-soft)',
  visited: 'color-mix(in oklab, var(--go) 70%, var(--card))',
  current: 'var(--primary)',
  neighbor: 'color-mix(in oklab, #f59e0b 60%, var(--card))',
  frontier: 'color-mix(in oklab, var(--primary) 22%, var(--card))',
}
const graphStroke: Record<GraphNodeState, string> = {
  none: 'color-mix(in oklab, var(--go) 60%, var(--border))',
  visited: 'var(--go)',
  current: 'var(--primary)',
  neighbor: '#f59e0b',
  frontier: 'var(--primary)',
}
const graphText: Record<GraphNodeState, string> = {
  none: 'var(--go-foreground)',
  visited: '#fff',
  current: 'var(--primary-foreground)',
  neighbor: 'var(--foreground)',
  frontier: 'var(--foreground)',
}

function Svg({
  width,
  height,
  label,
  children,
}: {
  width: number
  height: number
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <svg
        aria-label={label}
        className="mx-auto block max-w-none"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        {children}
      </svg>
    </div>
  )
}

function shortenLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  by: number,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.max(1, Math.hypot(dx, dy))
  return {
    x1: x1 + (dx / length) * by,
    y1: y1 + (dy / length) * by,
    x2: x2 - (dx / length) * by,
    y2: y2 - (dy / length) * by,
  }
}

export function GraphStage({ view }: { view: GraphView }) {
  const reduce = useReducedMotion()
  const byId = new Map(view.nodes.map((node) => [node.id, node]))
  const markerId = `${view.id.replace(/[^\w-]/g, '_')}-arrow`
  const markerActive = `${markerId}-active`
  return (
    <div className="flex flex-col gap-2">
      <Svg
        height={view.height + 16}
        label={`Graph ${view.name}`}
        width={view.width}
      >
        <defs>
          <marker
            id={markerId}
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="9"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--muted-foreground)" />
          </marker>
          <marker
            id={markerActive}
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="9"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#f59e0b" />
          </marker>
        </defs>
        {view.edges.map((edge, index) => {
          const from = byId.get(edge.from)
          const to = byId.get(edge.to)
          if (from === undefined || to === undefined) return null
          if (from === to) {
            return (
              <circle
                cx={from.x + NODE_RADIUS}
                cy={from.y - NODE_RADIUS}
                fill="none"
                key={index}
                r={10}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.5}
              />
            )
          }
          const line = shortenLine(from.x, from.y, to.x, to.y, NODE_RADIUS + 2)
          return (
            <g key={index}>
              <line
                markerEnd={
                  view.directed
                    ? `url(#${edge.active ? markerActive : markerId})`
                    : undefined
                }
                style={{
                  stroke: edge.active ? '#f59e0b' : 'var(--muted-foreground)',
                  strokeWidth: edge.active ? 3 : 1.6,
                  strokeOpacity: edge.active ? 1 : 0.55,
                  transition: colourTransition,
                }}
                x1={line.x1}
                x2={line.x2}
                y1={line.y1}
                y2={line.y2}
              />
              {edge.weight !== undefined ? (
                <text
                  className="fill-foreground font-mono text-[11px] font-semibold"
                  paintOrder="stroke"
                  stroke="var(--card)"
                  strokeWidth={4}
                  textAnchor="middle"
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 4}
                >
                  {edge.weight}
                </text>
              ) : null}
            </g>
          )
        })}
        {view.nodes.map((node) => (
          <g key={node.id}>
            {node.state === 'current' && reduce !== true ? (
              <motion.circle
                animate={{
                  r: [NODE_RADIUS + 3, NODE_RADIUS + 10],
                  opacity: [0.45, 0],
                }}
                cx={node.x}
                cy={node.y}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              />
            ) : null}
            <circle
              cx={node.x}
              cy={node.y}
              r={NODE_RADIUS}
              style={{
                fill: graphFill[node.state],
                stroke: graphStroke[node.state],
                transition: colourTransition,
              }}
              strokeDasharray={node.state === 'frontier' ? '4 3' : undefined}
              strokeWidth={2.2}
            />
            <text
              className="font-mono text-[13px] font-bold"
              dominantBaseline="central"
              style={{
                fill: graphText[node.state],
                transition: colourTransition,
              }}
              textAnchor="middle"
              x={node.x}
              y={node.y}
            >
              {node.label.length > 4
                ? `${node.label.slice(0, 3)}…`
                : node.label}
            </text>
            {node.badge !== undefined ? (
              <text
                className="fill-muted-foreground font-mono text-[10px] font-semibold"
                textAnchor="middle"
                x={node.x}
                y={node.y + NODE_RADIUS + 12}
              >
                {node.badge}
              </text>
            ) : null}
          </g>
        ))}
      </Svg>
      <GraphLegend view={view} />
    </div>
  )
}

function GraphLegend({ view }: { view: GraphView }) {
  const states = new Set(view.nodes.map((node) => node.state))
  const items: [GraphNodeState, string][] = [
    ['current', 'current node'],
    ['neighbor', 'neighbour being checked'],
    ['frontier', 'waiting in the queue/stack'],
    [
      'visited',
      view.visitedSource === undefined
        ? 'visited'
        : `${view.visitedSource}[v] set`,
    ],
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span>
        {view.nodes.length} nodes · {view.edges.length} edges
        {view.directed ? ' · directed' : ''}
      </span>
      {items
        .filter(([state]) => states.has(state))
        .map(([state, label]) => (
          <span className="inline-flex items-center gap-1" key={state}>
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full border"
              style={{
                background: graphFill[state],
                borderColor: graphStroke[state],
              }}
            />
            {label}
          </span>
        ))}
      {view.badgeSource !== undefined ? (
        <span>numbers under nodes: {view.badgeSource}[v]</span>
      ) : null}
    </div>
  )
}

const treeFill: Record<CellState, string> = {
  none: 'var(--go-soft)',
  read: 'color-mix(in oklab, var(--primary) 25%, var(--card))',
  write: 'color-mix(in oklab, #f59e0b 45%, var(--card))',
  changed: 'color-mix(in oklab, #f59e0b 30%, var(--card))',
  new: 'color-mix(in oklab, var(--go) 55%, var(--card))',
}

export function TreeStage({ view }: { view: TreeView }) {
  const byKey = new Map(view.nodes.map((node) => [node.key, node]))
  const width = Math.max(view.width, 120)
  const height = view.height + 30
  return (
    <div className="flex flex-col gap-2">
      <Svg height={height} label={`Tree ${view.name}`} width={width}>
        <g transform="translate(0 16)">
          <AnimatePresence initial={false}>
            {view.edges.map((edge) => {
              const from = byKey.get(edge.from)
              const to = byKey.get(edge.to)
              if (from === undefined || to === undefined) return null
              return (
                <motion.line
                  animate={{
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    opacity: 1,
                  }}
                  exit={{ opacity: 0 }}
                  initial={{
                    x1: from.x,
                    y1: from.y,
                    x2: from.x,
                    y2: from.y,
                    opacity: 0,
                  }}
                  key={`${edge.from}-${edge.to}`}
                  stroke="color-mix(in oklab, var(--foreground) 55%, transparent)"
                  strokeWidth={1.6}
                />
              )
            })}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {view.nodes.map((node) => (
              <motion.g
                animate={{ x: node.x, y: node.y, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                initial={{ x: node.x, y: node.y, opacity: 0, scale: 0.4 }}
                key={node.key}
              >
                <circle
                  r={NODE_RADIUS}
                  stroke="color-mix(in oklab, var(--go) 65%, var(--border))"
                  strokeWidth={2}
                  style={{
                    fill: treeFill[node.state],
                    transition: colourTransition,
                  }}
                />
                <text
                  className="fill-foreground font-mono text-[13px] font-bold"
                  dominantBaseline="central"
                  textAnchor="middle"
                >
                  {node.label.length > 5
                    ? `${node.label.slice(0, 4)}…`
                    : node.label}
                </text>
                {node.badges.length > 0 ? (
                  <text
                    className="fill-muted-foreground font-mono text-[9.5px] font-semibold"
                    textAnchor="middle"
                    y={NODE_RADIUS + 11}
                  >
                    {node.badges.join(' ')}
                  </text>
                ) : null}
                {node.pointers.length > 0 ? (
                  <g transform={`translate(0 ${-NODE_RADIUS - 11})`}>
                    <rect
                      fill="var(--primary)"
                      height={16}
                      rx={4}
                      width={node.pointers.join(', ').length * 6.6 + 10}
                      x={-(node.pointers.join(', ').length * 6.6 + 10) / 2}
                      y={-9}
                    />
                    <text
                      className="font-mono text-[10.5px] font-semibold"
                      dominantBaseline="central"
                      fill="var(--primary-foreground)"
                      textAnchor="middle"
                    >
                      {node.pointers.join(', ')}
                    </text>
                  </g>
                ) : null}
              </motion.g>
            ))}
          </AnimatePresence>
        </g>
      </Svg>
      <p className="text-[11px] text-muted-foreground">
        {view.nodes.length} node{view.nodes.length === 1 ? '' : 's'} · labels
        show which variables point at a node
      </p>
    </div>
  )
}

export function ListStage({ view }: { view: ListView }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max items-center pt-7">
        <AnimatePresence initial={false} mode="popLayout">
          {view.nodes.map((node, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center"
              exit={{ opacity: 0, y: 12 }}
              initial={{ opacity: 0, y: 12 }}
              key={node.key}
              layout
            >
              <div className="relative flex flex-col items-center">
                {node.pointers.length > 0 ? (
                  <div className="absolute -top-7 left-0 flex gap-1 whitespace-nowrap">
                    {node.pointers.map((name) => (
                      <motion.span
                        key={name}
                        layoutId={`${view.id}:ptr:${name}`}
                      >
                        <PointerTag name={name} />
                      </motion.span>
                    ))}
                  </div>
                ) : null}
                <div
                  className={cn(
                    'flex h-12 items-stretch overflow-hidden rounded-xl border-2 font-mono text-sm font-semibold shadow-soft transition-colors',
                    node.state === 'none'
                      ? 'border-go/50 bg-go-soft text-go-foreground'
                      : cellStateClass[node.state],
                  )}
                >
                  <span className="grid min-w-11 place-items-center px-2.5">
                    <AnimatedText text={node.label} />
                  </span>
                  <span className="grid w-6 place-items-center border-l-2 border-current/20 bg-black/[0.04] dark:bg-white/[0.05]">
                    <span className="size-1.5 rounded-full bg-current" />
                  </span>
                </div>
                {node.badges.length > 0 ? (
                  <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {node.badges.join(' ')}
                  </span>
                ) : null}
              </div>
              {index < view.nodes.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="mx-1 flex w-9 items-center text-muted-foreground"
                >
                  <svg height="14" viewBox="0 0 36 14" width="36">
                    {view.doubly ? (
                      <>
                        <path
                          d="M2 4 H32 M27 1 L33 4 L27 7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M34 10 H4 M9 7 L3 10 L9 13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </>
                    ) : (
                      <path
                        d="M2 7 H32 M26 3 L33 7 L26 11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    )}
                  </svg>
                </span>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
        <span
          aria-hidden="true"
          className="mx-1 flex w-9 items-center text-muted-foreground"
        >
          <svg height="14" viewBox="0 0 36 14" width="36">
            <path
              d="M2 7 H32 M26 3 L33 7 L26 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </span>
        <span className="rounded-md border border-dashed border-border px-2 py-1 font-mono text-xs text-muted-foreground">
          {view.more
            ? '…'
            : view.cycleTo !== null
              ? `↺ node ${view.cycleTo}`
              : 'null'}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {view.nodes.length} node{view.nodes.length === 1 ? '' : 's'}
        {view.doubly ? ' · doubly linked' : ''}
        {view.cycleTo !== null ? ' · the last node links back: a cycle' : ''}
      </p>
    </div>
  )
}

export function RecordStage({ view }: { view: RecordView }) {
  return (
    <dl className="grid gap-1.5 sm:grid-cols-2">
      {view.fields.map((field) => (
        <div
          className="flex min-w-0 items-baseline gap-2 rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5"
          key={field.name}
        >
          <dt className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
            {field.name}
          </dt>
          <dd
            className="min-w-0 truncate font-mono text-xs text-foreground"
            title={field.text}
          >
            <AnimatedText text={field.text} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

const callFill = {
  current: 'var(--primary)',
  active: 'color-mix(in oklab, var(--primary) 18%, var(--card))',
  returned: 'var(--go-soft)',
  waiting: 'var(--card)',
}

export function CallTreeStage({
  view,
  onSelect,
}: {
  view: CallTreeView
  onSelect?: (frame: number) => void
}) {
  const boxWidth = 96
  const width = Math.max(view.width, 160)
  return (
    <div className="flex flex-col gap-2">
      <Svg height={view.height + 30} label="Recursion tree" width={width}>
        <g transform="translate(0 18)">
          {view.edges.map((edge) => {
            const from = view.nodes.find((node) => node.frame === edge.from)
            const to = view.nodes.find((node) => node.frame === edge.to)
            if (from === undefined || to === undefined) return null
            return (
              <motion.line
                animate={{
                  x1: from.x,
                  y1: from.y + 13,
                  x2: to.x,
                  y2: to.y - 13,
                }}
                initial={false}
                key={`${edge.from}-${edge.to}`}
                stroke="color-mix(in oklab, var(--foreground) 40%, transparent)"
                strokeWidth={1.4}
              />
            )
          })}
          <AnimatePresence initial={false}>
            {view.nodes.map((node) => (
              <motion.g
                animate={{ x: node.x, y: node.y, opacity: 1 }}
                className={
                  onSelect === undefined ? undefined : 'cursor-pointer'
                }
                exit={{ opacity: 0 }}
                initial={{ x: node.x, y: node.y - 16, opacity: 0 }}
                key={node.frame}
                onClick={() => onSelect?.(node.frame)}
              >
                <rect
                  height={26}
                  rx={8}
                  style={{
                    fill: callFill[node.state],
                    transition: colourTransition,
                  }}
                  stroke={
                    node.state === 'current' || node.state === 'active'
                      ? 'var(--primary)'
                      : node.state === 'returned'
                        ? 'color-mix(in oklab, var(--go) 55%, var(--border))'
                        : 'var(--border)'
                  }
                  strokeDasharray={node.state === 'waiting' ? '3 3' : undefined}
                  strokeWidth={1.6}
                  width={boxWidth}
                  x={-boxWidth / 2}
                  y={-13}
                />
                <text
                  className="font-mono text-[10.5px] font-semibold"
                  dominantBaseline="central"
                  fill={
                    node.state === 'current'
                      ? 'var(--primary-foreground)'
                      : 'var(--foreground)'
                  }
                  textAnchor="middle"
                >
                  {node.label.length > 16
                    ? `${node.label.slice(0, 15)}…`
                    : node.label}
                </text>
                {node.value !== null ? (
                  <text
                    className="fill-go-foreground font-mono text-[10px] font-bold"
                    textAnchor="middle"
                    y={25}
                  >
                    = {node.value}
                  </text>
                ) : null}
                <title>
                  {node.label}
                  {node.value !== null ? ` returned ${node.value}` : ''}
                </title>
              </motion.g>
            ))}
          </AnimatePresence>
        </g>
      </Svg>
      <p className="text-[11px] text-muted-foreground">
        Every call so far. Blue: running now · green: returned, with its value
        {view.hidden > 0 ? ` · ${view.hidden} later calls not drawn` : ''}
      </p>
    </div>
  )
}

export { AnimatedText }
